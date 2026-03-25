import { describe, it, expect } from "vitest";
import { generateClaude } from "../src/generators/claude.js";
import { generateCursor, generateCursorLegacy } from "../src/generators/cursor.js";
import { generateCopilot } from "../src/generators/copilot.js";
import type { ProjectScan } from "../src/types.js";

const mockScan: ProjectScan = {
  dir: "/test",
  files: ["src/index.ts", "src/utils.ts", "src/types.ts"],
  languages: ["TypeScript"],
  frameworks: ["Vite + React", "TypeScript"],
  commands: {
    dev: "vite",
    build: "tsc && vite build",
    test: "vitest",
  },
  structure: {
    entryPoints: ["src/index.ts"],
    directories: { lib: "shared utilities" },
    findings: [],
  },
  findings: [
    {
      category: "Hidden dependencies",
      description: "App.tsx and tailwind.config.js always change together (5 co-commits)",
      confidence: "high",
      discoverable: false,
    },
    {
      category: "Export conventions",
      description: "Strongly prefers named exports (30:5 ratio)",
      confidence: "high",
      discoverable: false,
    },
    {
      category: "Tailwind",
      description: "Custom color tokens defined in tailwind.config",
      confidence: "medium",
      discoverable: false,
    },
  ],
  rankedFiles: [
    { file: "src/utils.ts", score: 0.35 },
    { file: "src/types.ts", score: 0.25 },
  ],
};

describe("generateClaude", () => {
  it("generates valid CLAUDE.md", () => {
    const output = generateClaude(mockScan, 4000);
    expect(output).toContain("# CLAUDE.md");
    expect(output).toContain("## Commands");
    expect(output).toContain("`vite`");
    expect(output).toContain("## Critical Constraints");
    expect(output).toContain("Hidden dependencies");
    expect(output).toContain("## Core Modules");
    expect(output).toContain("src/utils.ts");
    expect(output).toContain("## What to Add Manually");
  });

  it("respects token budget", () => {
    const output = generateClaude(mockScan, 50);
    expect(output.length).toBeLessThan(250);
  });
});

describe("generateCursor", () => {
  it("generates valid .mdc with frontmatter", () => {
    const output = generateCursor(mockScan, 4000);
    expect(output).toContain("---");
    expect(output).toContain("alwaysApply: true");
    expect(output).toContain("## Commands");
    expect(output).toContain("## Constraints");
  });

  it("legacy format strips frontmatter", () => {
    const mdc = generateCursor(mockScan, 4000);
    const legacy = generateCursorLegacy(mockScan, 4000);
    expect(mdc).toContain("---");
    expect(legacy).not.toMatch(/^---/);
    expect(legacy).toContain("## Commands");
  });
});

describe("generateCopilot", () => {
  it("generates valid copilot-instructions.md", () => {
    const output = generateCopilot(mockScan, 4000);
    expect(output).toContain("# Copilot Instructions");
    expect(output).toContain("## Development Commands");
    expect(output).toContain("## Important Constraints");
    expect(output).toContain("## Technology Stack");
    expect(output).toContain("Vite + React");
    expect(output).toContain("## High-Impact Files");
  });
});
