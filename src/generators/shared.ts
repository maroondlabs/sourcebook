import type { Finding } from "../types.js";

/**
 * Shared helpers for all generators.
 * Extracted to avoid duplicating criticality logic and budget enforcement.
 */

const CRITICAL_CATEGORIES = new Set([
  "Hidden dependencies",
  "Circular dependencies",
  "Core modules",
  "Fragile code",
  "Git history",
  "Commit conventions",
  "Anti-patterns",
  "Critical constraints",
]);

const CRITICAL_KEYWORDS = [
  "breaking", "blast radius", "deprecated", "don't", "must",
  "never", "revert", "fragile", "hidden", "invisible", "coupling",
];

export function isCritical(finding: Finding): boolean {
  if (CRITICAL_CATEGORIES.has(finding.category)) return true;
  const desc = finding.description.toLowerCase();
  return CRITICAL_KEYWORDS.some((kw) => desc.includes(kw));
}

export function groupByCategory(findings: Finding[]): Map<string, Finding[]> {
  const grouped = new Map<string, Finding[]>();
  for (const finding of findings) {
    const existing = grouped.get(finding.category) || [];
    existing.push(finding);
    grouped.set(finding.category, existing);
  }
  return grouped;
}

export function hasCommands(commands: Record<string, string | undefined>): boolean {
  return Object.values(commands).some((v) => v !== undefined);
}

/**
 * Estimate token count for a string (rough: 1 token ≈ 4 chars).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Categorize findings into priority tiers for budget enforcement.
 */
export function categorizeFindings(findings: Finding[]): {
  critical: Finding[];
  important: Finding[];
  supplementary: Finding[];
} {
  // Strip internal artifacts that describe the scanner's environment, not the project
  const filtered = findings.filter(
    (f) => !f.description.includes("shallow clone")
  );
  return {
    critical: filtered.filter((f) => f.confidence === "high" && isCritical(f)),
    important: filtered.filter((f) => f.confidence === "high" && !isCritical(f)),
    supplementary: filtered.filter((f) => f.confidence === "medium"),
  };
}

/**
 * Smart budget enforcement. Instead of truncating at a character boundary,
 * drop lower-priority sections first (middle of context = worst retention).
 *
 * Priority order (highest to lowest):
 * 1. Commands (always keep)
 * 2. Critical constraints (always keep)
 * 3. Core modules (keep if budget allows)
 * 4. Stack (keep if budget allows)
 * 5. Conventions/important findings (drop first from middle)
 * 6. Supplementary findings (drop first)
 * 7. Footer/manual section (always keep — end of context = high retention)
 */
/**
 * Build a Quick Reference section from dominant pattern findings.
 * This is the "30-second senior engineer handoff" — the single most
 * actionable section in the output.
 */
export function buildQuickReference(findings: Finding[]): string | null {
  // Only include high/medium confidence patterns in Quick Reference
  const patterns = findings.filter((f) => f.category === "Dominant patterns" && f.confidence !== "low");
  if (patterns.length < 2) return null;

  const lines = ["## Quick Reference", ""];

  for (const p of patterns) {
    // Extract a short label from the description
    const desc = p.description;
    let label = "";
    let value = desc;

    if (desc.includes("internationalization") || desc.includes("i18n") || desc.includes("translation")) {
      label = "i18n";
    } else if (desc.includes("route") || desc.includes("endpoint") || desc.includes("API")) {
      label = "routing";
    } else if (desc.includes("validation") || desc.includes("schema") || desc.includes("Zod") || desc.includes("Pydantic")) {
      label = "validation";
    } else if ((desc.includes("auth") || desc.includes("Auth") || desc.includes("session")) && !desc.includes("integration")) {
      label = "auth";
    } else if (desc.includes("Test") || desc.includes("test")) {
      label = "testing";
    } else if (desc.includes("Tailwind") || desc.includes("styled") || desc.includes("CSS")) {
      label = "styling";
    } else if (desc.includes("database") || desc.includes("Database") || desc.includes("Prisma") || desc.includes("ORM")) {
      label = "database";
    } else if (desc.includes("fetching") || desc.includes("Query") || desc.includes("SWR")) {
      label = "data fetching";
    } else if (desc.includes("Route definitions") || desc.includes("Add new endpoints")) {
      label = "routes";
    } else if (desc.includes("integration") || desc.includes("Third-party")) {
      label = "integrations";
    } else if (desc.includes("components") || desc.includes("UI")) {
      label = "components";
    } else if (desc.includes("Generated") || desc.includes("generated") || desc.includes("DO NOT")) {
      label = "generated";
    } else {
      continue; // Skip findings we can't label cleanly
    }

    // Compress the description to a short actionable line
    const short = desc
      .replace(/\. Follow this pattern.*$/, "")
      .replace(/\. This is the project's standard.*$/, "")
      .replace(/\. Each integration has.*$/, "");

    lines.push(`- **${label}:** ${short}`);
  }

  if (lines.length <= 2) return null; // Nothing useful

  // Deduplicate by label — keep only first occurrence of each
  const seen = new Set<string>();
  const deduped = [lines[0], lines[1]]; // Keep header
  for (let i = 2; i < lines.length; i++) {
    const labelMatch = lines[i].match(/^\- \*\*(\w[\w\s]*)\:\*\*/);
    if (labelMatch) {
      const lbl = labelMatch[1];
      if (seen.has(lbl)) continue;
      seen.add(lbl);
    }
    deduped.push(lines[i]);
  }

  deduped.push("");
  return deduped.join("\n");
}

/**
 * Get priority adjustments based on repo mode.
 * App repos: boost dominant patterns, demote structural.
 * Library repos: boost structural, demote patterns.
 */
export function getModePriorities(repoMode?: "app" | "library" | "monorepo"): Record<string, number> {
  if (repoMode === "library") {
    return {
      quick_reference: 85,
      critical: 92,
      core_modules: 90,
      conventions: 80,
      stack: 50,
      structure: 40,
      supplementary: 25,
    };
  }
  // Default: app mode (boost patterns, Quick Reference highest)
  return {
    quick_reference: 96,
    critical: 92,
    core_modules: 50,
    conventions: 85,
    stack: 45,
    structure: 60,
    supplementary: 20,
  };
}

export function enforceTokenBudget(
  sections: { key: string; content: string; priority: number }[],
  budget: number
): string[] {
  // Sort by priority descending (highest priority = keep)
  const sorted = [...sections].sort((a, b) => b.priority - a.priority);

  let totalTokens = sorted.reduce((sum, s) => sum + estimateTokens(s.content), 0);

  if (totalTokens <= budget) {
    // Everything fits — return in original order
    return sections.map((s) => s.content);
  }

  // Drop lowest-priority sections until we fit
  const dropped = new Set<string>();
  const byPriority = [...sections].sort((a, b) => a.priority - b.priority);

  for (const section of byPriority) {
    if (totalTokens <= budget) break;
    if (section.priority >= 90) continue; // Never drop critical sections
    totalTokens -= estimateTokens(section.content);
    dropped.add(section.key);
  }

  return sections
    .filter((s) => !dropped.has(s.key))
    .map((s) => s.content);
}
