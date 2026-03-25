import type { ProjectScan } from "../types.js";
import {
  isCritical,
  hasCommands,
  categorizeFindings,
  enforceTokenBudget,
} from "./shared.js";

/**
 * Generate Cursor rules from scan results.
 * Outputs .cursor/rules/sourcebook.mdc (modular format with YAML frontmatter)
 * and legacy .cursorrules (same content, no frontmatter).
 */
export function generateCursor(scan: ProjectScan, budget: number): string {
  const { critical, important, supplementary } = categorizeFindings(scan.findings);

  const sections: { key: string; content: string; priority: number }[] = [];

  // MDC frontmatter
  sections.push({
    key: "frontmatter",
    content: [
      "---",
      "description: Project conventions and constraints extracted by sourcebook",
      "alwaysApply: true",
      "---",
      "",
    ].join("\n"),
    priority: 100,
  });

  // Commands
  if (hasCommands(scan.commands)) {
    const lines = ["## Commands", ""];
    if (scan.commands.dev) lines.push(`- Dev: \`${scan.commands.dev}\``);
    if (scan.commands.build) lines.push(`- Build: \`${scan.commands.build}\``);
    if (scan.commands.test) lines.push(`- Test: \`${scan.commands.test}\``);
    if (scan.commands.lint) lines.push(`- Lint: \`${scan.commands.lint}\``);
    lines.push("");
    sections.push({ key: "commands", content: lines.join("\n"), priority: 95 });
  }

  // Critical constraints
  if (critical.length > 0) {
    const lines = ["## Constraints", ""];
    for (const finding of critical) {
      lines.push(`- ${finding.description}`);
    }
    lines.push("");
    sections.push({ key: "critical", content: lines.join("\n"), priority: 90 });
  }

  // Stack
  if (scan.frameworks.length > 0) {
    sections.push({
      key: "stack",
      content: ["## Stack", "", scan.frameworks.join(", "), ""].join("\n"),
      priority: 50,
    });
  }

  // Core modules
  if (scan.rankedFiles && scan.rankedFiles.length > 0) {
    const lines = ["## Core Modules", ""];
    for (const { file } of scan.rankedFiles.slice(0, 5)) {
      lines.push(`- \`${file}\``);
    }
    lines.push("");
    sections.push({ key: "core_modules", content: lines.join("\n"), priority: 60 });
  }

  // Conventions
  if (important.length > 0) {
    const lines = ["## Conventions", ""];
    for (const finding of important) {
      lines.push(`- ${finding.description}`);
    }
    lines.push("");
    sections.push({ key: "conventions", content: lines.join("\n"), priority: 30 });
  }

  // Additional context
  if (supplementary.length > 0) {
    const lines = ["## Additional Context", ""];
    for (const finding of supplementary) {
      lines.push(`- ${finding.description}`);
    }
    lines.push("");
    sections.push({ key: "supplementary", content: lines.join("\n"), priority: 20 });
  }

  const kept = enforceTokenBudget(sections, budget);
  return kept.join("\n");
}

/**
 * Legacy .cursorrules format — same content without YAML frontmatter.
 */
export function generateCursorLegacy(scan: ProjectScan, budget: number): string {
  const mdc = generateCursor(scan, budget);
  const endOfFrontmatter = mdc.indexOf("---", 4);
  if (endOfFrontmatter !== -1) {
    return mdc.slice(endOfFrontmatter + 4).trimStart();
  }
  return mdc;
}
