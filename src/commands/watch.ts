import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { scanProject } from "../scanner/index.js";
import { generateClaude } from "../generators/claude.js";
import { generateCursor, generateCursorLegacy } from "../generators/cursor.js";
import { generateCopilot } from "../generators/copilot.js";
import { generateAgents } from "../generators/agents.js";
import { writeOutput } from "../utils/output.js";
import { readExisting, mergeContent } from "../utils/merge.js";
import type { ProjectScan, Finding } from "../types.js";

interface WatchOptions {
  dir: string;
  format: string;
  budget: string;
}

// Patterns to ignore when watching for file changes
const IGNORE_PATTERNS = [
  "node_modules",
  "dist",
  "build",
  ".git",
  ".next",
  "coverage",
  ".expo",
  ".claude",
  "__pycache__",
  ".pyc",
];

const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".py", ".go",
  ".json", ".toml", ".yaml", ".yml", ".mod",
]);

export async function watch(options: WatchOptions) {
  const targetDir = path.resolve(options.dir);
  const formats = options.format.split(",").map((f) => f.trim());
  const budget = parseInt(options.budget, 10);

  console.log(chalk.bold("\nsourcebook watch"));
  console.log(chalk.dim("Watching for changes...\n"));

  // Initial scan + write
  let previousFingerprint = "";
  try {
    const scan = await scanProject(targetDir);
    previousFingerprint = fingerprintFindings(scan.findings);
    await writeFormats(targetDir, scan, formats, budget);
    console.log(
      chalk.green("✓") +
        ` Initial scan complete (${scan.findings.length} findings)`
    );
  } catch (err) {
    console.error(chalk.red("✗ Initial scan failed:"), err);
    process.exit(1);
  }

  // Set up debounced watcher
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let scanning = false;

  const handleChange = async () => {
    if (scanning) return;
    scanning = true;

    try {
      const scan = await scanProject(targetDir);
      const fingerprint = fingerprintFindings(scan.findings);

      if (fingerprint !== previousFingerprint) {
        previousFingerprint = fingerprint;
        await writeFormats(targetDir, scan, formats, budget);

        const time = new Date().toLocaleTimeString();
        console.log(
          chalk.green("✓") +
            chalk.dim(` [${time}]`) +
            ` Updated — ${scan.findings.length} findings`
        );
      }
    } catch (err) {
      const time = new Date().toLocaleTimeString();
      console.error(
        chalk.red("✗") +
          chalk.dim(` [${time}]`) +
          ` Scan failed: ${err}`
      );
    } finally {
      scanning = false;
    }
  };

  const debouncedHandle = (filename: string | null) => {
    // Filter out irrelevant file changes
    if (filename) {
      if (IGNORE_PATTERNS.some((p) => filename.includes(p))) return;
      const ext = path.extname(filename);
      if (ext && !SOURCE_EXTENSIONS.has(ext)) return;
      // Don't trigger on our own output files
      if (
        filename === "CLAUDE.md" ||
        filename === "AGENTS.md" ||
        filename === ".cursorrules" ||
        filename.includes("copilot-instructions") ||
        filename.includes("sourcebook.mdc")
      ) return;
    }

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(handleChange, 2000);
  };

  // Start watching
  try {
    const watcher = fs.watch(targetDir, { recursive: true }, (_event, filename) => {
      debouncedHandle(filename);
    });

    console.log(chalk.dim("  Watching for source file changes (Ctrl+C to stop)\n"));

    // Graceful shutdown
    const cleanup = () => {
      watcher.close();
      if (debounceTimer) clearTimeout(debounceTimer);
      console.log(chalk.dim("\n  Stopped watching.\n"));
      process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  } catch (err) {
    console.error(chalk.red("✗ Failed to start file watcher:"), err);
    console.log(chalk.dim("  Your platform may not support recursive file watching."));
    process.exit(1);
  }
}

/**
 * Create a stable fingerprint from findings for change detection.
 * Sorts findings to avoid false positives from ordering changes.
 */
function fingerprintFindings(findings: Finding[]): string {
  const sorted = findings
    .map((f) => `${f.category}|${f.confidence}|${f.description}`)
    .sort();
  return sorted.join("\n");
}

/**
 * Generate and write output files for all requested formats.
 * Preserves manual edits by merging with existing content.
 */
async function writeFormats(
  dir: string,
  scan: ProjectScan,
  formats: string[],
  budget: number,
) {
  for (const format of formats) {
    switch (format) {
      case "claude": {
        const fresh = generateClaude(scan, budget);
        const existing = readExisting(dir, "CLAUDE.md");
        const merged = existing ? mergeContent(existing, fresh) : fresh;
        await writeOutput(dir, "CLAUDE.md", merged);
        break;
      }
      case "cursor": {
        const fresh = generateCursor(scan, budget);
        await writeOutput(dir, ".cursor/rules/sourcebook.mdc", fresh);
        const legacyFresh = generateCursorLegacy(scan, budget);
        await writeOutput(dir, ".cursorrules", legacyFresh);
        break;
      }
      case "copilot": {
        const fresh = generateCopilot(scan, budget);
        const existing = readExisting(dir, ".github/copilot-instructions.md");
        const merged = existing ? mergeContent(existing, fresh) : fresh;
        await writeOutput(dir, ".github/copilot-instructions.md", merged);
        break;
      }
      case "agents": {
        const fresh = generateAgents(scan, budget);
        await writeOutput(dir, "AGENTS.md", fresh);
        break;
      }
      case "all": {
        await writeFormats(dir, scan, ["claude", "cursor", "copilot", "agents"], budget);
        return;
      }
    }
  }
}

