import path from "node:path";
import chalk from "chalk";
import { getFullCoChangePairs } from "../scanner/git.js";
import { analyzeGitHistory } from "../scanner/git.js";

interface ScanHistoryOptions {
  dir: string;
  json?: boolean;
  top?: number;
}

export async function scanHistory(options: ScanHistoryOptions): Promise<void> {
  const repoPath = path.resolve(options.dir);
  const topN = options.top ?? 20;

  if (!options.json) {
    console.log(chalk.bold("\nsourcebook scan-history"));
    console.log(chalk.dim("Mining git history for coupling patterns...\n"));
  }

  const [pairs, analysis] = await Promise.all([
    Promise.resolve(getFullCoChangePairs(repoPath)),
    analyzeGitHistory(repoPath),
  ]);

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          coChangePairs: pairs.slice(0, topN),
          activeAreas: analysis.activeAreas,
          findings: analysis.findings.map((f) => ({
            category: f.category,
            description: f.description,
            confidence: f.confidence,
          })),
        },
        null,
        2
      )
    );
    return;
  }

  // ── Co-change pairs ───────────────────────────────────────────────────────
  if (pairs.length === 0) {
    console.log(chalk.yellow("No co-change pairs found. Need at least 2 commits with co-edited source files."));
    return;
  }

  console.log(chalk.bold(`── Top co-change pairs (${Math.min(pairs.length, topN)} of ${pairs.length}) ─────────────────\n`));

  for (const pair of pairs.slice(0, topN)) {
    const pct = (pair.strength * 100).toFixed(0);
    const bar =
      pair.strength >= 0.6
        ? chalk.red(`${pct}%`)
        : pair.strength >= 0.35
        ? chalk.yellow(`${pct}%`)
        : chalk.dim(`${pct}%`);
    console.log(`${bar}  ${chalk.cyan(pair.fileA)}  ↔  ${chalk.cyan(pair.fileB)}  ${chalk.dim(`(${pair.count}x)`)}`);
  }

  // ── Active areas ─────────────────────────────────────────────────────────
  if (analysis.activeAreas.length > 0) {
    console.log(chalk.bold("\n── Recently active areas ────────────────────────────────\n"));
    for (const area of analysis.activeAreas.slice(0, 10)) {
      console.log(`  ${chalk.cyan(area)}`);
    }
  }

  // ── Key findings ─────────────────────────────────────────────────────────
  const highConf = analysis.findings.filter((f) => f.confidence === "high").slice(0, 5);
  if (highConf.length > 0) {
    console.log(chalk.bold("\n── High-confidence findings ─────────────────────────────\n"));
    for (const f of highConf) {
      console.log(`${chalk.red("⚠")} ${chalk.bold(f.category)}: ${f.description}`);
    }
  }

  console.log("");
}
