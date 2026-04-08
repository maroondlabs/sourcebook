import fs from "node:fs";
import path from "node:path";
import type { Finding } from "../types.js";

function safePath(dir: string, file: string): string | null {
  const resolved = path.resolve(path.join(dir, file));
  if (!resolved.startsWith(path.resolve(dir) + path.sep) && resolved !== path.resolve(dir)) {
    return null;
  }
  return resolved;
}

/**
 * Detect code patterns and conventions that are non-obvious.
 * This is the core intelligence layer -- finding things agents miss.
 */
export async function detectPatterns(
  dir: string,
  files: string[],
  frameworks: string[],
  repoMode: "app" | "library" | "monorepo" = "app",
  importanceHints?: { highImportFiles: string[]; highChurnFiles: string[] }
): Promise<Finding[]> {
  const findings: Finding[] = [];

  // Analyze source files (JS/TS + Python + Go)
  const sourceFiles = files.filter(
    (f) =>
      (f.endsWith(".ts") ||
      f.endsWith(".tsx") ||
      f.endsWith(".js") ||
      f.endsWith(".jsx") ||
      f.endsWith(".py") ||
      f.endsWith(".go")) &&
      !f.endsWith(".d.ts") &&
      !/(?:^|\/)docs?\//i.test(f)
  );

  // Sample files for pattern detection (don't read everything)
  const sampled = sampleFiles(sourceFiles, 50, importanceHints);
  const fileContents = new Map<string, string>();

  for (const file of sampled) {
    const safe = safePath(dir, file);
    if (!safe) continue;
    try {
      const content = stripComments(fs.readFileSync(safe, "utf-8"));
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
  findings.push(...detectExportPatterns(fileContents, repoMode));

  // --- Python conventions ---
  findings.push(...detectPythonConventions(files, fileContents));

  // --- Go conventions ---
  findings.push(...detectGoConventions(files, fileContents));

  // --- Dominant API/usage patterns ---
  findings.push(...detectDominantPatterns(dir, files, fileContents, frameworks, repoMode));

  // Filter out discoverable findings
  return findings.filter((f) => !f.discoverable);
}

/**
 * Strip comments from source code before pattern matching.
 * Prevents false positives from commented-out code or documentation.
 */
export function stripComments(content: string): string {
  // HTML comments
  content = content.replace(/<!--[\s\S]*?-->/g, "");
  // Python triple-quoted docstrings
  content = content.replace(/"""[\s\S]*?"""/g, '""');
  content = content.replace(/'''[\s\S]*?'''/g, "''");
  // Block and JSDoc comments (/* ... */ and /** ... */)
  content = content.replace(/\/\*[\s\S]*?\*\//g, "");
  // Single-line comments (// ...)
  content = content.replace(/\/\/[^\n]*/g, "");
  return content;
}

export function sampleFiles(
  files: string[],
  maxCount: number,
  importanceHints?: { highImportFiles: string[]; highChurnFiles: string[] }
): string[] {
  // Exclude .d.ts declaration files, docs dirs, example dirs, and benchmark dirs
  const filtered = files.filter(
    (f) =>
      !f.endsWith(".d.ts") &&
      !/(?:^|\/)docs?(?:[_-][^/]+)?\//i.test(f) &&
      !/(?:^|\/)examples?(?:[_-][^/]+)?\//i.test(f) &&
      !/(?:^|\/)benchmarks?\//i.test(f)
  );

  if (filtered.length <= maxCount) return filtered;

  const filteredSet = new Set(filtered);
  const selected = new Set<string>();

  // Tier 1: Entry points and configs (guaranteed)
  // Includes TS/JS conventions (index., app.) and Python conventions (__init__.py, main.py)
  for (const f of filtered) {
    const base = path.basename(f);
    if (
      f.includes("index.") ||
      f.includes("config.") ||
      f.includes("app.") ||
      f.includes("layout.") ||
      f.includes("middleware.") ||
      base === "__init__.py" ||   // Python package entry point
      base === "main.py"          // Python app/script entry point
    ) {
      selected.add(f);
    }
  }

  // Tier 2: High-import files (up to 10, from importance hints)
  if (importanceHints?.highImportFiles) {
    let added = 0;
    for (const f of importanceHints.highImportFiles) {
      if (added >= 10) break;
      if (filteredSet.has(f) && !selected.has(f)) {
        selected.add(f);
        added++;
      }
    }
  }

  // Tier 3: High-churn files (up to 5, from importance hints)
  if (importanceHints?.highChurnFiles) {
    let added = 0;
    for (const f of importanceHints.highChurnFiles) {
      if (added >= 5) break;
      if (filteredSet.has(f) && !selected.has(f)) {
        selected.add(f);
        added++;
      }
    }
  }

  // Tier 4: Stratified fill from remaining files
  const remaining = filtered.filter((f) => !selected.has(f));
  const sorted = remaining.sort();
  const slotsLeft = maxCount - selected.size;
  if (slotsLeft > 0 && sorted.length > 0) {
    const step = Math.max(1, Math.floor(sorted.length / slotsLeft));
    for (let i = 0; i < sorted.length && selected.size < maxCount; i += step) {
      selected.add(sorted[i]);
    }
  }

  return [...selected].slice(0, maxCount);
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

function detectPythonConventions(
  files: string[],
  contents: Map<string, string>
): Finding[] {
  const findings: Finding[] = [];
  const pyFiles = [...contents.entries()].filter(([f]) => f.endsWith(".py"));
  if (pyFiles.length < 3) return findings;

  // Detect __init__.py barrel pattern
  const initFiles = files.filter((f) => f.endsWith("__init__.py"));
  const nonEmptyInits = initFiles.filter((f) => {
    const content = contents.get(f);
    return content && content.trim().length > 10;
  });
  if (nonEmptyInits.length >= 3) {
    findings.push({
      category: "Python conventions",
      description: "Uses __init__.py as barrel exports. Import from the package, not from internal modules.",
      evidence: `${nonEmptyInits.length} non-empty __init__.py files`,
      confidence: "high",
      discoverable: false,
    });
  }

  // Detect type hint usage
  let typeHintCount = 0;
  let noHintCount = 0;
  for (const [, content] of pyFiles) {
    const funcDefs = content.match(/def\s+\w+\s*\([^)]*\)/g) || [];
    for (const def of funcDefs) {
      if (def.includes(":") && def.includes("->")) typeHintCount++;
      else noHintCount++;
    }
  }
  if (typeHintCount + noHintCount > 10 && typeHintCount > noHintCount * 2) {
    findings.push({
      category: "Python conventions",
      description: "Project uses type hints extensively. Add type annotations to all new functions.",
      evidence: `${typeHintCount} typed vs ${noHintCount} untyped function signatures`,
      confidence: "high",
      discoverable: false,
    });
  }

  return findings;
}

function detectGoConventions(
  files: string[],
  contents: Map<string, string>
): Finding[] {
  const findings: Finding[] = [];
  const goFiles = [...contents.entries()].filter(([f]) => f.endsWith(".go"));
  if (goFiles.length < 3) return findings;

  // Detect error handling style
  let errNilCount = 0;
  let errWrapCount = 0;
  for (const [, content] of goFiles) {
    errNilCount += (content.match(/if\s+err\s*!=\s*nil/g) || []).length;
    errWrapCount += (content.match(/fmt\.Errorf\(.*%w/g) || []).length;
  }

  if (errWrapCount > 5 && errWrapCount > errNilCount * 0.3) {
    findings.push({
      category: "Go conventions",
      description: "Project wraps errors with fmt.Errorf(%w). Use error wrapping, not bare returns.",
      evidence: `${errWrapCount} wrapped errors found`,
      confidence: "high",
      discoverable: false,
    });
  }

  // Detect interface-first design
  let interfaceCount = 0;
  for (const [, content] of goFiles) {
    interfaceCount += (content.match(/type\s+\w+\s+interface\s*\{/g) || []).length;
  }
  if (interfaceCount >= 5) {
    findings.push({
      category: "Go conventions",
      description: `Project uses interface-first design (${interfaceCount} interfaces). Define interfaces at the consumer, not the producer.`,
      confidence: "medium",
      discoverable: false,
    });
  }

  return findings;
}

/**
 * Detect dominant API/usage patterns — the conventions humans naturally
 * put in handwritten briefs but agents can't infer from structure alone.
 *
 * This closes the gap between sourcebook and handwritten context.
 */
function detectDominantPatterns(
  dir: string,
  files: string[],
  contents: Map<string, string>,
  frameworks: string[],
  repoMode: "app" | "library" | "monorepo" = "app"
): Finding[] {
  const findings: Finding[] = [];

  // Read MORE files for pattern detection — we need a wider sample
  // to detect dominant patterns reliably
  const allSource = files.filter(
    (f) =>
      (f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".js") || f.endsWith(".jsx") ||
       f.endsWith(".py") || f.endsWith(".go")) &&
      !f.endsWith(".d.ts") &&
      !/(?:^|\/)docs?(?:[_-][^/]+)?\//i.test(f) &&
      !/(?:^|\/)examples?(?:[_-][^/]+)?\//i.test(f) &&
      !f.includes("node_modules") &&
      // Exclude JS/TS test files (by extension)
      !f.includes(".test.") && !f.includes(".spec.") &&
      // Exclude files in test/ or tests/ directories (covers Python, Go, and JS repos like fastify)
      !/(?:^|\/)tests?\//i.test(f) &&
      // Exclude Python test files by naming convention
      !/(?:^|\/)test_[^/]+\.py$/.test(f) && !/[^/]+_test\.py$/.test(f)
  );

  // Read up to 100 additional files for pattern counts (deterministic sample)
  const sorted = allSource.slice().sort();
  const step = Math.max(1, Math.floor(sorted.length / 100));
  const extraSample = sorted.filter((_, i) => i % step === 0).slice(0, 100);
  const allContents = new Map(contents);
  for (const file of extraSample) {
    if (!allContents.has(file)) {
      const safe = safePath(dir, file);
      if (!safe) continue;
      try {
        const content = stripComments(fs.readFileSync(safe, "utf-8"));
        allContents.set(file, content);
      } catch { /* skip */ }
    }
  }

  // ========================================
  // 1. I18N / LOCALIZATION PATTERNS
  // ========================================
  const i18nPatterns: { pattern: string; hook: string; count: number; files: string[] }[] = [
    { pattern: "useLocale", hook: "useLocale()", count: 0, files: [] },
    { pattern: "useTranslation", hook: "useTranslation()", count: 0, files: [] },
    { pattern: "useTranslations", hook: "useTranslations()", count: 0, files: [] },
    { pattern: "useIntl", hook: "useIntl()", count: 0, files: [] },
    { pattern: "intl\\.formatMessage", hook: "intl.formatMessage()", count: 0, files: [] },
    { pattern: "\\bt\\(['\"]", hook: "t(\"key\")", count: 0, files: [] },
    { pattern: "i18next", hook: "i18next", count: 0, files: [] },
    { pattern: "gettext", hook: "gettext()", count: 0, files: [] },
    { pattern: "(?<!\\w)_\\(['\"]", hook: "_(\"string\")", count: 0, files: [] },
  ];

  for (const [file, content] of allContents) {
    for (const p of i18nPatterns) {
      if (new RegExp(p.pattern).test(content)) {
        p.count++;
        if (p.files.length < 3) p.files.push(file);
      }
    }
  }

  // Filter: if only t() matched, require corroborating evidence (i18n files or packages)
  const hasI18nFiles = files.some(
    (f) => f.includes("locale") || f.includes("i18n") || f.includes("translations") || f.includes("messages/")
  );
  let hasI18nPackage = false;
  for (const [f, c] of allContents) {
    if (f.endsWith("package.json") && (c.includes("i18next") || c.includes("react-intl") || c.includes("next-intl") || c.includes("@lingui"))) {
      hasI18nPackage = true;
      break;
    }
  }
  const dominantI18n = i18nPatterns
    .filter((p) => {
      if (p.count < 3) return false;
      // t() alone is too generic — require corroborating evidence
      if (p.hook === 't("key")' && !hasI18nFiles && !hasI18nPackage) return false;
      return true;
    })
    .sort((a, b) => b.count - a.count);
  if (dominantI18n.length > 0) {
    const primary = dominantI18n[0];
    let desc = `User-facing strings use ${primary.hook} for internationalization.`;

    // Find where translation keys live
    const localeFiles = files.filter(
      (f) =>
        (f.includes("locale") || f.includes("i18n") || f.includes("translations") || f.includes("messages")) &&
        (f.endsWith(".json") || f.endsWith(".ts") || f.endsWith(".js")) &&
        !f.includes("node_modules")
    );
    const commonLocale = localeFiles.find((f) => f.includes("en/") || f.includes("en."));

    if (commonLocale) {
      desc += ` Add new translation keys in ${commonLocale}.`;
    } else if (localeFiles.length > 0) {
      desc += ` Translation files are in: ${localeFiles[0]}.`;
    }

    findings.push({
      category: "Dominant patterns",
      description: desc,
      evidence: `${primary.count} files use ${primary.hook}`,
      confidence: "high",
      discoverable: false,
      evidenceFiles: primary.files.slice(0, 20),
    });
  }

  // ========================================
  // 2. ROUTING / API PATTERNS
  // ========================================
  // lang field restricts which file types count toward this pattern
  const routerPatterns: { pattern: string; name: string; count: number; files: string[]; lang?: "js" | "py" | "go" }[] = [
    { pattern: "trpc\\.router|createTRPCRouter|from ['\"]@trpc", name: "tRPC routers", count: 0, files: [], lang: "js" },
    { pattern: "express\\.Router|router\\.get|router\\.post", name: "Express routers", count: 0, files: [], lang: "js" },
    { pattern: "from ['\"]express['\"]|require\\(['\"]express['\"]\\)", name: "Express app routes", count: 0, files: [], lang: "js" },
    { pattern: "from ['\"]fastify['\"]|require\\(['\"]fastify['\"]\\)|fastify\\.get\\(|fastify\\.post\\(|fastify\\.route\\(", name: "Fastify routes", count: 0, files: [], lang: "js" },
    { pattern: "new Hono|from ['\"]hono['\"]", name: "Hono routes", count: 0, files: [], lang: "js" },
    { pattern: "FastAPI|@app\\.(get|post|put|delete)", name: "FastAPI endpoints", count: 0, files: [], lang: "py" },
    { pattern: "flask\\.route|@app\\.route", name: "Flask routes", count: 0, files: [], lang: "py" },
    { pattern: "gin\\.Engine|r\\.GET|r\\.POST", name: "Gin routes", count: 0, files: [], lang: "go" },
    { pattern: "fiber\\.App|app\\.Get|app\\.Post", name: "Fiber routes", count: 0, files: [], lang: "go" },
  ];

  for (const [file, content] of allContents) {
    const isJs = file.endsWith(".ts") || file.endsWith(".tsx") || file.endsWith(".js") || file.endsWith(".jsx");
    const isPy = file.endsWith(".py");
    const isGo = file.endsWith(".go");
    for (const p of routerPatterns) {
      if (p.lang === "js" && !isJs) continue;
      if (p.lang === "py" && !isPy) continue;
      if (p.lang === "go" && !isGo) continue;
      if (new RegExp(p.pattern).test(content)) {
        p.count++;
        p.files.push(file);
      }
    }
  }

  // Libraries mention other frameworks in docs/docstrings — require more evidence
  const routerThreshold = repoMode === "library" ? 5 : 2;
  const dominantRouter = routerPatterns.filter((p) => p.count >= routerThreshold).sort((a, b) => b.count - a.count);
  if (dominantRouter.length > 0) {
    const primary = dominantRouter[0];
    findings.push({
      category: "Dominant patterns",
      description: `API endpoints use ${primary.name}. Follow this pattern for new routes.`,
      evidence: `${primary.count} files use ${primary.name}`,
      confidence: "high",
      discoverable: false,
      evidenceFiles: primary.files.slice(0, 20),
    });
  }

  // ========================================
  // 3. VALIDATION / SCHEMA PATTERNS
  // ========================================
  const schemaPatterns: { pattern: string; name: string; usage: string; count: number; files: string[] }[] = [
    { pattern: "z\\.object|z\\.string|z\\.number", name: "Zod", usage: "Use Zod schemas for validation", count: 0, files: [] },
    { pattern: "class\\s+\\w+\\(BaseModel\\)|from pydantic", name: "Pydantic", usage: "Use Pydantic BaseModel for data classes", count: 0, files: [] },
    { pattern: "Joi\\.object|Joi\\.string", name: "Joi", usage: "Use Joi schemas for validation", count: 0, files: [] },
    { pattern: "yup\\.object|yup\\.string", name: "Yup", usage: "Use Yup schemas for validation", count: 0, files: [] },
    { pattern: "class.*Serializer.*:|serializers\\.Serializer", name: "Django serializers", usage: "Use Django REST serializers for API data", count: 0, files: [] },
    { pattern: "@dataclass", name: "dataclasses", usage: "Use @dataclass for data structures", count: 0, files: [] },
  ];

  for (const [file, content] of allContents) {
    for (const p of schemaPatterns) {
      if (new RegExp(p.pattern).test(content)) {
        p.count++;
        p.files.push(file);
      }
    }
  }

  const dominantSchema = schemaPatterns.filter((p) => p.count >= 3).sort((a, b) => b.count - a.count);
  if (dominantSchema.length > 0) {
    const primary = dominantSchema[0];
    findings.push({
      category: "Dominant patterns",
      description: `${primary.usage}. This is the project's standard validation approach.`,
      evidence: `${primary.count} files use ${primary.name}`,
      confidence: "high",
      discoverable: false,
      evidenceFiles: primary.files.slice(0, 20),
    });
  }

  // ========================================
  // 4. STATE MANAGEMENT / DATA FETCHING
  // ========================================
  const statePatterns: { pattern: string; name: string; desc: string; count: number; files: string[] }[] = [
    { pattern: "useQuery|useMutation|QueryClient", name: "React Query/TanStack Query", desc: "Data fetching uses React Query (useQuery/useMutation)", count: 0, files: [] },
    { pattern: "useSWR|mutate\\(", name: "SWR", desc: "Data fetching uses SWR (useSWR)", count: 0, files: [] },
    { pattern: "createSlice|configureStore", name: "Redux Toolkit", desc: "State management uses Redux Toolkit (createSlice)", count: 0, files: [] },
    { pattern: "create\\(.*set.*get|useStore", name: "Zustand", desc: "State management uses Zustand", count: 0, files: [] },
    { pattern: "atom\\(|useAtom", name: "Jotai", desc: "State management uses Jotai atoms", count: 0, files: [] },
  ];

  for (const [file, content] of allContents) {
    for (const p of statePatterns) {
      if (new RegExp(p.pattern).test(content)) {
        p.count++;
        p.files.push(file);
      }
    }
  }

  const dominantState = statePatterns.filter((p) => p.count >= 3).sort((a, b) => b.count - a.count);
  if (dominantState.length > 0) {
    const primary = dominantState[0];
    findings.push({
      category: "Dominant patterns",
      description: `${primary.desc}. Follow this pattern for new data operations.`,
      evidence: `${primary.count} files`,
      confidence: "high",
      discoverable: false,
      evidenceFiles: primary.files.slice(0, 20),
    });
  }

  // ========================================
  // 5. TESTING PATTERNS
  // ========================================
  const testPatterns: { pattern: string; name: string; count: number }[] = [
    { pattern: "describe\\(|it\\(|test\\(", name: "_generic_test", count: 0 },
    { pattern: "def test_|class Test|pytest", name: "pytest", count: 0 },
    { pattern: "func Test.*\\(t \\*testing\\.T\\)", name: "Go testing", count: 0 },
    { pattern: "expect\\(.*\\)\\.to", name: "Chai/expect", count: 0 },
  ];

  const testFiles = [...allContents.entries()].filter(
    ([f]) => f.includes(".test.") || f.includes(".spec.") || f.includes("_test.") || f.startsWith("test_")
  );

  // Read a few test files specifically
  const testSampled = files
    .filter((f) => f.includes(".test.") || f.includes(".spec.") || f.includes("_test.go") || f.includes("test_"))
    .slice(0, 10);

  for (const file of testSampled) {
    if (!allContents.has(file)) {
      const safe = safePath(dir, file);
      if (!safe) continue;
      try {
        const content = stripComments(fs.readFileSync(safe, "utf-8"));
        allContents.set(file, content);
      } catch { /* skip */ }
    }
  }

  for (const [f, content] of allContents) {
    if (f.includes("test") || f.includes("spec")) {
      for (const p of testPatterns) {
        if (new RegExp(p.pattern).test(content)) {
          p.count++;
        }
      }
    }
  }

  const dominantTest = testPatterns.filter((p) => p.count >= 2).sort((a, b) => b.count - a.count);
  if (dominantTest.length > 0) {
    let primary = dominantTest[0];

    // Disambiguate generic test pattern by checking package.json devDependencies
    if (primary.name === "_generic_test") {
      let pkgContent = allContents.get("package.json") || "";
      if (!pkgContent) {
        const pkgPath = safePath(dir, "package.json");
        if (pkgPath) {
          try { pkgContent = fs.readFileSync(pkgPath, "utf-8"); } catch { /* skip */ }
        }
      }
      // Check test file content for node:test imports (covers borp and direct node:test use)
      const usesNodeTest = [...allContents.entries()].some(
        ([f, c]) => (f.includes("test") || f.includes("spec")) &&
          /require\(['"]node:test['"]\)|from\s+['"]node:test['"]/.test(c)
      );
      if (pkgContent.includes('"vitest"')) {
        primary = { ...primary, name: "Vitest" };
      } else if (pkgContent.includes('"jest"') || pkgContent.includes('"@jest/')) {
        primary = { ...primary, name: "Jest" };
      } else if (pkgContent.includes('"mocha"')) {
        primary = { ...primary, name: "Mocha" };
      } else if (pkgContent.includes('"jasmine"')) {
        primary = { ...primary, name: "Jasmine" };
      } else if (pkgContent.includes('"ava"')) {
        primary = { ...primary, name: "AVA" };
      } else if (pkgContent.includes('"tap"') || pkgContent.includes('"@tapjs/')) {
        primary = { ...primary, name: "node-tap" };
      } else if (pkgContent.includes('"borp"') || usesNodeTest) {
        primary = { ...primary, name: "Node.js built-in test runner" };
      } else {
        // Check for Deno (deno.json/deno.jsonc) or Bun (bun.lockb)
        const hasDeno = files.some(f => f === "deno.json" || f === "deno.jsonc" || f === "deno.lock");
        const hasBun = files.some(f => f === "bun.lockb" || f === "bunfig.toml");
        if (hasDeno) {
          primary = { ...primary, name: "Deno test" };
        } else if (hasBun) {
          primary = { ...primary, name: "Bun test" };
        } else if (pkgContent.includes('"tap"') || pkgContent.includes('"@tap/') || pkgContent.includes('"borp"')) {
          primary = { ...primary, name: "node:test" };
        } else if (pkgContent.includes('"ava"')) {
          primary = { ...primary, name: "Ava" };
        } else {
          // No strong signal — skip rather than guess wrong
          primary = { ...primary, name: "" };
        }
      }
      // If we couldn't determine the runner, skip this finding
      if (!primary.name) return findings;
    }

    // Also detect common test utilities/helpers
    const testHelperFiles = files.filter(
      (f) =>
        (f.includes("test-utils") || f.includes("testUtils") || f.includes("fixtures") || f.includes("helpers")) &&
        (f.includes("test") || f.includes("spec"))
    );

    let desc = `Tests use ${primary.name}.`;
    if (testHelperFiles.length > 0) {
      desc += ` Test utilities in: ${testHelperFiles[0]}.`;
    }

    findings.push({
      category: "Dominant patterns",
      description: desc,
      evidence: `${primary.count} test files`,
      confidence: "high",
      discoverable: false,
    });
  }

  // ========================================
  // 6. AUTH PATTERNS
  // ========================================
  const authPatterns: { pattern: string; name: string; count: number; files: string[] }[] = [
    { pattern: "useAuth|useSession|useUser", name: "auth hooks (useAuth/useSession/useUser)", count: 0, files: [] },
    { pattern: "withAuth|authMiddleware|requireAuth", name: "auth middleware", count: 0, files: [] },
    { pattern: "passport\\.authenticate", name: "Passport.js", count: 0, files: [] },
    { pattern: "jwt\\.verify|jwt\\.sign|jsonwebtoken", name: "JWT (jsonwebtoken)", count: 0, files: [] },
    { pattern: "@login_required|LoginRequiredMixin", name: "Django login_required", count: 0, files: [] },
    { pattern: "IsAuthenticated|AllowAny|BasePermission", name: "DRF permissions", count: 0, files: [] },
    { pattern: "next-auth|NextAuth\\(|authOptions.*NextAuth", name: "NextAuth.js", count: 0, files: [] },
    { pattern: "better-auth|betterAuth\\(|from ['\"]better-auth", name: "better-auth", count: 0, files: [] },
    { pattern: "supabase\\.auth|useSupabaseClient", name: "Supabase Auth", count: 0, files: [] },
    { pattern: "clerk|useClerk|ClerkProvider", name: "Clerk", count: 0, files: [] },
    { pattern: "OAuth2PasswordBearer|HTTPBearer|APIKeyHeader|from fastapi\\.security", name: "FastAPI security", count: 0, files: [] },
  ];

  for (const [file, content] of allContents) {
    for (const p of authPatterns) {
      if (new RegExp(p.pattern).test(content)) {
        p.count++;
        p.files.push(file);
      }
    }
  }

  const dominantAuth = authPatterns.filter((p) => p.count >= 2).sort((a, b) => b.count - a.count);
  if (dominantAuth.length > 0) {
    const primary = dominantAuth[0];

    // Ensure auth-named files are read even if they weren't in the stratified sample.
    // Entrypoints like _auth-middleware.ts can live deep in the tree and get missed.
    const unreadAuthFiles = files.filter(
      (f) =>
        (f.includes("auth") || f.includes("middleware") || f.includes("guard")) &&
        !f.includes("node_modules") && !f.includes(".test.") &&
        (f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".js") || f.endsWith(".py")) &&
        !allContents.has(f)
    );
    for (const f of unreadAuthFiles.slice(0, 30)) {
      const safe = safePath(dir, f);
      if (!safe) continue;
      try { allContents.set(f, stripComments(fs.readFileSync(safe, "utf-8"))); } catch { /**/ }
    }

    // Find auth middleware/guard files that actually match the winning pattern
    const authPatternRe = new RegExp(primary.pattern);
    const authFiles = files.filter(
      (f) =>
        (f.includes("auth") || f.includes("middleware") || f.includes("guard") || f.includes("session")) &&
        !f.includes("node_modules") && !f.includes(".test.") &&
        (f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".js") || f.endsWith(".py")) &&
        authPatternRe.test(allContents.get(f) ?? "")
    );
    const authEntrypoint = authFiles.find(
      (f) => f.includes("middleware") || f.includes("guard") || f.includes("auth/index")
    );

    let desc = `Auth uses ${primary.name}.`;
    if (authEntrypoint) {
      desc += ` Auth logic lives in ${authEntrypoint}.`;
    }

    findings.push({
      category: "Dominant patterns",
      description: desc,
      evidence: `${primary.count} files`,
      confidence: "high",
      discoverable: false,
      evidenceFiles: primary.files.slice(0, 20),
    });
  }

  // ========================================
  // 7. STYLING CONVENTIONS
  // ========================================
  const stylePatterns: { pattern: string; name: string; desc: string; count: number; files: string[] }[] = [
    { pattern: "class=.*tw-|className=[\"'](?:flex |grid |p-|m-|text-|bg-|border-|rounded-|shadow-|w-|h-)", name: "Tailwind CSS", desc: "Styling uses Tailwind CSS utility classes", count: 0, files: [] },
    { pattern: "from ['\"]styled-components|from ['\"]@emotion|styled\\.|styled\\(", name: "styled-components/Emotion", desc: "Styling uses CSS-in-JS (styled-components or Emotion)", count: 0, files: [] },
    { pattern: "from.*\\.module\\.(css|scss)", name: "CSS Modules", desc: "Styling uses CSS Modules (*.module.css)", count: 0, files: [] },
  ];

  for (const [file, content] of allContents) {
    for (const p of stylePatterns) {
      if (new RegExp(p.pattern).test(content)) {
        p.count++;
        p.files.push(file);
      }
    }
  }

  const dominantStyle = stylePatterns.filter((p) => p.count >= 3).sort((a, b) => b.count - a.count);
  if (dominantStyle.length > 0) {
    const primary = dominantStyle[0];
    let desc = `${primary.desc}.`;

    // For Tailwind, check for custom tokens
    if (primary.name === "Tailwind CSS") {
      const twConfig = files.find((f) => f.includes("tailwind.config"));
      if (twConfig) {
        const safeTw = safePath(dir, twConfig);
        if (safeTw) try {
          const configContent = fs.readFileSync(safeTw, "utf-8");
          if (configContent.includes("colors") || configContent.includes("extend")) {
            desc += ` Custom design tokens defined in ${twConfig} — use these instead of arbitrary values.`;
          }
        } catch { /* skip */ }
      }
    }

    findings.push({
      category: "Dominant patterns",
      description: desc,
      evidence: `${primary.count} files`,
      confidence: "high",
      discoverable: false,
      evidenceFiles: primary.files.slice(0, 20),
    });
  }

  // ========================================
  // 8. DATABASE / ORM PATTERNS
  // ========================================
  const dbPatterns: { pattern: string; name: string; entryHint: string; count: number; files: string[] }[] = [
    { pattern: "prisma\\.|PrismaClient|\\$queryRaw", name: "Prisma", entryHint: "prisma/schema.prisma", count: 0, files: [] },
    { pattern: "drizzle\\(|pgTable|sqliteTable", name: "Drizzle ORM", entryHint: "drizzle.config.ts", count: 0, files: [] },
    { pattern: "knex\\(|knex\\.schema", name: "Knex.js", entryHint: "knexfile", count: 0, files: [] },
    { pattern: "sequelize\\.define|Model\\.init", name: "Sequelize", entryHint: "models/", count: 0, files: [] },
    { pattern: "TypeORM|@Entity|getRepository", name: "TypeORM", entryHint: "entities/", count: 0, files: [] },
    { pattern: "mongoose\\.model|mongoose\\.Schema|require\\(['\"]mongoose['\"]|from ['\"]mongoose['\"]", name: "Mongoose", entryHint: "models/", count: 0, files: [] },
    { pattern: "from django\\.db|models\\.Model", name: "Django ORM", entryHint: "models.py", count: 0, files: [] },
    { pattern: "from sqlalchemy|import sqlalchemy|SQLAlchemy\\(|declarative_base|sessionmaker", name: "SQLAlchemy", entryHint: "models/", count: 0, files: [] },
    { pattern: "from tortoise|tortoise\\.models", name: "Tortoise ORM", entryHint: "models/", count: 0, files: [] },
  ];

  for (const [file, content] of allContents) {
    for (const p of dbPatterns) {
      if (new RegExp(p.pattern).test(content)) {
        p.count++;
        p.files.push(file);
      }
    }
  }

  const dominantDB = dbPatterns.filter((p) => p.count >= 2).sort((a, b) => b.count - a.count);
  if (dominantDB.length > 0) {
    const primary = dominantDB[0];
    // Try to find the actual entrypoint file
    const dbEntryFile = files.find(
      (f) => f.includes(primary.entryHint) && !f.includes("node_modules")
    );
    let desc = `Database access uses ${primary.name}.`;
    if (dbEntryFile) {
      desc += ` Schema/models defined in ${dbEntryFile}.`;
    } else {
      desc += ` Look for schemas in ${primary.entryHint}.`;
    }

    findings.push({
      category: "Dominant patterns",
      description: desc,
      evidence: `${primary.count} files`,
      confidence: "high",
      discoverable: false,
      evidenceFiles: primary.files.slice(0, 20),
    });
  }

  // ========================================
  // 9. GENERATED / DO-NOT-EDIT FILES
  // ========================================
  const generatedFiles: string[] = [];
  for (const [file, content] of allContents) {
    const firstLines = content.slice(0, 500);
    if (
      /@generated/.test(firstLines) ||
      /DO NOT EDIT/i.test(firstLines) ||
      /auto-generated/i.test(firstLines) ||
      /this file is generated/i.test(firstLines) ||
      /generated by/i.test(firstLines)
    ) {
      generatedFiles.push(file);
    }
  }

  // Also check for common generated file patterns in the full file list
  const knownGenerated = files.filter(
    (f) =>
      !f.includes("node_modules") &&
      (f.includes(".generated.") ||
       f.includes(".gen.") ||
       f.endsWith(".d.ts") && f.includes("generated") ||
       f.includes("__generated__") ||
       f.includes("codegen"))
  );

  const allGenerated = [...new Set([...generatedFiles, ...knownGenerated])];
  if (allGenerated.length >= 2) {
    const samples = allGenerated.slice(0, 5).join(", ");
    findings.push({
      category: "Critical constraints",
      description: `Generated files detected (${samples}${allGenerated.length > 5 ? ", ..." : ""}). Do NOT edit these directly — modify the source/schema they are generated from.`,
      evidence: `${allGenerated.length} generated files`,
      confidence: "high",
      discoverable: false,
      evidenceFiles: allGenerated.slice(0, 20),
    });
  }

  // ========================================
  // 10. EDIT ENTRYPOINTS (where changes usually land)
  // ========================================
  // For routing — find where route definitions live
  if (dominantRouter.length > 0) {
    const routeDirs = files
      .filter(
        (f) =>
          (f.includes("routes") || f.includes("routers") || f.includes("api/") || f.includes("app/api/")) &&
          !f.includes("node_modules") && !f.includes(".test.") && !f.includes(".spec.") &&
          !f.includes("test/") && !f.includes("tests/") && !f.includes("__test") &&
          !f.includes("fixture") && !f.includes("mock") &&
          (f.endsWith(".ts") || f.endsWith(".js") || f.endsWith(".py") || f.endsWith(".go"))
      )
      .map((f) => {
        const parts = f.split("/");
        return parts.slice(0, -1).join("/");
      })
      .filter((v) => v && v !== "." && v.length > 0) // filter empty/root paths
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 3);

    if (routeDirs.length > 0) {
      findings.push({
        category: "Dominant patterns",
        description: `Route definitions live in: ${routeDirs.join(", ")}. Add new endpoints here.`,
        evidence: `${routeDirs.length} route directories`,
        confidence: "high",
        discoverable: false,
      });
    }
  }

  // For components — find where UI components live
  const componentDirs = files
    .filter(
      (f) =>
        (f.includes("/components/") || f.includes("/ui/")) &&
        !f.includes("node_modules") && !f.includes(".test.") &&
        (f.endsWith(".tsx") || f.endsWith(".jsx") || f.endsWith(".vue") || f.endsWith(".svelte"))
    )
    .map((f) => {
      const match = f.match(/(.*\/(?:components|ui))\//);
      return match ? match[1] : null;
    })
    .filter((v): v is string => v !== null)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 3);

  if (componentDirs.length > 0 && componentDirs.some((d) => !d.includes("node_modules"))) {
    const filtered = componentDirs.filter((d) => !d.includes("node_modules"));
    if (filtered.length > 0) {
      findings.push({
        category: "Dominant patterns",
        description: `UI components live in: ${filtered.join(", ")}. Add new components here.`,
        evidence: `${filtered.length} component directories`,
        confidence: "medium",
        discoverable: false,
      });
    }
  }

  // ========================================
  // 11. KEY DIRECTORY PURPOSES (app-specific)
  // ========================================
  // Detect directories with clear domain purposes
  const dirPurposes: { dir: string; purpose: string }[] = [];

  // App store / plugin / integration directories
  // Only match top-level integration directories (not deeply nested editor plugins etc.)
  const integrationDirCandidates = ["app-store", "plugins", "integrations", "addons", "extensions"];
  let bestIntegrationDir = "";
  let bestIntegrationCount = 0;

  for (const dirName of integrationDirCandidates) {
    // Find files matching pattern: <prefix>/<dirName>/<integration-name>/<file>
    const matchingFiles = files.filter(
      (f) => new RegExp(`/${dirName}/[^/]+/[^/]+`).test(f) && !f.includes("node_modules")
    );
    const integrationNames = matchingFiles
      .map((f) => {
        const match = f.match(new RegExp(`(.*?/${dirName})/([^/]+)/`));
        return match ? { dir: match[1], name: match[2] } : null;
      })
      .filter((v): v is { dir: string; name: string } => v !== null && !v.name.startsWith("_"));

    const uniqueNames = [...new Set(integrationNames.map((i) => i.name))];
    if (uniqueNames.length > bestIntegrationCount) {
      bestIntegrationCount = uniqueNames.length;
      bestIntegrationDir = integrationNames[0]?.dir || "";
    }
  }

  if (bestIntegrationCount >= 3 && bestIntegrationDir) {
    const integrations = files
      .filter((f) => f.startsWith(bestIntegrationDir + "/") && !f.includes("node_modules"))
      .map((f) => {
        const suffix = f.slice(bestIntegrationDir.length + 1);
        return suffix.split("/")[0];
      })
      .filter((v) => v && !v.startsWith("_") && v !== "templates" && !v.includes("."))
      .filter((v, i, a) => a.indexOf(v) === i);

    if (integrations.length > 0) {
      const sampleIntegrations = integrations.slice(0, 6).join(", ");
      findings.push({
        category: "Dominant patterns",
        description: `Third-party integrations live under ${bestIntegrationDir}/ (${sampleIntegrations}${integrations.length > 6 ? ", ..." : ""}). Each integration has its own directory with components, lib, and API code.`,
        evidence: `${integrations.length} integrations found`,
        confidence: "high",
        discoverable: false,
      });
    }
  }

  return findings;
}

function detectExportPatterns(contents: Map<string, string>, repoMode: "app" | "library" | "monorepo" = "app"): Finding[] {
  // Libraries define their own public API — don't second-guess the export style
  if (repoMode === "library") return [];

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
