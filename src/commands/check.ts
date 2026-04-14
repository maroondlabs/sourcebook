import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import chalk from "chalk";
import Anthropic from "@anthropic-ai/sdk";
import { scanProject } from "../scanner/index.js";
import { getFullCoChangePairs } from "../scanner/git.js";
import type { ProjectScan } from "../types.js";

interface CheckOptions {
  dir: string;
  ai?: boolean;
  json?: boolean;
  quiet?: boolean;
  branch?: string;
  threshold?: number;
}

interface LayerAWarning {
  file: string;
  confidence: "high" | "medium" | "low";
  reasoning: string;
  signal: "co-change" | "import" | "test";
}

interface AISuggestion {
  file: string;
  confidence: "high" | "medium" | "low";
  reasoning: string;
}

const SOURCE_EXTS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".rb", ".java", ".swift", ".kt",
]);

function git(dir: string, args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: dir,
      stdio: "pipe",
      maxBuffer: 10 * 1024 * 1024,
    }).toString();
  } catch {
    return "";
  }
}

function getModifiedFiles(dir: string, branch?: string): string[] {
  if (branch) {
    const diff = git(dir, ["diff", "--name-only", `${branch}...HEAD`]);
    return diff.split("\n").filter(Boolean).filter((f) => SOURCE_EXTS.has(path.extname(f).toLowerCase()));
  }
  // Collect staged + unstaged changes vs HEAD
  const staged = git(dir, ["diff", "--name-only", "--staged"]);
  const unstaged = git(dir, ["diff", "--name-only"]);
  const all = new Set(
    [...staged.split("\n"), ...unstaged.split("\n")].filter(Boolean)
  );
  return [...all].filter((f) => SOURCE_EXTS.has(path.extname(f).toLowerCase()));
}

/**
 * Extract diff hunk headers and changed function/class signatures for a file.
 * Returns only @@ lines and lines that look like function/class declarations.
 * Keeps token count low by excluding full diff content.
 */
function getDiffHunkHeaders(dir: string, file: string): string {
  const diff = git(dir, ["diff", "HEAD", "--unified=0", "--", file]);
  if (!diff) {
    // If no HEAD yet, try staged
    const staged = git(dir, ["diff", "--staged", "--unified=0", "--", file]);
    if (!staged) return "";
    return extractHunks(staged);
  }
  return extractHunks(diff);
}

function extractHunks(diff: string): string {
  const lines = diff.split("\n");
  const result: string[] = [];
  for (const line of lines) {
    if (line.startsWith("@@")) {
      result.push(line);
    } else if (
      line.startsWith("+") &&
      !line.startsWith("+++") &&
      (line.includes("function ") ||
        line.includes("def ") ||
        line.includes("func ") ||
        line.includes("class ") ||
        line.includes("export ") ||
        line.includes("async ") ||
        line.includes("pub fn ") ||
        line.includes("fn "))
    ) {
      result.push(line.substring(0, 120));
    }
  }
  return sanitizeForApi(result.slice(0, 20).join("\n"));
}

function getDirectoryListing(repoPath: string, filePath: string, depth = 2): string {
  const fileDir = path.join(repoPath, path.dirname(filePath));
  if (!fs.existsSync(fileDir)) return "";

  function listDir(d: string, currentDepth: number, prefix = ""): string[] {
    if (currentDepth > depth) return [];
    try {
      const entries = fs.readdirSync(d).slice(0, 25);
      const lines: string[] = [];
      for (const entry of entries) {
        if (entry.startsWith(".") || entry === "node_modules" || entry === "dist" || entry === "__pycache__") continue;
        const full = path.join(d, entry);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          lines.push(`${prefix}${entry}/`);
          lines.push(...listDir(full, currentDepth + 1, prefix + "  "));
        } else {
          lines.push(`${prefix}${entry}`);
        }
      }
      return lines;
    } catch {
      return [];
    }
  }

  return listDir(fileDir, 1).slice(0, 35).join("\n");
}

function getFilePreview(repoPath: string, file: string, lineCount = 20): string {
  try {
    const content = fs.readFileSync(path.join(repoPath, file), "utf-8");
    return sanitizeForApi(content.split("\n").slice(0, lineCount).join("\n"));
  } catch {
    return "";
  }
}

/**
 * Strip non-ASCII characters that cause ByteString errors in Node's fetch API.
 * Replaces common Unicode punctuation with ASCII equivalents; drops the rest.
 */
function sanitizeForApi(text: string): string {
  return text
    .replace(/[\u2014\u2013]/g, "-")   // em dash, en dash → -
    .replace(/[\u2018\u2019]/g, "'")   // curly single quotes → '
    .replace(/[\u201c\u201d]/g, '"')   // curly double quotes → "
    .replace(/[\u2026]/g, "...")       // ellipsis → ...
    .replace(/[^\x00-\x7F]/g, "?");   // everything else → ?
}

// ── Layer A: rules-based analysis ──────────────────────────────────────────

function runLayerA(
  modifiedFiles: string[],
  scan: ProjectScan,
  coChangePairs: { fileA: string; fileB: string; count: number; strength: number }[]
): LayerAWarning[] {
  const warnings: LayerAWarning[] = [];
  const modifiedSet = new Set(modifiedFiles);
  const warned = new Set<string>();

  const edges = scan.edges ?? [];
  const importedBy = new Map<string, Set<string>>();
  const imports = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!importedBy.has(edge.to)) importedBy.set(edge.to, new Set());
    importedBy.get(edge.to)!.add(edge.from);
    if (!imports.has(edge.from)) imports.set(edge.from, new Set());
    imports.get(edge.from)!.add(edge.to);
  }

  for (const file of modifiedFiles) {
    // Signal 1: co-change partners not in the diff
    for (const pair of coChangePairs) {
      let partner: string | null = null;
      if (pair.fileA === file) partner = pair.fileB;
      else if (pair.fileB === file) partner = pair.fileA;

      if (partner && !modifiedSet.has(partner) && !warned.has(partner)) {
        const confidence =
          pair.strength >= 0.5 ? "high" : pair.strength >= 0.3 ? "medium" : "low";
        warnings.push({
          file: partner,
          confidence,
          reasoning: `co-changes with ${path.basename(file)} in ${pair.count} commits (${(pair.strength * 100).toFixed(0)}% coupling)`,
          signal: "co-change",
        });
        warned.add(partner);
      }
    }

    // Signal 2: hub files that import this file (high fan-in = wide impact)
    const importers = importedBy.get(file);
    if (importers) {
      for (const importer of importers) {
        if (!modifiedSet.has(importer) && !warned.has(importer)) {
          const fanIn = importedBy.get(importer)?.size ?? 0;
          if (fanIn >= 5) {
            warnings.push({
              file: importer,
              confidence: "medium",
              reasoning: `imports ${path.basename(file)} and is a high-fanin hub (${fanIn} dependents)`,
              signal: "import",
            });
            warned.add(importer);
          }
        }
      }
    }

    // Signal 3: corresponding test file not in the diff
    const ext = path.extname(file);
    const base = path.basename(file, ext);
    const dir_ = path.dirname(file);
    const testCandidates = [
      `${dir_}/${base}.test${ext}`,
      `${dir_}/${base}.spec${ext}`,
      `${dir_}/__tests__/${base}.test${ext}`,
      `tests/${base}_test${ext}`,
      `test/${base}_test.py`,
      `${dir_}/${base}_test.go`,
      `${dir_}/${base}_test.rs`,
    ];
    for (const tp of testCandidates) {
      if (scan.files.includes(tp) && !modifiedSet.has(tp) && !warned.has(tp)) {
        warnings.push({
          file: tp,
          confidence: "medium",
          reasoning: `test file for ${path.basename(file)} not in diff`,
          signal: "test",
        });
        warned.add(tp);
        break;
      }
    }
  }

  // Sort: high → medium → low
  const order = { high: 0, medium: 1, low: 2 };
  return warnings.sort((a, b) => order[a.confidence] - order[b.confidence]);
}

// ── Layer B: AI analysis ───────────────────────────────────────────────────

async function runLayerB(
  modifiedFiles: string[],
  repoPath: string,
  scan: ProjectScan,
  coChangePairs: { fileA: string; fileB: string; count: number; strength: number }[]
): Promise<{ suggestions: AISuggestion[]; tokenUsage: { input: number; output: number } }> {
  const client = new Anthropic();

  const edges = scan.edges ?? [];
  const importedBy = new Map<string, Set<string>>();
  const imports = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!importedBy.has(edge.to)) importedBy.set(edge.to, new Set());
    importedBy.get(edge.to)!.add(edge.from);
    if (!imports.has(edge.from)) imports.set(edge.from, new Set());
    imports.get(edge.from)!.add(edge.to);
  }

  const modifiedSet = new Set(modifiedFiles);

  // ── Build prompt sections ──────────────────────────────────────────────

  // Section 1: changed files with diff hunk headers
  const changedSection: string[] = ["## Changed files"];
  for (const file of modifiedFiles.slice(0, 10)) {
    changedSection.push(`\n### ${file}`);
    const hunks = getDiffHunkHeaders(repoPath, file);
    if (hunks) changedSection.push(hunks);
  }

  // Section 2: repository context
  const contextLines: string[] = ["\n## Repository context"];

  // Import neighbors
  const importNeighbors = new Set<string>();
  for (const file of modifiedFiles) {
    const deps = imports.get(file);
    if (deps) for (const d of deps) if (!modifiedSet.has(d)) importNeighbors.add(d);
    const importers = importedBy.get(file);
    if (importers) for (const i of importers) if (!modifiedSet.has(i)) importNeighbors.add(i);
  }

  if (importNeighbors.size > 0) {
    contextLines.push("\n### Import neighbors");
    for (const n of [...importNeighbors].slice(0, 15)) {
      contextLines.push(`- ${n}`);
    }
  }

  // Co-change candidates (ALL including low-percentage ones — hints for the AI)
  const coChangeCandidates = new Map<
    string,
    { count: number; strength: number; partner: string }
  >();
  for (const file of modifiedFiles) {
    for (const pair of coChangePairs) {
      let partner: string | null = null;
      if (pair.fileA === file) partner = pair.fileB;
      else if (pair.fileB === file) partner = pair.fileA;
      if (partner && !modifiedSet.has(partner)) {
        const existing = coChangeCandidates.get(partner);
        if (!existing || existing.strength < pair.strength) {
          coChangeCandidates.set(partner, {
            count: pair.count,
            strength: pair.strength,
            partner: file,
          });
        }
      }
    }
  }

  if (coChangeCandidates.size > 0) {
    contextLines.push("\n### Co-change history");
    for (const [file, { count, strength, partner }] of [
      ...coChangeCandidates.entries(),
    ].slice(0, 15)) {
      contextLines.push(
        `- ${file}: co-changes with ${path.basename(partner)} (${count}x, ${(strength * 100).toFixed(0)}% coupling)`
      );
    }
  }

  // Directory structure around changed files (2 levels deep)
  const seenDirs = new Set<string>();
  contextLines.push("\n### Directory structure");
  for (const file of modifiedFiles.slice(0, 5)) {
    const fileDir = path.dirname(file);
    if (!seenDirs.has(fileDir)) {
      seenDirs.add(fileDir);
      contextLines.push(`\n${fileDir}/`);
      const listing = getDirectoryListing(repoPath, file);
      if (listing) contextLines.push(listing);
    }
  }

  // First 20 lines of top 10 related files
  const relatedFiles = [
    ...new Set([...importNeighbors, ...[...coChangeCandidates.keys()]]),
  ].slice(0, 10);

  if (relatedFiles.length > 0) {
    contextLines.push("\n### Related file summaries (imports/docstrings)");
    for (const rf of relatedFiles) {
      const preview = getFilePreview(repoPath, rf);
      if (preview) {
        contextLines.push(`\n#### ${rf}`);
        contextLines.push("```");
        contextLines.push(preview);
        contextLines.push("```");
      }
    }
  }

  const userPrompt = [
    changedSection.join("\n"),
    contextLines.join("\n"),
    "\n## Task",
    "What files likely need corresponding updates but are not in this diff? Return as JSON:",
    "[",
    "  {",
    '    "file": "path/to/file.ts",',
    '    "confidence": "high|medium|low",',
    '    "reasoning": "one sentence explaining why"',
    "  }",
    "]",
    "Return an empty array if no files appear to be missing.",
  ].join("\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 500,
    system:
      "You analyze code changes for completeness. Given a diff and repository context, identify files that likely need updates but weren't modified. Only suggest files with clear reasoning. Rank by confidence (high/medium/low). Return JSON only.",
    messages: [{ role: "user", content: userPrompt }],
  });

  const rawText =
    response.content[0].type === "text" ? response.content[0].text : "";

  let suggestions: AISuggestion[] = [];
  try {
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      suggestions = JSON.parse(jsonMatch[0]);
    }
  } catch {
    // If parse fails, return empty — don't crash the whole command
  }

  return {
    suggestions,
    tokenUsage: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
  };
}

// ── Main command ───────────────────────────────────────────────────────────

export async function check(options: CheckOptions): Promise<void> {
  const repoPath = path.resolve(options.dir);
  const silent = options.quiet || false;

  if (!options.json && !silent) {
    console.log(chalk.bold("\nsourcebook check"));
    console.log(chalk.dim("Analyzing diff for completeness...\n"));
  }

  const modifiedFiles = getModifiedFiles(repoPath, options.branch);

  if (modifiedFiles.length === 0) {
    if (options.json) {
      console.log(JSON.stringify({ modifiedFiles: [], warnings: [], ai: [] }, null, 2));
    } else if (!silent) {
      console.log(chalk.yellow("No modified source files found in working tree."));
      console.log(chalk.dim("Make some changes first, then run sourcebook check."));
    }
    return;
  }

  if (!options.json && !silent) {
    console.log(
      chalk.green("✓") +
        ` Modified: ${modifiedFiles.map((f) => chalk.cyan(f)).join(", ")}`
    );
    console.log(chalk.dim("Running Layer A (rules-based)..."));
  }

  const [scan, rawCoChangePairs] = await Promise.all([
    scanProject(repoPath),
    Promise.resolve(getFullCoChangePairs(repoPath)),
  ]);

  const threshold = options.threshold ?? 0;
  const coChangePairs = threshold > 0
    ? rawCoChangePairs.filter((p) => p.strength >= threshold)
    : rawCoChangePairs;

  const warnings = runLayerA(modifiedFiles, scan, coChangePairs);

  let aiSuggestions: AISuggestion[] = [];
  let tokenUsage: { input: number; output: number } | undefined;

  if (options.ai) {
    if (!options.json && !silent) {
      console.log(chalk.dim("Running Layer B (AI analysis)..."));
    }
    try {
      const result = await runLayerB(modifiedFiles, repoPath, scan, coChangePairs);
      aiSuggestions = result.suggestions;
      tokenUsage = result.tokenUsage;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (options.json) {
        console.error(`AI analysis failed: ${msg}`);
      } else if (!silent) {
        console.error(chalk.red(`\nAI analysis failed: ${msg}`));
        if (msg.includes("API key") || msg.includes("ANTHROPIC")) {
          console.error(
            chalk.dim("Set ANTHROPIC_API_KEY environment variable to use --ai")
          );
        }
      }
    }
  }

  const hasFindings = warnings.length > 0 || (options.ai && aiSuggestions.length > 0);

  // ── Quiet mode: exit code only ───────────────────────────────────────────
  if (silent) {
    process.exit(hasFindings ? 1 : 0);
  }

  // ── JSON output ──────────────────────────────────────────────────────────
  if (options.json) {
    const output: Record<string, unknown> = { modifiedFiles, warnings };
    if (options.ai) output.ai = aiSuggestions;
    if (tokenUsage) output.tokenUsage = tokenUsage;
    console.log(JSON.stringify(output, null, 2));
    process.exit(hasFindings ? 1 : 0);
  }

  // ── Pretty output ────────────────────────────────────────────────────────
  console.log("");

  if (!hasFindings) {
    console.log(chalk.green("✓ No missing updates detected."));
    if (options.ai) console.log(chalk.dim("AI also found nothing to flag."));
    return;
  }

  if (warnings.length > 0) {
    console.log(chalk.bold("── Layer A: Rules-based ─────────────────────────────────\n"));
    for (const w of warnings) {
      const icon =
        w.confidence === "high"
          ? chalk.red("⚠")
          : w.confidence === "medium"
          ? chalk.yellow("⚠")
          : chalk.dim("⚠");
      console.log(`${icon} ${chalk.bold(w.confidence.toUpperCase())}: ${chalk.cyan(w.file)}`);
      console.log(`   → ${w.reasoning}`);
      console.log("");
    }
  }

  if (options.ai) {
    console.log(chalk.bold("── AI Analysis ──────────────────────────────────────────\n"));
    if (aiSuggestions.length === 0) {
      console.log(chalk.dim("No additional files identified.\n"));
    } else {
      for (const s of aiSuggestions) {
        const icon =
          s.confidence === "high" ? "🔍" : s.confidence === "medium" ? "🔍" : "🔍";
        console.log(
          `${icon} ${chalk.bold(s.confidence.toUpperCase())}: ${chalk.cyan(s.file)}`
        );
        console.log(`   → ${s.reasoning}`);
        console.log("");
      }
    }
    if (tokenUsage) {
      // claude-sonnet-4-5: $3/MTok input, $15/MTok output
      const cost = (
        (tokenUsage.input * 3 + tokenUsage.output * 15) /
        1_000_000
      ).toFixed(4);
      console.log(
        chalk.dim(
          `Token usage: ${tokenUsage.input.toLocaleString()} input / ${tokenUsage.output.toLocaleString()} output (~$${cost})`
        )
      );
    }
  }
}
