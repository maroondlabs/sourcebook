import fs from "node:fs";
import path from "node:path";
import type { Finding } from "../types.js";

interface ImportEdge {
  from: string;
  to: string;
}

interface GraphAnalysis {
  /** Files ranked by importance (PageRank) */
  rankedFiles: { file: string; score: number }[];
  /** Findings about architecture from the graph */
  findings: Finding[];
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

  // Only analyze source files
  const sourceFiles = files.filter((f) =>
    /\.(ts|tsx|js|jsx)$/.test(f)
  );

  if (sourceFiles.length < 5) {
    return { rankedFiles: [], findings };
  }

  // Extract imports from each file
  const edges: ImportEdge[] = [];
  const fileSet = new Set(sourceFiles);

  for (const file of sourceFiles) {
    const filePath = path.join(dir, file);
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const imports = extractImports(content);

    for (const imp of imports) {
      const resolved = resolveImport(imp, file, fileSet, dir);
      if (resolved) {
        edges.push({ from: file, to: resolved });
      }
    }
  }

  if (edges.length < 5) {
    return { rankedFiles: [], findings };
  }

  // Run PageRank
  const scores = pageRank(sourceFiles, edges, 20, 0.85);

  // Sort by score descending
  const rankedFiles = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([file, score]) => ({ file, score }));

  // Find hub files (high fan-in -- many files import them)
  const fanIn = new Map<string, number>();
  for (const edge of edges) {
    fanIn.set(edge.to, (fanIn.get(edge.to) || 0) + 1);
  }

  const hubs = [...fanIn.entries()]
    .filter(([, count]) => count >= 5)
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

  // Detect potential circular dependencies
  const cycles = detectCycles(edges, sourceFiles);
  if (cycles.length > 0) {
    const cycleDescriptions = cycles
      .slice(0, 3)
      .map((c) => c.map((f) => path.basename(f)).join(" → "));

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
  const orphans = sourceFiles.filter(
    (f) =>
      !connectedFiles.has(f) &&
      !f.includes("test") &&
      !f.includes("spec") &&
      !f.includes(".config") &&
      !f.endsWith(".d.ts")
  );

  if (orphans.length >= 3 && orphans.length < sourceFiles.length * 0.3) {
    findings.push({
      category: "Dead code candidates",
      description: `${orphans.length} source files have no import connections (potential dead code): ${orphans.slice(0, 5).join(", ")}${orphans.length > 5 ? ", ..." : ""}`,
      confidence: "low",
      discoverable: false,
    });
  }

  return { rankedFiles, findings };
}

/**
 * Extract import paths from a source file using regex.
 * Not as robust as Tree-sitter but fast and sufficient for graph building.
 */
function extractImports(content: string): string[] {
  const imports: string[] = [];

  // ES imports: import ... from "path"
  const esImports = content.matchAll(
    /(?:import|export)\s+.*?\s+from\s+['"]([^'"]+)['"]/g
  );
  for (const match of esImports) {
    imports.push(match[1]);
  }

  // Dynamic imports: import("path")
  const dynamicImports = content.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
  for (const match of dynamicImports) {
    imports.push(match[1]);
  }

  // require: require("path")
  const requires = content.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
  for (const match of requires) {
    imports.push(match[1]);
  }

  // Only return relative imports (not packages)
  return imports.filter((p) => p.startsWith(".") || p.startsWith("@/") || p.startsWith("~/"));
}

/**
 * Resolve an import path to an actual file in the project.
 */
function resolveImport(
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

  // Try exact match, then with extensions, then as directory index
  const candidates = [
    resolved,
    `${resolved}.ts`,
    `${resolved}.tsx`,
    `${resolved}.js`,
    `${resolved}.jsx`,
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
function pageRank(
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

  const cycles: string[][] = [];
  const visited = new Set<string>();
  const stack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): void {
    if (cycles.length >= 5) return;
    if (stack.has(node)) {
      // Found a cycle
      const cycleStart = path.indexOf(node);
      if (cycleStart !== -1) {
        const cycle = [...path.slice(cycleStart), node];
        if (cycle.length <= 5) {
          // Only report short cycles
          cycles.push(cycle);
        }
      }
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    stack.add(node);
    path.push(node);

    for (const neighbor of adj.get(node) || []) {
      dfs(neighbor);
    }

    stack.delete(node);
    path.pop();
  }

  for (const file of files) {
    if (!visited.has(file)) dfs(file);
    if (cycles.length >= 5) break;
  }

  return cycles;
}
