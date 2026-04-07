import { describe, it, expect } from "vitest";
import { stripComments, sampleFiles } from "../src/scanner/patterns.js";
import { detectLanguages, detectRepoMode } from "../src/scanner/index.js";

describe("stripComments", () => {
  it("strips JS single-line comments", () => {
    const input = `const x = 1; // this is a comment\nconst y = 2;`;
    const result = stripComments(input);
    expect(result).not.toContain("this is a comment");
    expect(result).toContain("const x = 1;");
    expect(result).toContain("const y = 2;");
  });

  it("strips JS block comments", () => {
    const input = `/* block comment */\nconst x = 1;`;
    const result = stripComments(input);
    expect(result).not.toContain("block comment");
    expect(result).toContain("const x = 1;");
  });

  it("strips JSDoc comments", () => {
    const input = `/** @param {string} name */\nfunction foo() {}`;
    const result = stripComments(input);
    expect(result).not.toContain("@param");
    expect(result).toContain("function foo()");
  });

  it("strips Python triple-quote docstrings", () => {
    const input = `def foo():\n    """This is a docstring"""\n    pass`;
    const result = stripComments(input);
    expect(result).not.toContain("This is a docstring");
    expect(result).toContain("def foo():");
    expect(result).toContain("pass");
  });

  it("strips Python single-quote docstrings", () => {
    const input = `'''Another docstring'''\ncode_here`;
    const result = stripComments(input);
    expect(result).not.toContain("Another docstring");
    expect(result).toContain("code_here");
  });

  it("strips HTML comments", () => {
    const input = `<!-- HTML comment -->\n<div>content</div>`;
    const result = stripComments(input);
    expect(result).not.toContain("HTML comment");
    expect(result).toContain("<div>content</div>");
  });

  it("strips multiline block comments", () => {
    const input = `/*\n * Line 1\n * Line 2\n */\nconst x = 1;`;
    const result = stripComments(input);
    expect(result).not.toContain("Line 1");
    expect(result).toContain("const x = 1;");
  });

  it("preserves string content that looks like comments", () => {
    const input = `const url = "https://example.com";`;
    const result = stripComments(input);
    expect(result).toContain("https:");
  });
});

describe("sampleFiles", () => {
  it("returns all files when under maxCount", () => {
    const files = ["src/a.ts", "src/b.ts", "src/c.ts"];
    const result = sampleFiles(files, 50);
    expect(result).toHaveLength(3);
  });

  it("prioritizes entry point files", () => {
    const files = Array.from({ length: 100 }, (_, i) => `src/file${i}.ts`);
    files.push("src/index.ts", "src/config.ts", "src/app.ts");
    const result = sampleFiles(files, 10);
    expect(result).toContain("src/index.ts");
    expect(result).toContain("src/config.ts");
    expect(result).toContain("src/app.ts");
  });

  it("includes high-import files from importance hints", () => {
    const files = Array.from({ length: 100 }, (_, i) => `src/file${i}.ts`);
    const hints = {
      highImportFiles: ["src/file50.ts", "src/file75.ts"],
      highChurnFiles: [],
    };
    const result = sampleFiles(files, 20, hints);
    expect(result).toContain("src/file50.ts");
    expect(result).toContain("src/file75.ts");
  });

  it("includes high-churn files from importance hints", () => {
    const files = Array.from({ length: 100 }, (_, i) => `src/file${i}.ts`);
    const hints = {
      highImportFiles: [],
      highChurnFiles: ["src/file99.ts"],
    };
    const result = sampleFiles(files, 20, hints);
    expect(result).toContain("src/file99.ts");
  });

  it("deduplicates across tiers", () => {
    const files = ["src/index.ts", "src/a.ts", "src/b.ts"];
    const hints = {
      highImportFiles: ["src/index.ts"], // already in entry points
      highChurnFiles: ["src/index.ts"],
    };
    const result = sampleFiles(files, 50);
    const indexCount = result.filter((f) => f === "src/index.ts").length;
    expect(indexCount).toBe(1);
  });

  it("respects maxCount limit", () => {
    const files = Array.from({ length: 200 }, (_, i) => `src/file${i}.ts`);
    const result = sampleFiles(files, 50);
    expect(result.length).toBeLessThanOrEqual(50);
  });

  it("excludes .d.ts files", () => {
    const files = ["src/types.d.ts", "src/globals.d.ts", "src/a.ts"];
    const result = sampleFiles(files, 50);
    expect(result).not.toContain("src/types.d.ts");
    expect(result).toContain("src/a.ts");
  });

  it("excludes docs/ directory files", () => {
    const files = ["docs/guide.ts", "src/a.ts"];
    const result = sampleFiles(files, 50);
    expect(result).not.toContain("docs/guide.ts");
    expect(result).toContain("src/a.ts");
  });
});

describe("detectLanguages", () => {
  it("detects TypeScript from .ts and .tsx files", () => {
    const result = detectLanguages(["src/app.ts", "src/page.tsx"]);
    expect(result).toContain("TypeScript");
  });

  it("detects JavaScript from .js and .jsx files", () => {
    const result = detectLanguages(["src/app.js", "src/page.jsx"]);
    expect(result).toContain("JavaScript");
  });

  it("detects Python", () => {
    const result = detectLanguages(["src/main.py"]);
    expect(result).toContain("Python");
  });

  it("detects Go", () => {
    const result = detectLanguages(["main.go"]);
    expect(result).toContain("Go");
  });

  it("detects multiple languages", () => {
    const result = detectLanguages(["app.ts", "main.py", "server.go"]);
    expect(result).toContain("TypeScript");
    expect(result).toContain("Python");
    expect(result).toContain("Go");
  });

  it("ignores unknown extensions", () => {
    const result = detectLanguages(["README.md", "data.csv", ".gitignore"]);
    expect(result).toHaveLength(0);
  });

  it("deduplicates languages", () => {
    const result = detectLanguages(["a.ts", "b.ts", "c.tsx"]);
    expect(result.filter((l) => l === "TypeScript")).toHaveLength(1);
  });
});

describe("detectRepoMode", () => {
  it("defaults to app mode", () => {
    const result = detectRepoMode("/fake", ["src/index.ts"], []);
    expect(result).toBe("app");
  });

  it("detects monorepo from pnpm-workspace.yaml", () => {
    const result = detectRepoMode("/fake", ["pnpm-workspace.yaml", "packages/a/index.ts"], []);
    expect(result).toBe("monorepo");
  });

  it("detects monorepo from turbo.json", () => {
    const result = detectRepoMode("/fake", ["turbo.json", "apps/web/index.ts"], []);
    expect(result).toBe("monorepo");
  });

  it("detects monorepo from lerna.json", () => {
    const result = detectRepoMode("/fake", ["lerna.json", "packages/a/index.ts"], []);
    expect(result).toBe("monorepo");
  });

  it("returns app when app framework is present", () => {
    const result = detectRepoMode("/fake", ["src/index.ts", "app/page.tsx"], ["Next.js"]);
    expect(result).toBe("app");
  });
});
