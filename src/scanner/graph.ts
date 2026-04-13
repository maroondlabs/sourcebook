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
  const goSourceFiles = files.filter(
    (f) =>
      f.endsWith(".go") &&
      !f.endsWith("_test.go") &&
      !/(?:^|\/)vendor\//i.test(f) &&
      !/(?:^|\/)testdata\//i.test(f)
  );
  const goTestFiles = files.filter((f) => f.endsWith("_test.go"));
  const rsSourceFiles = files.filter(
    (f) =>
      f.endsWith(".rs") &&
      !/(?:^|\/)target\//i.test(f) &&
      !/(?:^|\/)tests?\//i.test(f)
  );
  const allSourceFiles = [...jsSourceFiles, ...pySourceFiles, ...goSourceFiles, ...rsSourceFiles];

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

  // Go import edges
  if (goSourceFiles.length >= 5) {
    // Read go.mod to get module path
    const goModulePath = readGoModulePath(dir);
    if (goModulePath) {
      const goFileSet = new Set([...goSourceFiles, ...goTestFiles]);
      for (const file of [...goSourceFiles, ...goTestFiles]) {
        const filePath = safePath(dir, file);
        if (!filePath) continue;
        let content: string;
        try {
          content = fs.readFileSync(filePath, "utf-8");
        } catch {
          continue;
        }

        const imports = extractGoImports(content);
        for (const imp of imports) {
          const resolved = resolveGoImport(imp, goModulePath, goFileSet, dir);
          if (resolved) {
            edges.push({ from: file, to: resolved });
          }
        }
      }
    }
  }

  // Rust import edges
  if (rsSourceFiles.length >= 5) {
    const rsFileSet = new Set(rsSourceFiles);
    for (const file of rsSourceFiles) {
      const filePath = safePath(dir, file);
      if (!filePath) continue;
      let content: string;
      try {
        content = fs.readFileSync(filePath, "utf-8");
      } catch {
        continue;
      }

      const imports = extractRustImports(content);
      for (const imp of imports) {
        const resolved = resolveRustImport(imp, file, rsFileSet);
        if (resolved) {
          edges.push({ from: file, to: resolved });
        }
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
    // Scale hub count with repo size — small repos need fewer, large repos need more orientation
    const hubLimit = allSourceFiles.length > 500 ? 15 : allSourceFiles.length > 100 ? 10 : 5;
    const hubList = hubs
      .slice(0, hubLimit)
      .map(([file, count]) => `${file} (imported by ${count} files)`);

    findings.push({
      category: "Core modules",
      description: `Hub files (most depended on): ${hubList.join("; ")}. Changes here have the widest blast radius — modifying types, exports, or caching behavior in these files affects all dependents.`,
      rationale:
        "These are the most imported files in the project. Before modifying: check what depends on the specific export you're changing, understand shared state (caches, singletons, module-level variables), and verify type changes don't break downstream consumers.",
      confidence: "high",
      discoverable: false,
    });

    // Detect facade modules: __init__.py hubs that re-export from sibling files.
    // Files behind facades are invisible to fan-in but architecturally important.
    const topHubFiles = new Set(hubs.slice(0, hubLimit).map(([f]) => f));
    const facadeExports: { facade: string; impl: string }[] = [];
    for (const edge of edges) {
      if (
        edge.from.endsWith("/__init__.py") &&
        topHubFiles.has(edge.from) &&
        !isTestFile(edge.to) &&
        !topHubFiles.has(edge.to) &&
        // Only sibling files (same package)
        path.dirname(edge.from) === path.dirname(edge.to)
      ) {
        facadeExports.push({ facade: edge.from, impl: edge.to });
      }
    }
    if (facadeExports.length > 0) {
      // Group by facade
      const byFacade = new Map<string, string[]>();
      for (const { facade, impl } of facadeExports) {
        if (!byFacade.has(facade)) byFacade.set(facade, []);
        byFacade.get(facade)!.push(impl);
      }
      const parts: string[] = [];
      for (const [facade, impls] of byFacade) {
        parts.push(`${facade} re-exports from ${impls.join(", ")}`);
      }
      findings.push({
        category: "Hidden dependencies",
        description: `Facade modules hide implementation files: ${parts.join("; ")}. These implementation files have low direct fan-in but are architecturally important — bugs often live here, not in the facade.`,
        rationale:
          "Python __init__.py files often act as facades, re-exporting from private implementation modules. The implementation files have low fan-in (only imported by __init__.py) but are where the actual logic lives. When investigating bugs, check implementation files behind high-fan-in facades.",
        confidence: "high",
        discoverable: false,
      });
    }
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

    // Check if any cycle involves a hub file (high blast radius = higher risk)
    const hubFiles = new Set(
      hubs.slice(0, 5).map(([file]) => file)
    );
    const cycleInvolvesHub = cycles.some((c) =>
      c.some((f) => hubFiles.has(f))
    );
    const hubWarning = cycleInvolvesHub
      ? " These cycles involve hub files — changes here affect shared state and initialization order across many dependents."
      : "";

    findings.push({
      category: "Circular dependencies",
      description: `Circular import chains detected: ${cycleDescriptions.join("; ")}. Avoid adding to these cycles.${hubWarning}`,
      rationale:
        "Circular dependencies cause subtle bugs (undefined imports, initialization order issues, shared mutable state). Agents must understand how data flows between these files before modifying caching, types, or exports.",
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
  // Allow leading whitespace to catch conditional imports (if TYPE_CHECKING:, if PYDANTIC_V2:, etc.)
  const fromImports = content.matchAll(/^\s*from\s+(\.+[\w.]*|[\w][\w.]*)\s+import\b/gm);
  for (const match of fromImports) {
    imports.push(match[1]);
  }

  // "import module" or "import package.submodule"
  const plainImports = content.matchAll(/^\s*import\s+([\w][\w.]*)/gm);
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

  // Try direct resolution first, then with common source prefixes (lib/, src/)
  // Python projects like ansible keep source under lib/; others use src/
  const prefixes = ["", "lib/", "src/"];

  for (const prefix of prefixes) {
    const prefixed = prefix ? `${prefix}${normalized}` : normalized;
    const candidates = [
      `${prefixed}.py`,
      `${prefixed}/__init__.py`,
    ];

    for (const candidate of candidates) {
      if (pyFileSet.has(candidate)) return candidate;
    }
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

// ─── Go import support ───

/**
 * Read the module path from go.mod (first line: "module github.com/foo/bar")
 */
function readGoModulePath(dir: string): string | null {
  const goModPath = path.join(dir, "go.mod");
  try {
    const content = fs.readFileSync(goModPath, "utf-8");
    const match = content.match(/^module\s+(\S+)/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Extract Go import paths from a .go file.
 * Handles both single imports and grouped imports.
 */
export function extractGoImports(content: string): string[] {
  const imports: string[] = [];

  // Grouped imports: import ( "path1" \n "path2" )
  const groupMatches = content.matchAll(/import\s*\(\s*([\s\S]*?)\s*\)/g);
  for (const match of groupMatches) {
    const block = match[1];
    const lines = block.matchAll(/\s*(?:\w+\s+)?"([^"]+)"/g);
    for (const line of lines) {
      imports.push(line[1]);
    }
  }

  // Single imports: import "path" or import name "path"
  const singleMatches = content.matchAll(/import\s+(?:\w+\s+)?"([^"]+)"/g);
  for (const match of singleMatches) {
    imports.push(match[1]);
  }

  return imports;
}

/**
 * Resolve a Go import path to a file in the project.
 * Go imports use the module path as prefix — strip it to get the relative dir,
 * then find .go files in that directory.
 */
export function resolveGoImport(
  importPath: string,
  modulePath: string,
  goFileSet: Set<string>,
  dir: string
): string | null {
  // Only resolve imports within this module
  if (!importPath.startsWith(modulePath)) return null;

  // Strip module path to get relative directory
  const relDir = importPath.slice(modulePath.length).replace(/^\//, "");

  if (!relDir) {
    // Import of the root package — find any .go file at root level
    for (const f of goFileSet) {
      if (!f.includes("/") && f.endsWith(".go") && !f.endsWith("_test.go")) return f;
    }
    return null;
  }

  // Find the first non-test .go file in that directory
  // (In Go, a package = all .go files in a directory, so we pick the "main" one)
  let best: string | null = null;
  for (const f of goFileSet) {
    if (f.startsWith(relDir + "/") && f.endsWith(".go") && !f.endsWith("_test.go")) {
      const remaining = f.slice(relDir.length + 1);
      if (!remaining.includes("/")) {
        // Prefer files named after the directory (idiomatic Go)
        const dirName = path.basename(relDir);
        if (f === `${relDir}/${dirName}.go`) return f;
        if (!best) best = f;
      }
    }
  }
  return best;
}

// ─── Rust import support ───

/**
 * Extract Rust import paths from a .rs file.
 * Handles: use crate::foo::bar, use super::foo, mod foo
 */
export function extractRustImports(content: string): string[] {
  const imports: string[] = [];

  // "use crate::module::item" or "use crate::module::{item1, item2}"
  const useMatches = content.matchAll(/\buse\s+(crate|super)(::\w+)+/g);
  for (const match of useMatches) {
    imports.push(match[0].replace(/^use\s+/, ""));
  }

  // "mod foo;" (declares a submodule — imports foo.rs or foo/mod.rs)
  const modMatches = content.matchAll(/\bmod\s+(\w+)\s*;/g);
  for (const match of modMatches) {
    imports.push(`mod::${match[1]}`);
  }

  return imports;
}

/**
 * Resolve a Rust import to a file in the project.
 * crate:: paths resolve from the crate root (lib.rs or main.rs).
 * super:: paths resolve relative to the current file's parent.
 * mod:: paths resolve to sibling file or subdirectory mod.rs.
 */
export function resolveRustImport(
  importSpec: string,
  fromFile: string,
  rsFileSet: Set<string>
): string | null {
  const fromDir = path.dirname(fromFile);

  // mod declarations: look for sibling file or subdirectory
  if (importSpec.startsWith("mod::")) {
    const modName = importSpec.slice(5);
    // Check for sibling file: dir/modname.rs
    const siblingFile = fromDir === "." ? `${modName}.rs` : `${fromDir}/${modName}.rs`;
    if (rsFileSet.has(siblingFile)) return siblingFile;
    // Check for subdirectory: dir/modname/mod.rs
    const subMod = fromDir === "." ? `${modName}/mod.rs` : `${fromDir}/${modName}/mod.rs`;
    if (rsFileSet.has(subMod)) return subMod;
    return null;
  }

  // super:: paths — resolve relative to parent directory
  if (importSpec.startsWith("super::")) {
    const parts = importSpec.split("::");
    let dir = fromDir;
    let i = 0;
    while (i < parts.length && parts[i] === "super") {
      dir = path.dirname(dir);
      i++;
    }
    if (i >= parts.length) return null;
    const moduleName = parts[i];
    // Check for dir/module.rs
    const candidate = dir === "." ? `${moduleName}.rs` : `${dir}/${moduleName}.rs`;
    if (rsFileSet.has(candidate)) return candidate;
    // Check for dir/module/mod.rs
    const subCandidate = dir === "." ? `${moduleName}/mod.rs` : `${dir}/${moduleName}/mod.rs`;
    if (rsFileSet.has(subCandidate)) return subCandidate;
    return null;
  }

  // crate:: paths — resolve from crate root
  if (importSpec.startsWith("crate::")) {
    const parts = importSpec.replace("crate::", "").split("::");
    // Find the crate root (directory containing lib.rs or main.rs)
    // For workspace crates, the fromFile's crate root is the nearest ancestor with lib.rs
    let crateRoot = findCrateRoot(fromFile, rsFileSet);
    if (!crateRoot) return null;

    // Walk the module path
    let currentDir = crateRoot;
    for (let i = 0; i < Math.min(parts.length, 3); i++) {
      const part = parts[i];
      // Check for file at this level
      const filePath = currentDir === "." ? `${part}.rs` : `${currentDir}/${part}.rs`;
      if (rsFileSet.has(filePath)) return filePath;
      // Check for mod.rs in subdirectory
      const modPath = currentDir === "." ? `${part}/mod.rs` : `${currentDir}/${part}/mod.rs`;
      if (rsFileSet.has(modPath)) return modPath;
      // Continue deeper
      currentDir = currentDir === "." ? part : `${currentDir}/${part}`;
    }
  }

  return null;
}

function findCrateRoot(fromFile: string, rsFileSet: Set<string>): string | null {
  let dir = path.dirname(fromFile);
  // Walk up looking for lib.rs or main.rs
  for (let i = 0; i < 10; i++) {
    if (rsFileSet.has(dir === "." ? "lib.rs" : `${dir}/lib.rs`)) return dir;
    if (rsFileSet.has(dir === "." ? "main.rs" : `${dir}/main.rs`)) return dir;
    if (rsFileSet.has(dir === "." ? "src/lib.rs" : `${dir}/src/lib.rs`)) return dir === "." ? "src" : `${dir}/src`;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
