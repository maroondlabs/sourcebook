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

export interface ImportEdge {
  from: string;
  to: string;
}

interface GraphAnalysis {
  /** Files ranked by importance (PageRank) */
  rankedFiles: { file: string; score: number }[];
  /** Findings about architecture from the graph */
  findings: Finding[];
  /** All resolved import edges in the project */
  edges: ImportEdge[];
}

/**
 * Build an import/dependency graph and run PageRank to identify
 * the most structurally important files. Conventions found in
 * high-PageRank files are likely canonical.
 */
export async function analyzeImportGraph(
  dir: string,
  files: string[]
): Promise<GraphAnalysis> {
  const findings: Finding[] = [];

  // Separate JS/TS and Python source files — exclude docs/examples/benchmarks
  const jsSourceFiles = files.filter((f) =>
    /\.(ts|tsx|js|jsx)$/.test(f) &&
    !f.endsWith(".d.ts") &&
    !/(?:^|\/)docs?(?:[_-][^/]+)?\//i.test(f) &&
    !/(?:^|\/)examples?(?:[_-][^/]+)?\//i.test(f) &&
    !/(?:^|\/)benchmarks?\//i.test(f)
  );
  const pySourceFiles = files.filter(
    (f) =>
      f.endsWith(".py") &&
      !/(?:^|\/)docs?(?:[_-][^/]+)?\//i.test(f) &&
      !/(?:^|\/)examples?(?:[_-][^/]+)?\//i.test(f) &&
      !/(?:^|\/)benchmarks?\//i.test(f)
  );
  const allSourceFiles = [...jsSourceFiles, ...pySourceFiles];

  if (allSourceFiles.length < 5) {
    return { rankedFiles: [], findings, edges: [] };
  }

  // Extract imports from each file
  const edges: ImportEdge[] = [];
  const jsFileSet = new Set(jsSourceFiles);
  const pyFileSet = new Set(pySourceFiles);

  // JS/TS import edges
  for (const file of jsSourceFiles) {
    const filePath = safePath(dir, file);
    if (!filePath) continue;
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const imports = extractImports(content);

    for (const imp of imports) {
      const resolved = resolveImport(imp, file, jsFileSet, dir);
      if (resolved) {
        edges.push({ from: file, to: resolved });
      }
    }
  }

  // Python import edges
  for (const file of pySourceFiles) {
    const filePath = safePath(dir, file);
    if (!filePath) continue;
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const imports = extractPythonImports(content);

    for (const imp of imports) {
      const resolved = resolvePythonImport(imp, file, pyFileSet);
      if (resolved) {
        edges.push({ from: file, to: resolved });
      }
    }
  }

  if (edges.length < 5) {
    return { rankedFiles: [], findings, edges };
  }

  // Run PageRank — exclude test files so test helpers don't dominate
  const prodSourceFiles = allSourceFiles.filter((f) => !isNonProductionFile(f));
  const prodEdgesForRank = edges.filter((e) => !isNonProductionFile(e.from) && !isNonProductionFile(e.to));
  const scores = pageRank(prodSourceFiles, prodEdgesForRank, 20, 0.85);

  // Sort by score descending, excluding test/spec files from the output
  const rankedFiles = [...scores.entries()]
    .filter(([file]) => !isTestFile(file))
    .sort((a, b) => b[1] - a[1])
    .map(([file, score]) => ({ file, score }));

  // Find hub files (high fan-in -- many production files import them)
  // Exclude test/spec files from the fan-in count so test helpers don't appear as hubs
  // Use lower threshold for Python files — libraries have fewer total files
  const fanIn = new Map<string, number>();
  for (const edge of edges) {
    if (!isTestFile(edge.from)) {
      fanIn.set(edge.to, (fanIn.get(edge.to) || 0) + 1);
    }
  }

  const hubs = [...fanIn.entries()]
    .filter(([file, count]) => count >= (file.endsWith(".py") ? 3 : 5))
    .sort((a, b) => b[1] - a[1]);

  if (hubs.length > 0) {
    const hubList = hubs
      .slice(0, 5)
      .map(([file, count]) => `${file} (imported by ${count} files)`);

    findings.push({
      category: "Core modules",
      description: `Hub files (most depended on): ${hubList.join("; ")}. Changes here have the widest blast radius.`,
      rationale:
        "These are the most imported files in the project. Modifying them affects many consumers. Test thoroughly after changes.",
      confidence: "high",
      discoverable: false,
    });
  }

  // Detect potential circular dependencies (test files excluded to reduce noise)
  const prodEdges = edges.filter((e) => !isNonProductionFile(e.from) && !isNonProductionFile(e.to));
  const cycles = detectCycles(prodEdges, allSourceFiles.filter((f) => !isNonProductionFile(f)));
  if (cycles.length > 0) {
    const cycleDescriptions = cycles
      .slice(0, 3)
      .map((c) =>
        c
          .map((f) => {
            const base = path.basename(f);
            // __init__.py is ambiguous — include parent dir for context
            if (base === "__init__.py") {
              return `${path.basename(path.dirname(f))}/${base}`;
            }
            return base;
          })
          .join(" → ")
      );

    findings.push({
      category: "Circular dependencies",
      description: `Circular import chains detected: ${cycleDescriptions.join("; ")}. Avoid adding to these cycles.`,
      rationale:
        "Circular dependencies cause subtle bugs (undefined imports, initialization order issues). Agents may unknowingly create new cycles.",
      confidence: "high",
      discoverable: false,
    });
  }

  // Detect orphan files (no imports, not imported)
  const connectedFiles = new Set<string>();
  for (const edge of edges) {
    connectedFiles.add(edge.from);
    connectedFiles.add(edge.to);
  }
  const orphans = allSourceFiles.filter(
    (f) =>
      !connectedFiles.has(f) &&
      !isNonProductionFile(f) &&
      !isEntryPointFile(f) &&
      !f.includes(".config") &&
      !f.endsWith(".d.ts")
  );

  // Only surface dead code when the count is small enough to be actionable.
  // Large monorepos have many files connected only through package imports (not
  // relative paths), so a high orphan count means the graph is incomplete —
  // not that the files are actually dead.
  if (orphans.length >= 3 && orphans.length <= 100) {
    findings.push({
      category: "Dead code candidates",
      description: `${orphans.length} source files have no import connections (potential dead code): ${orphans.slice(0, 5).join(", ")}${orphans.length > 5 ? ", ..." : ""}`,
      confidence: "low",
      discoverable: false,
    });
  }

  return { rankedFiles, findings, edges };
}

const TEST_FILE_RE = /(?:^|\/)(?:tests?|__tests__|e2e|playwright|cypress)\//i;
const TEST_EXT_RE = /\.(test|spec|test-d)\.[^.]+$/;
// Root-level test entry files common in small libraries (e.g. ora's test.js)
const TEST_NAME_RE = /(?:^|\/)tests?\.[^.]+$/;
// Python test file conventions: test_foo.py or foo_test.py
const PY_TEST_PREFIX_RE = /(?:^|\/)test_[^/]+\.py$/;
const PY_TEST_SUFFIX_RE = /[^/]+_test\.py$/;

function isTestFile(file: string): boolean {
  return (
    TEST_FILE_RE.test(file) ||
    TEST_EXT_RE.test(file) ||
    TEST_NAME_RE.test(file) ||
    PY_TEST_PREFIX_RE.test(file) ||
    PY_TEST_SUFFIX_RE.test(file)
  );
}

const ENTRY_POINT_RE =
  /(?:^|\/)(?:pages|app|apps|scripts|migrations|e2e|playwright|cypress)\//i;
const ENTRY_EXT_RE = /\.(?:config|setup|workspace)\.[^.]+$/;

function isEntryPointFile(file: string): boolean {
  return ENTRY_POINT_RE.test(file) || ENTRY_EXT_RE.test(file);
}

const EXAMPLE_FILE_RE =
  /(?:^|\/)(?:examples?|demos?|samples?)\//i;
const EXAMPLE_NAME_RE =
  /(?:^|\/)example[^/]*\.[^.]+$/i;

function isExampleFile(file: string): boolean {
  return EXAMPLE_FILE_RE.test(file) || EXAMPLE_NAME_RE.test(file);
}

function isNonProductionFile(file: string): boolean {
  return isTestFile(file) || isExampleFile(file);
}

/**
 * Extract import paths from a source file using regex.
 * Not as robust as Tree-sitter but fast and sufficient for graph building.
 */
export function extractImports(content: string): string[] {
  // Strip block comments (including JSDoc) to avoid matching import() inside
  // annotations like /** @type {import('./types').Foo} */
  const stripped = content.replace(/\/\*[\s\S]*?\*\//g, "");

  const imports: string[] = [];

  // ES imports: import ... from "path"
  const esImports = stripped.matchAll(
    /(?:import|export)\s+.*?\s+from\s+['"]([^'"]+)['"]/g
  );
  for (const match of esImports) {
    imports.push(match[1]);
  }

  // Dynamic imports: import("path")
  const dynamicImports = stripped.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
  for (const match of dynamicImports) {
    imports.push(match[1]);
  }

  // require: require("path")
  const requires = stripped.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
  for (const match of requires) {
    imports.push(match[1]);
  }

  // Only return relative imports (not packages)
  return imports.filter((p) => p.startsWith(".") || p.startsWith("@/") || p.startsWith("~/"));
}

/**
 * Extract import specifiers from a Python source file.
 * Handles both relative (from .module import X) and absolute
 * (from pydantic.main import X, import os.path) forms.
 */
export function extractPythonImports(content: string): string[] {
  const imports: string[] = [];

  // "from .module import X" or "from package.submodule import Y"
  const fromImports = content.matchAll(/^from\s+(\.+[\w.]*|[\w][\w.]*)\s+import\b/gm);
  for (const match of fromImports) {
    imports.push(match[1]);
  }

  // "import module" or "import package.submodule"
  const plainImports = content.matchAll(/^import\s+([\w][\w.]*)/gm);
  for (const match of plainImports) {
    imports.push(match[1]);
  }

  return imports;
}

/**
 * Resolve a Python import specifier to a file in the project.
 * Handles relative imports (leading dots) and absolute imports
 * that resolve to project files.
 */
export function resolvePythonImport(
  importSpec: string,
  fromFile: string,
  pyFileSet: Set<string>
): string | null {
  const fromDir = path.dirname(fromFile);

  let baseDir: string;
  let modulePart: string;

  if (importSpec.startsWith(".")) {
    // Relative import: count leading dots
    const dotsMatch = importSpec.match(/^(\.+)/);
    const dots = dotsMatch![1].length;
    const remainder = importSpec.slice(dots);

    // 1 dot = current dir, 2 dots = parent dir, etc.
    let base = fromDir;
    for (let i = 1; i < dots; i++) {
      base = path.dirname(base);
    }
    // Normalize "." to empty string so path.join works correctly
    baseDir = base === "." ? "" : base;
    modulePart = remainder;
  } else {
    // Absolute import — resolve from project root
    baseDir = "";
    modulePart = importSpec;
  }

  if (!modulePart) {
    // "from . import X" — current package's __init__.py
    const candidate = baseDir ? `${baseDir}/__init__.py` : "__init__.py";
    return pyFileSet.has(candidate) ? candidate : null;
  }

  // Convert dotted module path to slash-separated file path
  const modPath = modulePart.replace(/\./g, "/");
  const base = baseDir ? `${baseDir}/${modPath}` : modPath;
  const normalized = base.replace(/^\.\//, "");

  const candidates = [
    `${normalized}.py`,
    `${normalized}/__init__.py`,
  ];

  for (const candidate of candidates) {
    if (pyFileSet.has(candidate)) return candidate;
  }

  return null;
}

/**
 * Resolve an import path to an actual file in the project.
 */
export function resolveImport(
  importPath: string,
  fromFile: string,
  fileSet: Set<string>,
  dir: string
): string | null {
  let resolved: string;

  if (importPath.startsWith("@/") || importPath.startsWith("~/")) {
    // Path alias -- resolve from root
    resolved = importPath.replace(/^[@~]\//, "src/");
  } else {
    // Relative import
    resolved = path.normalize(
      path.join(path.dirname(fromFile), importPath)
    );
  }

  // Strip .js extension — TypeScript projects use import "./foo.js" that resolves to foo.ts
  const withoutJsExt = resolved.replace(/\.js$/, "");

  // Try exact match, then with extensions, then as directory index
  const candidates = [
    resolved,
    withoutJsExt,
    `${withoutJsExt}.ts`,
    `${withoutJsExt}.tsx`,
    `${resolved}.ts`,
    `${resolved}.tsx`,
    `${resolved}.js`,
    `${resolved}.jsx`,
    `${withoutJsExt}/index.ts`,
    `${withoutJsExt}/index.tsx`,
    `${resolved}/index.ts`,
    `${resolved}/index.tsx`,
    `${resolved}/index.js`,
    `${resolved}/index.jsx`,
  ];

  for (const candidate of candidates) {
    // Normalize to remove leading ./
    const normalized = candidate.replace(/^\.\//, "");
    if (fileSet.has(normalized)) return normalized;
  }

  return null;
}

/**
 * Simple PageRank implementation.
 * No external dependencies needed.
 */
export function pageRank(
  nodes: string[],
  edges: ImportEdge[],
  iterations: number,
  damping: number
): Map<string, number> {
  const n = nodes.length;
  const scores = new Map<string, number>();
  const outDegree = new Map<string, number>();

  // Initialize
  for (const node of nodes) {
    scores.set(node, 1 / n);
    outDegree.set(node, 0);
  }

  // Count outgoing edges
  for (const edge of edges) {
    outDegree.set(edge.from, (outDegree.get(edge.from) || 0) + 1);
  }

  // Build adjacency (incoming edges)
  const incoming = new Map<string, string[]>();
  for (const node of nodes) {
    incoming.set(node, []);
  }
  for (const edge of edges) {
    if (incoming.has(edge.to)) {
      incoming.get(edge.to)!.push(edge.from);
    }
  }

  // Iterate
  for (let iter = 0; iter < iterations; iter++) {
    const newScores = new Map<string, number>();

    for (const node of nodes) {
      let sum = 0;
      for (const inNode of incoming.get(node) || []) {
        const out = outDegree.get(inNode) || 1;
        sum += (scores.get(inNode) || 0) / out;
      }
      newScores.set(node, (1 - damping) / n + damping * sum);
    }

    // Update
    for (const [node, score] of newScores) {
      scores.set(node, score);
    }
  }

  return scores;
}

/**
 * Detect circular dependencies using DFS.
 * Returns up to 5 short cycles.
 */
function detectCycles(
  edges: ImportEdge[],
  files: string[]
): string[][] {
  const adj = new Map<string, string[]>();
  for (const file of files) adj.set(file, []);
  for (const edge of edges) {
    if (adj.has(edge.from)) {
      adj.get(edge.from)!.push(edge.to);
    }
  }

  const rawCycles: string[][] = [];
  const visited = new Set<string>();
  const stack = new Set<string>();
  const currentPath: string[] = [];

  function dfs(node: string): void {
    if (rawCycles.length >= 20) return;
    if (stack.has(node)) {
      // Found a cycle
      const cycleStart = currentPath.indexOf(node);
      if (cycleStart !== -1) {
        const cycle = currentPath.slice(cycleStart);
        if (cycle.length <= 5) {
          // Only report short cycles
          rawCycles.push(cycle);
        }
      }
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    stack.add(node);
    currentPath.push(node);

    for (const neighbor of adj.get(node) || []) {
      dfs(neighbor);
    }

    stack.delete(node);
    currentPath.pop();
  }

  for (const file of files) {
    if (!visited.has(file)) dfs(file);
    if (rawCycles.length >= 20) break;
  }

  // Normalize each cycle to a canonical form (rotate to start with
  // the lexicographically smallest node) and deduplicate
  const seen = new Set<string>();
  const cycles: string[][] = [];
  for (const cycle of rawCycles) {
    const minIdx = cycle.indexOf(cycle.slice().sort()[0]);
    const normalized = [...cycle.slice(minIdx), ...cycle.slice(0, minIdx)];
    const key = normalized.join("\0");
    if (!seen.has(key)) {
      seen.add(key);
      cycles.push(normalized);
    }
    if (cycles.length >= 5) break;
  }

  return cycles;
}
