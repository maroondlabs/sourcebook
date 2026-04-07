import fs from "node:fs";
import path from "node:path";

// Headers that sourcebook generates — anything else is user-added
export const SOURCEBOOK_HEADERS = new Set([
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
  "Before Making Changes",
  "Copilot Instructions",
  "Development Commands",
  "Important Constraints",
  "Technology Stack",
  "High-Impact Files",
  "Code Conventions",
  "Constraints",
  "Quick Reference",
  "Dominant Patterns",
]);

/**
 * Read an existing file from the project directory.
 */
export function readExisting(dir: string, filename: string): string | null {
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
export function parseSections(content: string): { header: string; body: string }[] {
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

export function isSourcebookSection(header: string): boolean {
  return SOURCEBOOK_HEADERS.has(header) || header === "";
}

export function countManualSections(content: string): number {
  const sections = parseSections(content);
  return sections.filter((s) => s.header && !isSourcebookSection(s.header)).length;
}

/**
 * Merge fresh sourcebook output with existing content,
 * preserving any manually added sections.
 */
export function mergeContent(existing: string, fresh: string): string {
  const existingSections = parseSections(existing);
  const freshSections = parseSections(fresh);

  const manualSections = existingSections.filter(
    (s) => s.header && !isSourcebookSection(s.header)
  );

  if (manualSections.length === 0) return fresh;

  const result: string[] = [];
  let insertedManual = false;

  for (const section of freshSections) {
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

  if (!insertedManual) {
    for (const manual of manualSections) {
      result.push(`## ${manual.header}`);
      result.push(manual.body);
    }
  }

  return result.join("\n");
}
