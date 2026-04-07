import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { globSync } from "glob";
import { detectFrameworks } from "./frameworks.js";
import { detectBuildCommands } from "./build.js";
import { detectPatterns } from "./patterns.js";
import { detectProjectStructure } from "./structure.js";
import { analyzeGitHistory } from "./git.js";
import { analyzeImportGraph } from "./graph.js";
import type { ProjectScan, Finding } from "../types.js";

const IGNORE_PATTERNS = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.git/**",
  "**/.next/**",
  "**/coverage/**",
  "**/.expo/**",
  "**/android/**",
  "**/ios/**",
  "**/*.lock",
  "**/package-lock.json",
  "**/.claude/worktrees/**",
  "**/.claude/**",
];

export async function scanProject(dir: string): Promise<ProjectScan> {
  // Collect all files
  const files = globSync("**/*", {
    cwd: dir,
    nodir: true,
    ignore: IGNORE_PATTERNS,
    dot: true,
    follow: false,
  });

  // Detect languages from file extensions
  const languages = detectLanguages(files);

  // Detect frameworks from package.json, config files, etc.
  const frameworks = await detectFrameworks(dir, files);

  // Detect build/test/dev commands
  const commands = await detectBuildCommands(dir);

  // Detect project structure patterns
  const structure = detectProjectStructure(dir, files);

  // Detect repo mode early so it can inform pattern detection
  const repoMode = detectRepoMode(dir, files, frameworks.map((f) => f.name));

  // Quick file importance ranking for smarter sampling
  const importanceHints = rankFileImportance(dir, files);

  // Detect code patterns and conventions (the non-obvious stuff)
  const patterns = await detectPatterns(dir, files, frameworks.map((fw) => fw.name), repoMode, importanceHints);

  // Analyze git history for decision shadows and hidden dependencies
  const gitAnalysis = await analyzeGitHistory(dir);

  // Build import graph and run PageRank for structural importance
  const graphAnalysis = await analyzeImportGraph(dir, files);

  // Cross-validate pattern findings against structural and historical signals
  const validatedPatterns = validateFindings(
    patterns,
    graphAnalysis.rankedFiles,
    gitAnalysis.activeAreas,
  );

  // Compile findings -- things an agent wouldn't figure out on its own
  const findings: Finding[] = [
    ...frameworks.map((fw) => fw.findings).flat(),
    ...structure.findings,
    ...validatedPatterns,
    ...gitAnalysis.findings,
    ...graphAnalysis.findings,
  ];

  return {
    dir,
    files,
    languages,
    frameworks: frameworks.map((f) => f.name),
    commands,
    structure,
    findings,
    rankedFiles: graphAnalysis.rankedFiles,
    repoMode,
  };
}

function detectRepoMode(dir: string, files: string[], frameworks: string[]): "app" | "library" | "monorepo" {
  // --- Monorepo detection ---
  const hasMonorepoFile = files.some(
    (f) => f === "pnpm-workspace.yaml" || f === "lerna.json" || f === "nx.json" || f === "turbo.json"
  );
  if (hasMonorepoFile) return "monorepo";

  // Read root package.json for workspace/library signals
  let pkg: Record<string, unknown> = {};
  const pkgPath = path.join(dir, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    } catch {
      // malformed, ignore
    }
  }

  // workspaces field → monorepo
  if (pkg.workspaces) return "monorepo";

  // --- Library detection ---
  const hasAppDirs = files.some(
    (f) => f.startsWith("app/") || f.startsWith("pages/") || f.startsWith("src/app/") || f.startsWith("src/pages/")
  );
  const hasComponents = files.some((f) => f.includes("/components/"));
  const isAppFramework = frameworks.some((f) =>
    ["Next.js", "Remix", "Nuxt", "SvelteKit", "FastAPI", "Flask", "Django", "Rails"].includes(f)
  );

  // package.json "files" or "exports" field → library
  const hasPkgFiles = Array.isArray(pkg.files) && (pkg.files as unknown[]).length > 0;
  const hasPkgExports = pkg.exports !== undefined && pkg.exports !== null;
  if ((hasPkgFiles || hasPkgExports) && !hasAppDirs && !isAppFramework) return "library";

  // "type": "module" with no app framework → lean toward library
  if (pkg.type === "module" && !hasAppDirs && !isAppFramework && !hasComponents) return "library";

  // Python: pyproject.toml with src/ layout → library
  const hasPyprojectToml = files.some((f) => f === "pyproject.toml");
  const hasSrcLayout = files.some((f) => f.startsWith("src/") && f.endsWith(".py"));
  if (hasPyprojectToml && hasSrcLayout && !hasAppDirs) {
    // Confirm it has a [project] section by reading the file
    const pyprojectPath = path.join(dir, "pyproject.toml");
    try {
      const pyprojectContent = fs.readFileSync(pyprojectPath, "utf-8");
      if (pyprojectContent.includes("[project]") || pyprojectContent.includes("[tool.poetry]")) {
        return "library";
      }
    } catch {
      // unreadable, fall through
    }
  }

  // Other Python publish configs without app dirs
  const hasPublishConfig = files.some((f) => f === "setup.py" || f === "setup.cfg");
  if (hasPublishConfig && !hasAppDirs && !hasComponents) return "library";

  // src/lib/ or lib/ layout without app dirs
  const hasSrcLib = files.some((f) => f.startsWith("src/lib/") || f.startsWith("lib/"));
  if (hasSrcLib && !hasAppDirs && !hasComponents && !isAppFramework) return "library";

  // Default: app
  return "app";
}

function detectLanguages(files: string[]): string[] {
  const extMap: Record<string, string> = {
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".py": "Python",
    ".go": "Go",
    ".rs": "Rust",
    ".rb": "Ruby",
    ".java": "Java",
    ".swift": "Swift",
    ".kt": "Kotlin",
    ".css": "CSS",
    ".scss": "SCSS",
    ".html": "HTML",
  };

  const found = new Set<string>();
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (extMap[ext]) found.add(extMap[ext]);
  }
  return [...found];
}

/**
 * Lightweight file importance ranking for hybrid sampling.
 * Runs before full graph/git analysis — fast fan-in count + git churn.
 */
function rankFileImportance(
  dir: string,
  files: string[],
): { highImportFiles: string[]; highChurnFiles: string[] } {
  const highImportFiles: string[] = [];
  const highChurnFiles: string[] = [];

  // --- Quick fan-in count (who gets imported the most?) ---
  const sourceFiles = files.filter(
    (f) =>
      /\.(ts|tsx|js|jsx)$/.test(f) &&
      !f.endsWith(".d.ts") &&
      !f.includes("node_modules")
  );

  if (sourceFiles.length >= 10) {
    const fileSet = new Set(sourceFiles);
    const fanIn = new Map<string, number>();

    // Sample up to 200 files for import scanning
    const sorted = sourceFiles.slice().sort();
    const step = Math.max(1, Math.floor(sorted.length / 200));
    const sample = sorted.filter((_, i) => i % step === 0).slice(0, 200);

    for (const file of sample) {
      const filePath = path.resolve(path.join(dir, file));
      if (!filePath.startsWith(path.resolve(dir) + path.sep)) continue;
      let content: string;
      try {
        // Read only first 2KB — imports are at the top
        const fd = fs.openSync(filePath, "r");
        const buf = Buffer.alloc(2048);
        const bytesRead = fs.readSync(fd, buf, 0, 2048, 0);
        fs.closeSync(fd);
        content = buf.toString("utf-8", 0, bytesRead);
      } catch {
        continue;
      }

      // Extract import targets
      const importPaths: string[] = [];
      for (const m of content.matchAll(/(?:import|export)\s+.*?\s+from\s+['"]([^'"]+)['"]/g)) {
        importPaths.push(m[1]);
      }
      for (const m of content.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        importPaths.push(m[1]);
      }

      for (const imp of importPaths.filter((p) => p.startsWith(".") || p.startsWith("@/") || p.startsWith("~/"))) {
        let resolved: string;
        if (imp.startsWith("@/") || imp.startsWith("~/")) {
          resolved = imp.replace(/^[@~]\//, "src/");
        } else {
          resolved = path.normalize(path.join(path.dirname(file), imp));
        }
        const withoutJsExt = resolved.replace(/\.js$/, "");
        // Try common resolutions
        for (const candidate of [resolved, withoutJsExt, `${withoutJsExt}.ts`, `${withoutJsExt}.tsx`, `${resolved}.ts`, `${resolved}.tsx`, `${resolved}.js`]) {
          const normalized = candidate.replace(/^\.\//, "");
          if (fileSet.has(normalized)) {
            fanIn.set(normalized, (fanIn.get(normalized) || 0) + 1);
            break;
          }
        }
      }
    }

    // Top 20 by fan-in
    const topByFanIn = [...fanIn.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([f]) => f);
    highImportFiles.push(...topByFanIn);
  }

  // --- Quick git churn (most-changed files in last 3 months) ---
  try {
    const gitOutput = execFileSync(
      "git",
      ["log", "--since=3 months ago", "--name-only", "--pretty=format:", "--diff-filter=AMRC", "-500"],
      { cwd: dir, encoding: "utf-8", timeout: 5000, maxBuffer: 1024 * 1024 }
    );
    const churnCount = new Map<string, number>();
    for (const line of gitOutput.split("\n")) {
      const file = line.trim();
      if (file && !file.includes("node_modules")) {
        churnCount.set(file, (churnCount.get(file) || 0) + 1);
      }
    }
    const topByChurn = [...churnCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([f]) => f);
    highChurnFiles.push(...topByChurn);
  } catch {
    // No git or shallow clone — skip churn data
  }

  return { highImportFiles, highChurnFiles };
}

/**
 * Cross-validate pattern findings against PageRank and git activity.
 * Adjusts confidence dynamically — weak detections get demoted so they
 * move to supplementary sections or get dropped entirely.
 */
function validateFindings(
  findings: Finding[],
  rankedFiles: { file: string; score: number }[],
  activeAreas: string[],
): Finding[] {
  const topFiles = new Set(rankedFiles.slice(0, 20).map((r) => r.file));
  const activeDirs = new Set(activeAreas);

  return findings.map((f) => {
    if (!f.evidenceFiles || f.evidenceFiles.length === 0) return f;

    let score = 0;
    const count = f.evidenceFiles.length;

    // File count factor
    if (count >= 5) score += 2;
    else if (count >= 3) score += 1;

    // PageRank overlap: evidence files that are structurally important
    const prOverlap = f.evidenceFiles.filter((ef) => topFiles.has(ef)).length;
    if (prOverlap >= 2) score += 2;
    else if (prOverlap >= 1) score += 1;

    // Git activity overlap: evidence files in actively maintained directories
    const activeOverlap = f.evidenceFiles.some((ef) => {
      const topDir = ef.split("/")[0];
      return activeDirs.has(topDir);
    });
    if (activeOverlap) score += 1;

    // Map score to confidence
    let confidence: "high" | "medium" | "low";
    if (score >= 4) confidence = "high";
    else if (score >= 2) confidence = "medium";
    else confidence = "low";

    // Never downgrade from high if file count alone is overwhelming
    if (f.confidence === "high" && count >= 10) confidence = "high";

    // Category-specific: auth detected in only 1 directory with no PageRank presence → medium
    if (f.description.includes("Auth") || f.description.includes("auth")) {
      const authDirs = new Set(f.evidenceFiles.map((ef) => ef.split("/").slice(0, -1).join("/")));
      if (authDirs.size <= 1 && prOverlap === 0 && confidence === "high") {
        confidence = "medium";
      }
    }

    // Category-specific: DB/ORM with only 2 files and no PageRank → medium
    if ((f.description.includes("Database") || f.description.includes("database")) && count <= 2 && prOverlap === 0) {
      confidence = "medium";
    }

    return { ...f, confidence };
  });
}
