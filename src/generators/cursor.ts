import type { ProjectScan, Finding } from "../types.js";

/**
 * Generate Cursor rules from scan results.
 *
 * Cursor deprecated `.cursorrules` in favor of modular `.cursor/rules/*.mdc` files.
 * Each .mdc file has YAML frontmatter (description, globs, alwaysApply) + markdown body.
 *
 * We generate a single `sourcebook.mdc` with alwaysApply: true containing
 * the same non-discoverable findings as the Claude generator, formatted for
 * Cursor's conventions (shorter, more directive).
 */
export function generateCursor(scan: ProjectScan, budget: number): string {
  const critical = scan.findings.filter(
    (f) => f.confidence === "high" && isCritical(f)
  );
  const important = scan.findings.filter(
    (f) => f.confidence === "high" && !isCritical(f)
  );
  const supplementary = scan.findings.filter(
    (f) => f.confidence === "medium"
  );

  const sections: string[] = [];

  // MDC frontmatter
  sections.push("---");
  sections.push("description: Project conventions and constraints extracted by sourcebook");
  sections.push("alwaysApply: true");
  sections.push("---");
  sections.push("");

  // Commands
  if (hasCommands(scan.commands)) {
    sections.push("## Commands");
    sections.push("");
    if (scan.commands.dev) sections.push(`- Dev: \`${scan.commands.dev}\``);
    if (scan.commands.build) sections.push(`- Build: \`${scan.commands.build}\``);
    if (scan.commands.test) sections.push(`- Test: \`${scan.commands.test}\``);
    if (scan.commands.lint) sections.push(`- Lint: \`${scan.commands.lint}\``);
    sections.push("");
  }

  // Critical constraints at the top
  if (critical.length > 0) {
    sections.push("## Constraints");
    sections.push("");
    for (const finding of critical) {
      sections.push(`- ${finding.description}`);
    }
    sections.push("");
  }

  // Stack (brief)
  if (scan.frameworks.length > 0) {
    sections.push("## Stack");
    sections.push("");
    sections.push(scan.frameworks.join(", "));
    sections.push("");
  }

  // Core modules
  if (scan.rankedFiles && scan.rankedFiles.length > 0) {
    const top5 = scan.rankedFiles.slice(0, 5);
    sections.push("## Core Modules");
    sections.push("");
    for (const { file } of top5) {
      sections.push(`- \`${file}\``);
    }
    sections.push("");
  }

  // Conventions
  if (important.length > 0) {
    sections.push("## Conventions");
    sections.push("");
    for (const finding of important) {
      sections.push(`- ${finding.description}`);
    }
    sections.push("");
  }

  // Additional context
  if (supplementary.length > 0) {
    sections.push("## Additional Context");
    sections.push("");
    for (const finding of supplementary) {
      sections.push(`- ${finding.description}`);
    }
    sections.push("");
  }

  let output = sections.join("\n");

  // Token budget enforcement
  const charBudget = budget * 4;
  if (output.length > charBudget) {
    output = output.slice(0, charBudget);
    const lastNewline = output.lastIndexOf("\n");
    output = output.slice(0, lastNewline) + "\n";
  }

  return output;
}

/**
 * Also generate the legacy .cursorrules format for backwards compatibility.
 * Same content as the .mdc but without the frontmatter.
 */
export function generateCursorLegacy(scan: ProjectScan, budget: number): string {
  const mdc = generateCursor(scan, budget);
  // Strip the YAML frontmatter
  const endOfFrontmatter = mdc.indexOf("---", 4);
  if (endOfFrontmatter !== -1) {
    return mdc.slice(endOfFrontmatter + 4).trimStart();
  }
  return mdc;
}

function isCritical(finding: Finding): boolean {
  const criticalCategories = new Set([
    "Hidden dependencies",
    "Circular dependencies",
    "Core modules",
    "Fragile code",
    "Git history",
    "Commit conventions",
  ]);

  const criticalKeywords = [
    "breaking", "blast radius", "deprecated", "don't", "must",
    "never", "revert", "fragile", "hidden", "invisible", "coupling",
  ];

  if (criticalCategories.has(finding.category)) return true;
  const desc = finding.description.toLowerCase();
  return criticalKeywords.some((kw) => desc.includes(kw));
}

function hasCommands(commands: Record<string, string | undefined>): boolean {
  return Object.values(commands).some((v) => v !== undefined);
}
