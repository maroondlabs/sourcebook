import path from "node:path";
import chalk from "chalk";
import { scanProject } from "../scanner/index.js";
import { getFullCoChangePairs } from "../scanner/git.js";
import type { ProjectScan } from "../types.js";

type ImportEdge = { from: string; to: string };

interface PreflightOptions {
  dir: string;
  json?: boolean;
}

export interface CompanionSuggestion {
  file: string;
  reason: string;
  confidence: number; // 0-1
  signals: string[];
}

export interface PreflightResult {
  primaryFiles: string[];
  companions: CompanionSuggestion[];
  briefing: string;
}

/**
 * Analyze a task description against the repo's structural signals
 * and suggest companion files the agent should inspect.
 *
 * Signals used:
 * 1. Co-change coupling — files that historically change together
 * 2. Import graph neighbors — direct importers/importees of mentioned files
 * 3. Hub detection — high fan-in files where changes propagate widely
 */
/**
 * File-based preflight: given a specific file being edited,
 * find companion files that likely need co-changes.
 * This is the mode used by Claude Code hooks (PreToolUse on Edit/Write).
 */
export async function preflightForFile(
  filePath: string,
  options: PreflightOptions
): Promise<CompanionSuggestion[]> {
  const targetDir = path.resolve(options.dir);
  const scan = await scanProject(targetDir);
  const fullCoChangePairs = getFullCoChangePairs(targetDir);
  const edges = scan.edges ?? [];

  // Normalize the file path relative to repo root
  const relFile = path.relative(targetDir, path.resolve(targetDir, filePath));

  const fanIn = buildFanIn(edges);
  const importedBy = buildImportedBy(edges);
  const imports = buildImports(edges);
  const companionScores = new Map<string, { score: number; signals: string[] }>();

  // Signal 1: Co-change coupling (including same-directory)
  for (const { fileA, fileB, count, strength } of fullCoChangePairs) {
    let companion: string | null = null;
    if (fileA === relFile) companion = fileB;
    else if (fileB === relFile) companion = fileA;
    if (companion && !isTestFile(companion)) {
      const coChangeScore = Math.min(strength * 0.8, 0.6);
      addCompanion(companionScores, companion, coChangeScore,
        `co-changes with ${path.basename(relFile)} (${count}x, ${(strength * 100).toFixed(0)}% coupling)`);
    }
  }

  // Signal 2: Same-directory siblings with import relationship
  const fileDir = path.dirname(relFile);
  const siblings = scan.files.filter(
    (f) => path.dirname(f) === fileDir && f !== relFile && isSourceFile(f) && !isTestFile(f)
  );
  for (const sibling of siblings) {
    const hasImport =
      imports.get(relFile)?.has(sibling) || imports.get(sibling)?.has(relFile) ||
      importedBy.get(relFile)?.has(sibling) || importedBy.get(sibling)?.has(relFile);
    if (hasImport) {
      addCompanion(companionScores, sibling, 0.4,
        `import-linked sibling of ${path.basename(relFile)}`);
    }
  }

  // Signal 3: Direct imports (files this file depends on)
  const directImports = imports.get(relFile);
  if (directImports) {
    for (const dep of directImports) {
      if (!isTestFile(dep) && path.basename(dep) !== "__init__.py") {
        addCompanion(companionScores, dep, 0.25, `imported by ${path.basename(relFile)}`);
      }
    }
  }

  // Signal 4: Direct importers (files that depend on this file)
  const directImporters = importedBy.get(relFile);
  if (directImporters) {
    for (const importer of directImporters) {
      if (!isTestFile(importer) && path.basename(importer) !== "__init__.py") {
        const hubBonus = (fanIn.get(importer) ?? 0) >= 5 ? 0.1 : 0;
        addCompanion(companionScores, importer, 0.2 + hubBonus, `imports ${path.basename(relFile)}`);
      }
    }
  }

  // Signal 5: Filename prefix/suffix pattern matching
  // Catches: node_resource_plan.go ↔ node_resource_plan_instance.go
  const relBasename = path.basename(relFile).replace(/\.[^.]+$/, "");
  for (const sibling of siblings) {
    if (companionScores.has(sibling)) continue; // already scored
    const sibBasename = path.basename(sibling).replace(/\.[^.]+$/, "");
    // Check if one name is a prefix of the other (with _ or camelCase boundary)
    const longer = relBasename.length > sibBasename.length ? relBasename : sibBasename;
    const shorter = relBasename.length > sibBasename.length ? sibBasename : relBasename;
    if (
      shorter.length >= 4 &&
      longer.startsWith(shorter) &&
      (longer[shorter.length] === "_" || longer[shorter.length] === longer[shorter.length]?.toUpperCase())
    ) {
      addCompanion(companionScores, sibling, 0.4,
        `naming pattern: ${sibBasename} shares prefix with ${relBasename}`);
    }
  }

  // Signal 6: Same-directory siblings declared in same module file
  // Catches Rust: source.rs + utils.rs both declared in mod.rs
  // Catches Go: files in the same package directory
  const ext = path.extname(relFile).toLowerCase();
  if (ext === ".rs" || ext === ".go") {
    for (const sibling of siblings) {
      if (companionScores.has(sibling)) continue;
      // For Rust/Go: same-directory source files are in the same module/package
      // This is a strong co-change signal even without explicit imports
      addCompanion(companionScores, sibling, 0.35,
        `same ${ext === ".rs" ? "Rust module" : "Go package"} as ${path.basename(relFile)}`);
    }
  }

  // Signal 7: Second-degree imports via facade (__init__.py, mod.rs, index.ts)
  // If the primary file imports a facade, check what the facade re-exports
  const facadePatterns = ["__init__.py", "mod.rs", "index.ts", "index.js"];
  if (directImports) {
    for (const dep of directImports) {
      if (facadePatterns.includes(path.basename(dep))) {
        // This is a facade — check what it imports in the same directory
        const facadeDir = path.dirname(dep);
        const facadeImports = imports.get(dep);
        if (facadeImports) {
          for (const reexport of facadeImports) {
            if (
              path.dirname(reexport) === facadeDir &&
              !companionScores.has(reexport) &&
              !isTestFile(reexport) &&
              reexport !== relFile
            ) {
              addCompanion(companionScores, reexport, 0.3,
                `re-exported by ${path.basename(dep)} (facade in ${path.basename(facadeDir)}/)`);
            }
          }
        }
      }
    }
  }

  return [...companionScores.entries()]
    .map(([file, { score, signals }]) => ({
      file,
      reason: signals[0],
      confidence: Math.min(score, 1),
      signals,
    }))
    .filter((c) => c.confidence >= 0.3)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
}

export async function preflight(
  taskText: string,
  options: PreflightOptions
): Promise<PreflightResult> {
  const targetDir = path.resolve(options.dir);

  if (!options.json) {
    console.log(chalk.bold("\nsourcebook preflight"));
    console.log(chalk.dim("Analyzing task against repo structure...\n"));
  }

  const scan = await scanProject(targetDir);

  // Get full co-change pairs (including same-directory) for preflight analysis
  const fullCoChangePairs = getFullCoChangePairs(targetDir);

  if (!options.json) {
    console.log(
      chalk.green("✓") +
        ` Scanned: ${scan.files.length} files, ${(scan.edges ?? []).length} import edges, ${fullCoChangePairs.length} co-change pairs`
    );
  }

  const result = analyzeTask(taskText, scan, fullCoChangePairs);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printBriefing(result);
  }

  return result;
}

/**
 * Core analysis: match task text against repo signals to find companion files.
 */
export function analyzeTask(
  taskText: string,
  scan: ProjectScan,
  fullCoChangePairs?: { fileA: string; fileB: string; count: number; strength: number }[]
): PreflightResult {
  const textLower = taskText.toLowerCase();
  const edges = scan.edges ?? [];
  const rankedFiles = scan.rankedFiles ?? [];
  const coChangePairs = fullCoChangePairs ?? [];

  // Step 1: Identify "primary" files — files mentioned or strongly implied by the task
  const primaryFiles = identifyPrimaryFiles(textLower, scan.files);

  // Step 2: Build lookup structures
  const fanIn = buildFanIn(edges);
  const importedBy = buildImportedBy(edges);
  const imports = buildImports(edges);

  // Step 3: For each primary file, find companions via three signals
  const companionScores = new Map<string, { score: number; signals: string[] }>();

  for (const primary of primaryFiles) {
    // Signal 1: Co-change coupling (including same-directory pairs)
    for (const { fileA, fileB, count, strength } of coChangePairs) {
      let companion: string | null = null;
      if (fileA === primary) companion = fileB;
      else if (fileB === primary) companion = fileA;
      if (companion && !primaryFiles.includes(companion) && !isTestFile(companion)) {
        // Weight by Jaccard strength — higher strength = more likely to need co-change
        const coChangeScore = Math.min(strength * 0.6, 0.5);
        addCompanion(companionScores, companion, coChangeScore, `co-changes with ${path.basename(primary)} (${count}x, ${(strength * 100).toFixed(0)}% coupling)`);
      }
    }

    // Signal 2: Same-directory co-change (the actual failure pattern from benchmarks)
    // The existing co-change detection skips same-directory files.
    // But our benchmark data shows same-dir misses ARE the problem.
    // Use import graph + directory proximity instead.
    const primaryDir = path.dirname(primary);
    const sameDirFiles = scan.files.filter(
      (f) =>
        path.dirname(f) === primaryDir &&
        f !== primary &&
        isSourceFile(f) &&
        !isTestFile(f)
    );

    for (const sibling of sameDirFiles) {
      // Check if sibling imports primary or primary imports sibling
      const hasImportRelation =
        imports.get(primary)?.has(sibling) ||
        imports.get(sibling)?.has(primary) ||
        importedBy.get(primary)?.has(sibling) ||
        importedBy.get(sibling)?.has(primary);

      if (hasImportRelation && !primaryFiles.includes(sibling)) {
        addCompanion(
          companionScores,
          sibling,
          0.3,
          `imports linked to ${path.basename(primary)} (same directory)`
        );
      }
    }

    // Signal 3: Import graph — direct importers that also might need updating
    const directImporters = importedBy.get(primary);
    if (directImporters) {
      for (const importer of directImporters) {
        if (!primaryFiles.includes(importer) && !isTestFile(importer)) {
          const hubBonus = (fanIn.get(importer) ?? 0) >= 5 ? 0.1 : 0;
          const primaryModule = primary.split("/").slice(0, 3).join("/");
          const importerModule = importer.split("/").slice(0, 3).join("/");
          const sameModule = primaryModule === importerModule;
          const baseScore = sameModule ? 0.2 : 0.15;
          addCompanion(
            companionScores,
            importer,
            baseScore + hubBonus,
            `imports ${path.basename(primary)}`
          );
        }
      }
    }

    // Signal 4: Files that primary imports — if we're changing primary,
    // the files it depends on might need corresponding changes.
    // Score based on how likely the import is to need co-changes:
    // - __init__.py facades: low signal (usually just re-exports)
    // - Implementation files within task-relevant modules: high signal
    // - Generic utility imports: lower signal
    const directImports = imports.get(primary);
    if (directImports) {
      for (const dep of directImports) {
        if (!primaryFiles.includes(dep) && !isTestFile(dep)) {
          const isInit = path.basename(dep) === "__init__.py";
          // Check if dep filename OR directory path relates to task keywords
          const depBasename = path.basename(dep).replace(/\.[^.]+$/, "").toLowerCase();
          const depPath = dep.toLowerCase();
          const taskRelevant = isFileNameTaskRelevant(depBasename, textLower) ||
            isPathTaskRelevant(depPath, textLower);
          const score = isInit ? 0.1 : taskRelevant ? 0.4 : 0.2;
          addCompanion(
            companionScores,
            dep,
            score,
            `imported by ${path.basename(primary)}${taskRelevant ? " (task-relevant)" : ""}`
          );
        }
      }
    }
  }

  // Signal 5: Keyword-to-filename matching
  // Extract meaningful multi-word phrases from the task and match against
  // filenames. Catches cases like "Galaxy API proxy" → galaxy_api_proxy.py
  const keywordMatches = matchKeywordsToFiles(textLower, scan.files, primaryFiles);
  for (const { file, matchedKeywords } of keywordMatches) {
    if (!isTestFile(file)) {
      addCompanion(companionScores, file, 0.35, `filename matches task keywords: "${matchedKeywords}"`);
    }
  }

  // Signal 6: Import graph neighbors of companions (second-degree)
  // If a companion imports files in the same directory, those are likely related.
  // This catches the pattern: primary→__init__.py→galaxy_api_proxy.py
  const firstDegreeCompanions = [...companionScores.keys()];
  for (const companion of firstDegreeCompanions) {
    const companionDir = path.dirname(companion);
    const companionImports = imports.get(companion);
    if (companionImports) {
      for (const dep of companionImports) {
        if (
          path.dirname(dep) === companionDir &&
          !primaryFiles.includes(dep) &&
          !isTestFile(dep)
        ) {
          // Boost if task-relevant, lower for generic sibling imports
          const depBasename = path.basename(dep).replace(/\.[^.]+$/, "").toLowerCase();
          const isInit = depBasename === "__init__";
          const relevant = isFileNameTaskRelevant(depBasename, textLower) ||
            isPathTaskRelevant(dep.toLowerCase(), textLower);
          const score = isInit ? 0.05 : relevant ? 0.25 : 0.1;
          addCompanion(
            companionScores,
            dep,
            score,
            `imported by companion ${path.basename(companion)} (same directory)`
          );
        }
      }
    }
  }

  // Step 4: Rank and filter — precision > recall
  const companions: CompanionSuggestion[] = [...companionScores.entries()]
    .map(([file, { score, signals }]) => ({
      file,
      reason: signals[0], // lead with strongest signal
      confidence: Math.min(score, 1),
      signals,
    }))
    .filter((c) => c.confidence >= 0.25) // high-confidence only
    .sort((a, b) => {
      // Primary sort: confidence descending
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      // Tiebreak: prefer files with task-relevant signals
      const aRelevant = a.signals.some((s) => s.includes("task-relevant") || s.includes("keyword"));
      const bRelevant = b.signals.some((s) => s.includes("task-relevant") || s.includes("keyword"));
      if (aRelevant !== bRelevant) return aRelevant ? -1 : 1;
      // Tiebreak: prefer non-__init__ files
      const aInit = path.basename(a.file) === "__init__.py";
      const bInit = path.basename(b.file) === "__init__.py";
      if (aInit !== bInit) return aInit ? 1 : -1;
      return 0;
    })
    .slice(0, 5); // max 5 suggestions — precision over recall

  // Step 5: Generate briefing text
  const briefing = generateBriefing(primaryFiles, companions);

  return { primaryFiles, companions, briefing };
}

/**
 * Identify files that the task description refers to directly.
 * Uses file path matching against the task text.
 */
function identifyPrimaryFiles(textLower: string, files: string[]): string[] {
  const primary: string[] = [];

  for (const file of files) {
    if (!isSourceFile(file) || isTestFile(file)) continue;

    const basename = path.basename(file).toLowerCase();
    const basenameNoExt = basename.replace(/\.[^.]+$/, "");
    const fileLower = file.toLowerCase();

    // Full path match
    if (textLower.includes(fileLower)) {
      primary.push(file);
      continue;
    }

    // Basename match (but only for distinctive names — skip index.ts, utils.ts etc.)
    const genericNames = new Set([
      "index", "utils", "helpers", "constants", "types", "config",
      "mod", "lib", "main", "init", "__init__",
    ]);
    if (!genericNames.has(basenameNoExt) && textLower.includes(basenameNoExt)) {
      // Verify it's a meaningful match (at least 4 chars, word boundary)
      if (basenameNoExt.length >= 4) {
        // Check for word boundary: the match shouldn't be a substring of a larger word
        const idx = textLower.indexOf(basenameNoExt);
        const before = idx > 0 ? textLower[idx - 1] : " ";
        const after = idx + basenameNoExt.length < textLower.length
          ? textLower[idx + basenameNoExt.length]
          : " ";
        const boundary = /[\s\.,;:_\-\/\(\)\[\]'"#`]|$/;
        if (boundary.test(before) && boundary.test(after)) {
          primary.push(file);
        }
      }
    }
  }

  return [...new Set(primary)];
}

function buildFanIn(edges: ImportEdge[]): Map<string, number> {
  const fanIn = new Map<string, number>();
  for (const edge of edges) {
    fanIn.set(edge.to, (fanIn.get(edge.to) ?? 0) + 1);
  }
  return fanIn;
}

function buildImportedBy(edges: ImportEdge[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!map.has(edge.to)) map.set(edge.to, new Set());
    map.get(edge.to)!.add(edge.from);
  }
  return map;
}

function buildImports(edges: ImportEdge[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!map.has(edge.from)) map.set(edge.from, new Set());
    map.get(edge.from)!.add(edge.to);
  }
  return map;
}

function addCompanion(
  map: Map<string, { score: number; signals: string[] }>,
  file: string,
  score: number,
  signal: string
) {
  const existing = map.get(file);
  if (existing) {
    existing.score += score;
    if (!existing.signals.includes(signal)) {
      existing.signals.push(signal);
    }
  } else {
    map.set(file, { score, signals: [signal] });
  }
}

/**
 * Check if a filename (without extension) is relevant to the task text.
 * Decomposes both into word sets and checks for meaningful overlap.
 */
function isFileNameTaskRelevant(depBasename: string, textLower: string): boolean {
  // Decompose filename: concrete_artifact_manager → [concrete, artifact, manager]
  const fileWords = depBasename
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[_\-]+/)
    .filter((w) => w.length >= 3);

  if (fileWords.length === 0) return false;

  // Extract task words
  const taskWords = new Set(
    textLower
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3)
  );

  // Generic words that don't indicate relevance
  const generic = new Set([
    "the", "and", "for", "are", "was", "not", "but", "has", "have",
    "this", "that", "with", "from", "will", "can", "may", "should",
    "would", "could", "when", "where", "what", "how", "who", "which",
    "been", "being", "into", "than", "then", "also", "just",
    "file", "files", "code", "function", "class", "method", "module",
    "import", "return", "value", "type", "name", "index", "data",
  ]);

  // Count meaningful word overlap
  let overlap = 0;
  for (const fw of fileWords) {
    if (!generic.has(fw) && taskWords.has(fw)) {
      overlap++;
    }
  }

  // Require at least 2 matching words, or 1 if the filename is short
  return overlap >= 2 || (fileWords.length <= 2 && overlap >= 1);
}

/**
 * Check if a file's directory path contains task-relevant keywords.
 * Example: path "lib/ansible/galaxy/collection/foo.py" is relevant to a task about "galaxy collection".
 */
function isPathTaskRelevant(depPath: string, textLower: string): boolean {
  // Extract directory segments from the path
  const segments = depPath.split("/").filter((s) => s.length >= 3);
  const generic = new Set([
    "src", "lib", "internal", "pkg", "cmd", "ext", "core", "common",
    "utils", "helpers", "shared", "base", "main", "app", "api",
  ]);

  const taskWords = new Set(
    textLower
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3)
  );

  let matches = 0;
  for (const seg of segments) {
    if (!generic.has(seg) && taskWords.has(seg)) {
      matches++;
    }
  }

  return matches >= 2;
}

/**
 * Extract meaningful keyword phrases from task text and match against filenames.
 * Converts phrases like "Galaxy API proxy" to patterns that match "galaxy_api_proxy.py".
 */
function matchKeywordsToFiles(
  textLower: string,
  files: string[],
  excludeFiles: string[]
): { file: string; matchedKeywords: string }[] {
  const excludeSet = new Set(excludeFiles);
  const results: { file: string; matchedKeywords: string }[] = [];

  // Extract 2-4 word sequences from the text
  const words = textLower.replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/);
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "must", "to", "of",
    "in", "for", "on", "with", "at", "by", "from", "as", "into", "through",
    "during", "before", "after", "above", "below", "between", "and", "but",
    "or", "not", "no", "if", "when", "where", "how", "what", "which",
    "that", "this", "these", "those", "it", "its", "all", "each", "every",
    "any", "some", "such", "than", "too", "very", "just", "also", "only",
  ]);

  const phrases: string[] = [];
  const meaningfulWords = words.filter((w) => w.length >= 3 && !stopWords.has(w));

  // Generate 2-3 word sliding windows
  for (let len = 3; len >= 2; len--) {
    for (let i = 0; i <= meaningfulWords.length - len; i++) {
      phrases.push(meaningfulWords.slice(i, i + len).join("_"));
    }
  }

  // Match phrases against filenames
  for (const file of files) {
    if (!isSourceFile(file) || excludeSet.has(file)) continue;
    const basename = path.basename(file).replace(/\.[^.]+$/, "").toLowerCase();
    // Decompose camelCase to snake_case for matching
    const normalized = basename.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();

    for (const phrase of phrases) {
      if (normalized.includes(phrase) || basename.includes(phrase)) {
        results.push({ file, matchedKeywords: phrase.replace(/_/g, " ") });
        break; // one match per file is enough
      }
    }
  }

  return results;
}

const SOURCE_EXTS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs",
  ".rb", ".java", ".swift", ".kt",
]);

function isSourceFile(file: string): boolean {
  return SOURCE_EXTS.has(path.extname(file).toLowerCase());
}

const TEST_RE = /(?:^|\/)(?:tests?|__tests__|e2e|spec)\//i;
const TEST_FILE_RE = /[._](test|spec)\.[^.]+$|(?:^|\/)test_[^/]+\.py$|[^/]+_test\.(?:py|go|rs)$/;

function isTestFile(file: string): boolean {
  return TEST_RE.test(file) || TEST_FILE_RE.test(file);
}

/**
 * Generate the concise preflight briefing injected into the agent prompt.
 * Tone: "likely relevant, please inspect" — not "you MUST change these."
 */
function generateBriefing(
  primaryFiles: string[],
  companions: CompanionSuggestion[]
): string {
  if (companions.length === 0) {
    return ""; // No companions found — don't inject noise
  }

  const lines: string[] = [
    "## Preflight: companion files to inspect",
    "",
    "Based on this repo's co-change history and import graph, these files frequently need changes alongside the files you'll likely edit:",
    "",
  ];

  for (const c of companions) {
    const confidenceLabel =
      c.confidence >= 0.5 ? "high" : c.confidence >= 0.3 ? "moderate" : "low";
    lines.push(`- **${c.file}** (${confidenceLabel} confidence) — ${c.reason}`);
  }

  lines.push("");
  lines.push(
    "Please inspect these files before declaring done. They may need corresponding changes."
  );

  return lines.join("\n");
}

/**
 * Pretty-print the briefing for terminal output.
 */
function printBriefing(result: PreflightResult) {
  console.log("");

  if (result.primaryFiles.length > 0) {
    console.log(chalk.bold("Primary files detected in task:"));
    for (const f of result.primaryFiles) {
      console.log(`  ${chalk.cyan(f)}`);
    }
    console.log("");
  }

  if (result.companions.length === 0) {
    console.log(chalk.yellow("No companion file suggestions generated."));
    console.log(
      chalk.dim(
        "This may mean the task doesn't reference specific files, or the repo has limited co-change/import data."
      )
    );
    return;
  }

  console.log(chalk.bold("Companion files to inspect:"));
  console.log("");

  for (const c of result.companions) {
    const bar = "█".repeat(Math.round(c.confidence * 10));
    const empty = "░".repeat(10 - Math.round(c.confidence * 10));
    console.log(
      `  ${chalk.cyan(c.file)}  ${chalk.green(bar)}${chalk.dim(empty)} ${(c.confidence * 100).toFixed(0)}%`
    );
    for (const signal of c.signals) {
      console.log(`    ${chalk.dim("→")} ${signal}`);
    }
  }

  console.log("");
  console.log(chalk.bold("Briefing (inject into agent prompt):"));
  console.log(chalk.dim("─".repeat(60)));
  console.log(result.briefing);
  console.log(chalk.dim("─".repeat(60)));
}
