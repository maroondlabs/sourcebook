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
  // Monorepo detection
  const hasWorkspaces = files.some(
    (f) => f === "pnpm-workspace.yaml" || f === "lerna.json" || f === "nx.json"
  );
  if (hasWorkspaces) return "monorepo";

  // Library detection
  const hasPublishConfig = files.some((f) => f === "setup.py" || f === "pyproject.toml" || f === "setup.cfg");
  const hasSrcLib = files.some((f) => f.startsWith("src/lib/") || f.startsWith("lib/"));
  const hasExportsField = false; // would need to read package.json, but frameworks already detected
  const isLibraryFramework = frameworks.some((f) =>
    ["FastAPI", "Flask", "Django", "Hono", "Express"].includes(f)
  );
  // If it has a setup.py/pyproject.toml AND no app/ or pages/ → library
  const hasAppDirs = files.some(
    (f) => f.startsWith("app/") || f.startsWith("pages/") || f.startsWith("src/app/") || f.startsWith("src/pages/")
  );
  const hasComponents = files.some((f) => f.includes("/components/"));

  if (hasPublishConfig && !hasAppDirs && !hasComponents) return "library";
  if (hasSrcLib && !hasAppDirs && !hasComponents && !isLibraryFramework) return "library";

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
