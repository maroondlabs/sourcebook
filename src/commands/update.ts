import path from "node:path";
import chalk from "chalk";
import { scanProject } from "../scanner/index.js";
import { generateClaude } from "../generators/claude.js";
import { generateCursor, generateCursorLegacy } from "../generators/cursor.js";
import { generateCopilot } from "../generators/copilot.js";
import { writeOutput } from "../utils/output.js";
import { readExisting, mergeContent, countManualSections } from "../utils/merge.js";
interface UpdateOptions {
  dir: string;
  format: string;
  budget: string;
}

/**
 * Re-analyze and regenerate context files while preserving manual edits.
 * Uses shared merge logic from utils/merge.ts.
 */
export async function update(options: UpdateOptions) {

  const targetDir = path.resolve(options.dir);
  const formats = options.format.split(",").map((f) => f.trim());
  const budget = parseInt(options.budget, 10);

  console.log(chalk.bold("\nsourcebook update"));
  console.log(chalk.dim("Re-analyzing while preserving your edits...\n"));

  const scan = await scanProject(targetDir);

  console.log(chalk.green("✓") + " Scanned project structure");
  console.log(
    chalk.dim(
      `  ${scan.files.length} files, ${scan.frameworks.length} frameworks detected`
    )
  );
  console.log(
    chalk.green("✓") + ` Extracted ${scan.findings.length} findings\n`
  );

  for (const format of formats) {
    switch (format) {
      case "claude": {
        const fresh = generateClaude(scan, budget);
        const existing = readExisting(targetDir, "CLAUDE.md");
        const merged = existing ? mergeContent(existing, fresh) : fresh;
        await writeOutput(targetDir, "CLAUDE.md", merged);
        const preserved = existing ? countManualSections(existing) : 0;
        console.log(
          chalk.green("✓") +
            ` Updated CLAUDE.md` +
            (preserved > 0 ? chalk.dim(` (${preserved} manual section${preserved > 1 ? "s" : ""} preserved)`) : "")
        );
        break;
      }
      case "cursor": {
        const fresh = generateCursor(scan, budget);
        await writeOutput(targetDir, ".cursor/rules/sourcebook.mdc", fresh);
        const legacyFresh = generateCursorLegacy(scan, budget);
        await writeOutput(targetDir, ".cursorrules", legacyFresh);
        console.log(chalk.green("✓") + " Updated .cursor/rules/sourcebook.mdc");
        break;
      }
      case "copilot": {
        const fresh = generateCopilot(scan, budget);
        const existing = readExisting(targetDir, ".github/copilot-instructions.md");
        const merged = existing ? mergeContent(existing, fresh) : fresh;
        await writeOutput(targetDir, ".github/copilot-instructions.md", merged);
        const preserved = existing ? countManualSections(existing) : 0;
        console.log(
          chalk.green("✓") +
            ` Updated .github/copilot-instructions.md` +
            (preserved > 0 ? chalk.dim(` (${preserved} manual section${preserved > 1 ? "s" : ""} preserved)`) : "")
        );
        break;
      }
      case "all": {
        // Recurse for each format
        for (const f of ["claude", "cursor", "copilot"]) {
          await update({ ...options, format: f });
        }
        return;
      }
      default:
        console.log(chalk.yellow(`⚠ Format "${format}" not yet supported`));
    }
  }

  console.log(chalk.dim("\nDone. Your manual sections were preserved.\n"));
}

