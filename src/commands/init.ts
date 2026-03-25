import path from "node:path";
import chalk from "chalk";
import { scanProject } from "../scanner/index.js";
import { generateClaude } from "../generators/claude.js";
import { writeOutput } from "../utils/output.js";

interface InitOptions {
  dir: string;
  format: string;
  budget: string;
  dryRun?: boolean;
}

export async function init(options: InitOptions) {
  const targetDir = path.resolve(options.dir);
  const formats = options.format.split(",").map((f) => f.trim());
  const budget = parseInt(options.budget, 10);

  console.log(chalk.bold("\nsourcebook"));
  console.log(chalk.dim("Extracting repo truths...\n"));

  // Phase 1: Scan the project
  const scan = await scanProject(targetDir);

  console.log(chalk.green("✓") + " Scanned project structure");
  console.log(
    chalk.dim(
      `  ${scan.files.length} files, ${scan.frameworks.length} frameworks detected`
    )
  );

  // Phase 2: Generate findings
  const findings = scan.findings;

  if (findings.length === 0) {
    console.log(
      chalk.yellow("\n⚠ No non-obvious findings detected.") +
        chalk.dim(
          "\n  This may mean the project is small or follows standard conventions."
        )
    );
  } else {
    console.log(
      chalk.green("✓") +
        ` Extracted ${findings.length} findings\n`
    );

    // Show findings preview
    for (const finding of findings) {
      const icon =
        finding.confidence === "high"
          ? chalk.green("●")
          : finding.confidence === "medium"
            ? chalk.yellow("●")
            : chalk.dim("●");
      console.log(`  ${icon} ${chalk.bold(finding.category)}: ${finding.description}`);
      if (finding.evidence) {
        console.log(chalk.dim(`    evidence: ${finding.evidence}`));
      }
    }
  }

  // Phase 3: Generate output
  if (options.dryRun) {
    console.log(chalk.dim("\n--dry-run: no files written."));
    return;
  }

  console.log("");

  for (const format of formats) {
    switch (format) {
      case "claude": {
        const content = generateClaude(scan, budget);
        await writeOutput(targetDir, "CLAUDE.md", content);
        console.log(chalk.green("✓") + " Wrote CLAUDE.md");
        break;
      }
      // TODO: cursor, copilot, agents, json formats
      default:
        console.log(chalk.yellow(`⚠ Format "${format}" not yet supported`));
    }
  }

  console.log(
    chalk.dim(
      "\nReview the generated files and edit to add context only you know."
    )
  );
  console.log(
    chalk.dim("The best repo truths come from human + machine together.\n")
  );
}
