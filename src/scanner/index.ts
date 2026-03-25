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

  return {
    dir,
    files,
    languages,
    frameworks: frameworks.map((f) => f.name),
    commands,
    structure,
    findings,
    rankedFiles: graphAnalysis.rankedFiles,
  };
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
