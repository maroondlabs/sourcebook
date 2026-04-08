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

  // Build import graph first — PageRank results inform pattern sampling
  const graphAnalysis = await analyzeImportGraph(dir, files);

  // Quick git churn ranking for sampling (lightweight, single git command)
  const highChurnFiles = getHighChurnFiles(dir);

  // Use PageRank top files + git churn for smarter pattern sampling
  const importanceHints = {
    highImportFiles: graphAnalysis.rankedFiles.slice(0, 20).map((r) => r.file),
    highChurnFiles,
  };

  // Detect code patterns and conventions (the non-obvious stuff)
  const patterns = await detectPatterns(dir, files, frameworks.map((fw) => fw.name), repoMode, importanceHints);

  // Analyze git history for decision shadows and hidden dependencies
  const gitAnalysis = await analyzeGitHistory(dir);

  // Cross-validate pattern findings against structural and historical signals
  const validatedPatterns = validateFindings(
    patterns,
    graphAnalysis.rankedFiles,
    gitAnalysis.activeAreas,
  );

  // Surface library mode explicitly — agents need to know this is a publishable
  // package, not an app. Affects how they treat the public API surface.
  const repoModeFindings: Finding[] = [];
  if (repoMode === "library") {
    repoModeFindings.push({
      category: "Project structure",
      description: "This is a publishable library, not an application. Focus changes on the public API surface. Avoid breaking changes to exported types and function signatures.",
      confidence: "high",
      discoverable: false,
    });
  }

  // Compile findings -- things an agent wouldn't figure out on its own
  const findings: Finding[] = [
    ...frameworks.map((fw) => fw.findings).flat(),
    ...structure.findings,
    ...repoModeFindings,
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
    edges: graphAnalysis.edges,
    repoMode,
  };
}

export function detectRepoMode(dir: string, files: string[], frameworks: string[]): "app" | "library" | "monorepo" {
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

  // Python: pyproject.toml with src/ layout or flat package layout → library
  const hasPyprojectToml = files.some((f) => f === "pyproject.toml");
  const hasSrcLayout = files.some((f) => f.startsWith("src/") && f.endsWith(".py"));
  const excludedDirs = new Set(["test", "tests", "docs", "examples", "scripts", "tools", "benchmarks", ".github"]);
  const hasFlatPythonPackage = files.some((f) => {
    const parts = f.split("/");
    return parts.length === 2 && parts[1] === "__init__.py" && !excludedDirs.has(parts[0]);
  });
  if (hasPyprojectToml && (hasSrcLayout || hasFlatPythonPackage) && !hasAppDirs) {
    // Confirm it has a [project] or [tool.poetry] section
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

export function detectLanguages(files: string[]): string[] {
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
 * Quick git churn ranking — most-changed files in the last 3 months.
 * Single git command, returns top-20 file paths.
 */
function getHighChurnFiles(dir: string): string[] {
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
    return [...churnCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([f]) => f);
  } catch {
    return []; // No git or shallow clone
  }
}

/**
 * Cross-validate pattern findings against PageRank and git activity.
 * Adjusts confidence dynamically — weak detections get demoted so they
 * move to supplementary sections or get dropped entirely.
 */
export function validateFindings(
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

    // File count factor — dominant patterns (7+) are strong signals on their own
    if (count >= 7) score += 3;
    else if (count >= 5) score += 2;
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
    // 3+ = high (5+ files in active area, or fewer files with PageRank presence)
    // 2  = medium (some signal but not strong)
    // <2 = low (weak detection, likely noise)
    let confidence: "high" | "medium" | "low";
    if (score >= 3) confidence = "high";
    else if (score >= 2) confidence = "medium";
    else confidence = "low";

    // Never downgrade from high if file count alone is overwhelming
    if (f.confidence === "high" && count >= 10) confidence = "high";

    // Floor: explicit pattern detections with 3+ evidence files should never be
    // dropped entirely. Cross-validation can lower confidence but low = invisible.
    // This matters most for shallow clones (no activeAreas → score=1 even for
    // valid patterns like auth, routing detected in 3 files).
    if (confidence === "low" && count >= 3) confidence = "medium";

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
