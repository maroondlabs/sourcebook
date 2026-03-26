import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { scanProject } from "../scanner/index.js";
import { generateClaude } from "../generators/claude.js";
import { generateCursor, generateCursorLegacy } from "../generators/cursor.js";
import { generateCopilot } from "../generators/copilot.js";
import { writeOutput } from "../utils/output.js";
import { requirePro } from "../auth/license.js";

interface UpdateOptions {
  dir: string;
  format: string;
  budget: string;
}

// Headers that sourcebook generates — anything else is user-added
const SOURCEBOOK_HEADERS = new Set([
  "CLAUDE.md",
  "Commands",
  "Critical Constraints",
  "Stack",
  "Project Structure",
  "Core Modules (by structural importance)",
  "Core Modules",
  "Conventions & Patterns",
  "Conventions",
  "Additional Context",
  "Additional Notes",
  "What to Add Manually",
  "Copilot Instructions",
  "Development Commands",
  "Important Constraints",
  "Technology Stack",
  "High-Impact Files",
  "Code Conventions",
  "Constraints",
]);

/**
 * Re-analyze and regenerate context files while preserving manual edits.
 *
 * Strategy:
 * 1. Read existing output file
 * 2. Parse into sections (split on ## headers)
 * 3. Identify manual sections (headers not in SOURCEBOOK_HEADERS)
 * 4. Re-run scan and generate fresh content
 * 5. Replace sourcebook sections, keep manual sections in their original positions
 */
export async function update(options: UpdateOptions) {
  await requirePro("sourcebook update");

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

function readExisting(dir: string, filename: string): string | null {
  const filePath = path.join(dir, filename);
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Parse markdown into sections split by ## headers.
 */
function parseSections(content: string): { header: string; body: string }[] {
  const sections: { header: string; body: string }[] = [];
  const lines = content.split("\n");
  let currentHeader = "";
  let currentBody: string[] = [];

  for (const line of lines) {
    const headerMatch = line.match(/^##\s+(.+)/);
    if (headerMatch) {
      if (currentHeader || currentBody.length > 0) {
        sections.push({ header: currentHeader, body: currentBody.join("\n") });
      }
      currentHeader = headerMatch[1].trim();
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }

  if (currentHeader || currentBody.length > 0) {
    sections.push({ header: currentHeader, body: currentBody.join("\n") });
  }

  return sections;
}

function isSourcebookSection(header: string): boolean {
  return SOURCEBOOK_HEADERS.has(header) || header === "";
}

function countManualSections(content: string): number {
  const sections = parseSections(content);
  return sections.filter((s) => s.header && !isSourcebookSection(s.header)).length;
}

/**
 * Merge fresh sourcebook output with existing content,
 * preserving any manually added sections.
 */
function mergeContent(existing: string, fresh: string): string {
  const existingSections = parseSections(existing);
  const freshSections = parseSections(fresh);

  // Extract manual sections from existing content
  const manualSections = existingSections.filter(
    (s) => s.header && !isSourcebookSection(s.header)
  );

  if (manualSections.length === 0) {
    // No manual sections — just use the fresh content
    return fresh;
  }

  // Find where "What to Add Manually" or last section is in fresh content
  // Insert manual sections before the footer
  const result: string[] = [];
  let insertedManual = false;

  for (const section of freshSections) {
    // Insert manual sections before the "What to Add Manually" footer
    if (section.header === "What to Add Manually" && !insertedManual) {
      for (const manual of manualSections) {
        result.push(`## ${manual.header}`);
        result.push(manual.body);
      }
      insertedManual = true;
    }

    if (section.header) {
      result.push(`## ${section.header}`);
    }
    result.push(section.body);
  }

  // If we never found the footer, append manual sections at the end
  if (!insertedManual) {
    for (const manual of manualSections) {
      result.push(`## ${manual.header}`);
      result.push(manual.body);
    }
  }

  return result.join("\n");
}
