import path from "node:path";
import type { StructureAnalysis, Finding } from "../types.js";

export function detectProjectStructure(
  dir: string,
  files: string[]
): StructureAnalysis {
  const findings: Finding[] = [];
  const directories: Record<string, string> = {};
  const entryPoints: string[] = [];

  // Detect top-level directory purposes
  const topDirs = new Set<string>();
  for (const file of files) {
    const parts = file.split(path.sep);
    if (parts.length > 1) topDirs.add(parts[0]);
  }

  // Common directory purpose detection
  const dirPurposes: Record<string, string> = {
    src: "Source code",
    lib: "Library code",
    app: "Application routes / pages",
    pages: "Page routes",
    components: "UI components",
    hooks: "Custom React hooks",
    utils: "Utility functions",
    helpers: "Helper functions",
    services: "Service layer / API clients",
    api: "API routes or endpoints",
    server: "Server-side code",
    public: "Static assets",
    assets: "Static assets",
    styles: "Stylesheets",
    types: "TypeScript type definitions",
    config: "Configuration files",
    scripts: "Build / utility scripts",
    test: "Tests",
    tests: "Tests",
    __tests__: "Tests",
    e2e: "End-to-end tests",
    docs: "Documentation",
    migrations: "Database migrations",
    supabase: "Supabase configuration and migrations",
    prisma: "Prisma schema and migrations",
    context: "Context / state management",
    store: "State store",
    features: "Feature modules",
    modules: "Feature modules",
    middleware: "Middleware",
  };

  for (const d of topDirs) {
    if (dirPurposes[d]) {
      directories[d] = dirPurposes[d];
    }
  }

  // Detect layout pattern
  const hasFeatureDirs = topDirs.has("features") || topDirs.has("modules");
  const hasLayerDirs =
    topDirs.has("components") &&
    (topDirs.has("services") || topDirs.has("utils"));

  if (hasFeatureDirs) {
    findings.push({
      category: "Project structure",
      description:
        "Feature-based architecture. Group new code by feature, not by type (don't put components in a global components/ folder).",
      rationale:
        "Agents default to layer-based grouping. Feature-based projects break when you scatter feature code across type folders.",
      confidence: "high",
      discoverable: false,
    });
  }

  // Detect src/ vs root layout
  const hasSrc = topDirs.has("src");
  if (hasSrc) {
    // Check if there's code at both root and src/ (messy)
    const rootCode = files.some(
      (f) =>
        !f.includes(path.sep) &&
        (f.endsWith(".ts") || f.endsWith(".js")) &&
        f !== "next.config.js" &&
        f !== "next.config.ts" &&
        f !== "vite.config.ts" &&
        f !== "tailwind.config.ts" &&
        f !== "postcss.config.js" &&
        f !== "vitest.config.ts"
    );
    if (rootCode) {
      findings.push({
        category: "Project structure",
        description:
          "Source code lives in src/ but some code files exist at the root. Keep application code in src/.",
        confidence: "medium",
        discoverable: false,
      });
    }
  }

  // Detect entry points
  const commonEntries = [
    "src/index.ts",
    "src/index.tsx",
    "src/main.ts",
    "src/main.tsx",
    "src/app.ts",
    "src/app.tsx",
    "index.ts",
    "index.tsx",
    "src/cli.ts",
    "app/layout.tsx",
    "app/page.tsx",
    "pages/index.tsx",
    "pages/_app.tsx",
    "src/server.ts",
    "server.ts",
  ];

  for (const entry of commonEntries) {
    if (files.includes(entry)) entryPoints.push(entry);
  }

  // Detect monorepo
  const hasWorkspaces = files.includes("pnpm-workspace.yaml");
  const hasLernaJson = files.includes("lerna.json");
  const hasPackagesDir = topDirs.has("packages") || topDirs.has("apps");

  if (hasWorkspaces || hasLernaJson || hasPackagesDir) {
    findings.push({
      category: "Project structure",
      description:
        "This is a monorepo. Changes may affect multiple packages. Check workspace dependencies before modifying shared code.",
      confidence: "high",
      discoverable: false,
    });
  }

  // Detect test co-location vs separate test dir
  const colocatedTests = files.some(
    (f) =>
      f.includes(".test.") || f.includes(".spec.")
  );
  const separateTestDir = topDirs.has("test") || topDirs.has("tests") || topDirs.has("__tests__");

  if (colocatedTests && !separateTestDir) {
    findings.push({
      category: "Testing",
      description:
        "Tests are co-located with source files (*.test.ts next to *.ts). Keep this pattern -- don't create a separate test/ directory.",
      confidence: "high",
      discoverable: false,
    });
  } else if (separateTestDir && !colocatedTests) {
    findings.push({
      category: "Testing",
      description:
        "Tests live in a separate test/ directory, mirroring src/ structure. New tests go there, not next to source files.",
      confidence: "high",
      discoverable: false,
    });
  }

  return {
    layout: hasFeatureDirs
      ? "feature-based"
      : hasLayerDirs
        ? "layer-based"
        : undefined,
    entryPoints,
    directories,
    findings,
  };
}
