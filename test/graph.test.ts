import { describe, it, expect } from "vitest";
import { extractImports, resolveImport, pageRank } from "../src/scanner/graph.js";
import type { ImportEdge } from "../src/scanner/graph.js";

describe("extractImports", () => {
  it("extracts ES import statements", () => {
    const content = `import { foo } from "./utils";\nimport bar from "../lib/bar";`;
    const result = extractImports(content);
    expect(result).toContain("./utils");
    expect(result).toContain("../lib/bar");
  });

  it("extracts dynamic imports", () => {
    const content = `const mod = await import("./lazy-module");`;
    const result = extractImports(content);
    expect(result).toContain("./lazy-module");
  });

  it("extracts require calls", () => {
    const content = `const fs = require("fs");\nconst utils = require("./utils");`;
    const result = extractImports(content);
    expect(result).toContain("./utils");
  });

  it("filters out non-relative imports (npm packages)", () => {
    const content = `import express from "express";\nimport { foo } from "./local";`;
    const result = extractImports(content);
    expect(result).not.toContain("express");
    expect(result).toContain("./local");
  });

  it("includes alias imports (@/ and ~/)", () => {
    const content = `import { api } from "@/lib/api";\nimport { db } from "~/db";`;
    const result = extractImports(content);
    expect(result).toContain("@/lib/api");
    expect(result).toContain("~/db");
  });

  it("extracts re-exports", () => {
    const content = `export { default } from "./component";`;
    const result = extractImports(content);
    expect(result).toContain("./component");
  });

  it("ignores imports inside block comments", () => {
    const content = `/* import { foo } from "./commented-out"; */\nimport { bar } from "./real";`;
    const result = extractImports(content);
    expect(result).not.toContain("./commented-out");
    expect(result).toContain("./real");
  });

  it("returns empty array for no imports", () => {
    const content = `const x = 1;\nconsole.log(x);`;
    const result = extractImports(content);
    expect(result).toHaveLength(0);
  });
});

describe("resolveImport", () => {
  it("resolves relative imports", () => {
    const fileSet = new Set(["src/utils.ts"]);
    const result = resolveImport("./utils", "src/index.ts", fileSet, "/project");
    expect(result).toBe("src/utils.ts");
  });

  it("resolves parent directory imports", () => {
    // ../lib/helpers from src/deep/file.ts resolves to src/lib/helpers (not lib/helpers)
    // because path.normalize(path.join("src/deep", "../lib/helpers")) = "src/lib/helpers"
    const fileSet = new Set(["src/lib/helpers.ts"]);
    const result = resolveImport("../lib/helpers", "src/deep/file.ts", fileSet, "/project");
    expect(result).toBe("src/lib/helpers.ts");
  });

  it("resolves @/ alias imports to src/", () => {
    const fileSet = new Set(["src/lib/api.ts"]);
    const result = resolveImport("@/lib/api", "src/pages/home.tsx", fileSet, "/project");
    expect(result).toBe("src/lib/api.ts");
  });

  it("resolves ~/ alias imports to src/", () => {
    const fileSet = new Set(["src/db.ts"]);
    const result = resolveImport("~/db", "src/api/handler.ts", fileSet, "/project");
    expect(result).toBe("src/db.ts");
  });

  it("resolves .js extension to .ts file", () => {
    const fileSet = new Set(["src/types.ts"]);
    const result = resolveImport("./types.js", "src/index.ts", fileSet, "/project");
    expect(result).toBe("src/types.ts");
  });

  it("resolves directory to index.ts", () => {
    const fileSet = new Set(["src/utils/index.ts"]);
    const result = resolveImport("./utils", "src/app.ts", fileSet, "/project");
    expect(result).toBe("src/utils/index.ts");
  });

  it("returns null for unresolvable imports", () => {
    const fileSet = new Set(["src/other.ts"]);
    const result = resolveImport("./nonexistent", "src/index.ts", fileSet, "/project");
    expect(result).toBeNull();
  });
});

describe("pageRank", () => {
  it("computes scores for a simple graph", () => {
    const nodes = ["a", "b", "c"];
    const edges: ImportEdge[] = [
      { from: "a", to: "b" },
      { from: "a", to: "c" },
      { from: "b", to: "c" },
    ];
    const scores = pageRank(nodes, edges, 20, 0.85);
    expect(scores.size).toBe(3);
    // c should have highest score (most imports point to it)
    expect(scores.get("c")!).toBeGreaterThan(scores.get("a")!);
  });

  it("gives higher score to hub files (high fan-in)", () => {
    const nodes = ["hub", "a", "b", "c", "d"];
    const edges: ImportEdge[] = [
      { from: "a", to: "hub" },
      { from: "b", to: "hub" },
      { from: "c", to: "hub" },
      { from: "d", to: "hub" },
    ];
    const scores = pageRank(nodes, edges, 20, 0.85);
    const hubScore = scores.get("hub")!;
    expect(hubScore).toBeGreaterThan(scores.get("a")!);
    expect(hubScore).toBeGreaterThan(scores.get("b")!);
  });

  it("produces non-zero scores for all nodes", () => {
    const nodes = ["a", "b", "c"];
    const edges: ImportEdge[] = [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ];
    const scores = pageRank(nodes, edges, 20, 0.85);
    for (const node of nodes) {
      expect(scores.get(node)!).toBeGreaterThan(0);
    }
  });

  it("handles isolated nodes", () => {
    const nodes = ["a", "b", "isolated"];
    const edges: ImportEdge[] = [{ from: "a", to: "b" }];
    const scores = pageRank(nodes, edges, 20, 0.85);
    expect(scores.has("isolated")).toBe(true);
    expect(scores.get("isolated")!).toBeGreaterThan(0);
  });
});
