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
  return {
    critical: findings.filter((f) => f.confidence === "high" && isCritical(f)),
    important: findings.filter((f) => f.confidence === "high" && !isCritical(f)),
    supplementary: findings.filter((f) => f.confidence === "medium"),
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
