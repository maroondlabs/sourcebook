import fs from "node:fs";
import path from "node:path";
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

  // Detect code patterns and conventions (the non-obvious stuff)
  const patterns = await detectPatterns(dir, files, frameworks.map((fw) => fw.name));

  // Analyze git history for decision shadows and hidden dependencies
  const gitAnalysis = await analyzeGitHistory(dir);

  // Build import graph and run PageRank for structural importance
  const graphAnalysis = await analyzeImportGraph(dir, files);

  // Compile findings -- things an agent wouldn't figure out on its own
  const findings: Finding[] = [
    ...frameworks.map((fw) => fw.findings).flat(),
    ...structure.findings,
    ...patterns,
    ...gitAnalysis.findings,
    ...graphAnalysis.findings,
  ];

  // Detect repo mode for prioritization
  const repoMode = detectRepoMode(dir, files, frameworks.map((f) => f.name));

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
