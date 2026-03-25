import fs from "node:fs";
import path from "node:path";
import type { Finding } from "../types.js";

/**
 * Detect code patterns and conventions that are non-obvious.
 * This is the core intelligence layer -- finding things agents miss.
 */
export async function detectPatterns(
  dir: string,
  files: string[],
  frameworks: string[]
): Promise<Finding[]> {
  const findings: Finding[] = [];

  // Only analyze source files
  const sourceFiles = files.filter(
    (f) =>
      f.endsWith(".ts") ||
      f.endsWith(".tsx") ||
      f.endsWith(".js") ||
      f.endsWith(".jsx")
  );

  // Sample files for pattern detection (don't read everything)
  const sampled = sampleFiles(sourceFiles, 50);
  const fileContents = new Map<string, string>();

  for (const file of sampled) {
    try {
      const content = fs.readFileSync(path.join(dir, file), "utf-8");
      fileContents.set(file, content);
    } catch {
      // skip unreadable files
    }
  }

  // --- Barrel exports detection ---
  findings.push(...detectBarrelExports(files, fileContents));

  // --- Import style detection ---
  findings.push(...detectImportPatterns(fileContents));

  // --- Environment variable patterns ---
  findings.push(...detectEnvPatterns(dir, files, fileContents));

  // --- Error handling patterns ---
  findings.push(...detectErrorHandling(fileContents));

  // --- Export patterns ---
  findings.push(...detectExportPatterns(fileContents));

  // Filter out discoverable findings
  return findings.filter((f) => !f.discoverable);
}

function sampleFiles(files: string[], maxCount: number): string[] {
  if (files.length <= maxCount) return files;

  // Prioritize: entry points, configs, then random sample
  const priority = files.filter(
    (f) =>
      f.includes("index.") ||
      f.includes("config.") ||
      f.includes("app.") ||
      f.includes("layout.") ||
      f.includes("middleware.")
  );

  const rest = files.filter((f) => !priority.includes(f));
  const shuffled = rest.sort(() => Math.random() - 0.5);

  return [...priority, ...shuffled].slice(0, maxCount);
}

function detectBarrelExports(
  files: string[],
  contents: Map<string, string>
): Finding[] {
  const indexFiles = files.filter(
    (f) => path.basename(f).startsWith("index.") && !f.includes("node_modules")
  );

  if (indexFiles.length < 3) return [];

  // Check if index files are barrel exports (re-exporting)
  let barrelCount = 0;
  for (const indexFile of indexFiles) {
    const content = contents.get(indexFile);
    if (content && /export\s+\{.*\}\s+from|export\s+\*\s+from/.test(content)) {
      barrelCount++;
    }
  }

  if (barrelCount >= 3) {
    return [
      {
        category: "Import conventions",
        description:
          "Project uses barrel exports (index.ts files that re-export). Import from the directory, not from deep paths.",
        evidence: `${barrelCount} barrel export files found`,
        confidence: "high",
        discoverable: false,
      },
    ];
  }

  return [];
}

function detectImportPatterns(contents: Map<string, string>): Finding[] {
  const findings: Finding[] = [];
  let aliasImports = 0;
  let relativeImports = 0;
  let absoluteImports = 0;

  for (const [, content] of contents) {
    const imports = content.match(/from\s+['"]([^'"]+)['"]/g) || [];
    for (const imp of imports) {
      const importPath = imp.match(/['"]([^'"]+)['"]/)?.[1] || "";
      if (importPath.startsWith("@/") || importPath.startsWith("~/")) {
        aliasImports++;
      } else if (importPath.startsWith(".")) {
        relativeImports++;
      } else if (!importPath.startsWith("@") && !importPath.includes("/")) {
        absoluteImports++;
      }
    }
  }

  const total = aliasImports + relativeImports;
  if (total > 10 && aliasImports > relativeImports * 2) {
    findings.push({
      category: "Import conventions",
      description:
        "Project strongly prefers path alias imports (@/ or ~/) over relative imports. Use aliases for cross-directory imports.",
      evidence: `${aliasImports} alias imports vs ${relativeImports} relative imports in sampled files`,
      confidence: "high",
      discoverable: false,
    });
  }

  return findings;
}

function detectEnvPatterns(
  dir: string,
  files: string[],
  contents: Map<string, string>
): Finding[] {
  const findings: Finding[] = [];

  // Check for .env.example or .env.local
  const hasEnvExample =
    files.includes(".env.example") || files.includes(".env.sample");
  const hasEnvLocal = files.includes(".env.local");
  const hasEnv = files.includes(".env");

  if (hasEnvExample) {
    findings.push({
      category: "Environment",
      description:
        "Environment variables are documented in .env.example. Copy it to .env.local before running the project.",
      confidence: "high",
      discoverable: false,
    });
  }

  // Detect which env vars are used in code
  const envVars = new Set<string>();
  for (const [, content] of contents) {
    const matches = content.matchAll(/process\.env\.(\w+)|import\.meta\.env\.(\w+)/g);
    for (const match of matches) {
      envVars.add(match[1] || match[2]);
    }
  }

  if (envVars.size > 0) {
    // Check for NEXT_PUBLIC_ prefix pattern
    const publicVars = [...envVars].filter((v) =>
      v.startsWith("NEXT_PUBLIC_") || v.startsWith("VITE_") || v.startsWith("EXPO_PUBLIC_")
    );
    const privateVars = [...envVars].filter(
      (v) =>
        !v.startsWith("NEXT_PUBLIC_") &&
        !v.startsWith("VITE_") &&
        !v.startsWith("EXPO_PUBLIC_") &&
        !v.startsWith("NODE_ENV")
    );

    if (publicVars.length > 0 && privateVars.length > 0) {
      findings.push({
        category: "Environment",
        description: `${envVars.size} env vars detected. Public (browser-exposed): ${publicVars.slice(0, 3).join(", ")}${publicVars.length > 3 ? "..." : ""}. Private (server-only): ${privateVars.slice(0, 3).join(", ")}${privateVars.length > 3 ? "..." : ""}.`,
        rationale:
          "Agents sometimes expose private env vars to the client by using the wrong prefix.",
        confidence: "medium",
        discoverable: false,
      });
    }
  }

  return findings;
}

function detectErrorHandling(contents: Map<string, string>): Finding[] {
  const findings: Finding[] = [];

  let tryCatchCount = 0;
  let errorBoundaryCount = 0;
  let customErrorClasses = 0;

  for (const [, content] of contents) {
    tryCatchCount += (content.match(/try\s*\{/g) || []).length;
    if (content.includes("ErrorBoundary")) errorBoundaryCount++;
    if (/class\s+\w+Error\s+extends\s+(Error|BaseError)/.test(content)) {
      customErrorClasses++;
    }
  }

  if (customErrorClasses >= 2) {
    findings.push({
      category: "Error handling",
      description:
        "Project uses custom error classes. Throw specific error types instead of generic Error.",
      confidence: "medium",
      discoverable: false,
    });
  }

  return findings;
}

function detectExportPatterns(contents: Map<string, string>): Finding[] {
  const findings: Finding[] = [];
  let defaultExports = 0;
  let namedExports = 0;

  for (const [, content] of contents) {
    defaultExports += (content.match(/export\s+default\s/g) || []).length;
    namedExports += (content.match(/export\s+(const|function|class|type|interface)\s/g) || []).length;
  }

  const total = defaultExports + namedExports;
  if (total > 10) {
    if (namedExports > defaultExports * 3) {
      findings.push({
        category: "Export conventions",
        description:
          "Project strongly prefers named exports over default exports. Use `export function` / `export const`, not `export default`.",
        evidence: `${namedExports} named vs ${defaultExports} default exports in sampled files`,
        confidence: "high",
        discoverable: false,
      });
    } else if (defaultExports > namedExports * 2) {
      findings.push({
        category: "Export conventions",
        description:
          "Project prefers default exports. Use `export default` for main module exports.",
        evidence: `${defaultExports} default vs ${namedExports} named exports in sampled files`,
        confidence: "medium",
        discoverable: false,
      });
    }
  }

  return findings;
}
