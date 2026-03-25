import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { scanProject } from "../scanner/index.js";
import { generateClaude } from "../generators/claude.js";
import { generateCursor } from "../generators/cursor.js";
import { generateCopilot } from "../generators/copilot.js";

interface DiffOptions {
  dir: string;
  format: string;
  budget: string;
}

/**
 * Show what would change if sourcebook regenerated the context files.
 * Does not write any files — pure comparison.
 * Exit code: 0 if no changes, 1 if changes found (useful for CI).
 */
export async function diff(options: DiffOptions) {
  const targetDir = path.resolve(options.dir);
  const format = options.format.split(",")[0].trim(); // diff one format at a time
  const budget = parseInt(options.budget, 10);

  console.log(chalk.bold("\nsourcebook diff"));
  console.log(chalk.dim("Comparing current context with fresh analysis...\n"));

  const scan = await scanProject(targetDir);

  const formatMap: Record<string, { generator: () => string; file: string }> = {
    claude: {
      generator: () => generateClaude(scan, budget),
      file: "CLAUDE.md",
    },
    cursor: {
      generator: () => generateCursor(scan, budget),
      file: ".cursor/rules/sourcebook.mdc",
    },
    copilot: {
      generator: () => generateCopilot(scan, budget),
      file: ".github/copilot-instructions.md",
    },
  };

  const config = formatMap[format];
  if (!config) {
    console.log(chalk.yellow(`⚠ Format "${format}" not supported for diff`));
    process.exit(1);
  }

  const filePath = path.join(targetDir, config.file);
  let existing: string;
  try {
    existing = fs.readFileSync(filePath, "utf-8");
  } catch {
    console.log(chalk.yellow(`⚠ ${config.file} does not exist yet. Run \`sourcebook init\` first.`));
    process.exit(1);
  }

  const fresh = config.generator();

  if (existing.trim() === fresh.trim()) {
    console.log(chalk.green("✓") + ` ${config.file} is up to date. No changes needed.\n`);
    process.exit(0);
  }

  // Line-by-line diff
  const existingLines = existing.split("\n");
  const freshLines = fresh.split("\n");
  let hasChanges = false;

  console.log(chalk.bold(`  ${config.file}\n`));

  // Simple diff: show removed and added lines
  const maxLen = Math.max(existingLines.length, freshLines.length);

  // Build sets for quick lookup
  const existingSet = new Set(existingLines.map((l) => l.trim()).filter(Boolean));
  const freshSet = new Set(freshLines.map((l) => l.trim()).filter(Boolean));

  // Lines only in existing (removed)
  const removed = existingLines.filter((l) => l.trim() && !freshSet.has(l.trim()));
  // Lines only in fresh (added)
  const added = freshLines.filter((l) => l.trim() && !existingSet.has(l.trim()));

  if (removed.length > 0) {
    hasChanges = true;
    console.log(chalk.red("  Removed:"));
    for (const line of removed.slice(0, 20)) {
      console.log(chalk.red(`  - ${line}`));
    }
    if (removed.length > 20) {
      console.log(chalk.dim(`  ... and ${removed.length - 20} more`));
    }
    console.log("");
  }

  if (added.length > 0) {
    hasChanges = true;
    console.log(chalk.green("  Added:"));
    for (const line of added.slice(0, 20)) {
      console.log(chalk.green(`  + ${line}`));
    }
    if (added.length > 20) {
      console.log(chalk.dim(`  ... and ${added.length - 20} more`));
    }
    console.log("");
  }

  if (hasChanges) {
    console.log(
      chalk.dim("  Run `sourcebook update` to apply these changes while preserving your edits.\n")
    );
    process.exit(1);
  } else {
    console.log(chalk.green("✓") + " No meaningful changes detected.\n");
    process.exit(0);
  }
}
