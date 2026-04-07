export interface Finding {
  /** Category of the finding */
  category: string;
  /** Human-readable description of the finding */
  description: string;
  /** Why this matters -- context an agent needs */
  rationale?: string;
  /** File path or pattern that evidences this finding */
  evidence?: string;
  /** How confident we are this is a real convention, not coincidence */
  confidence: "high" | "medium" | "low";
  /** Is this discoverable by an agent reading the code? If yes, we filter it out */
  discoverable: boolean;
  /** Files that contributed to this finding (for cross-validation against PageRank/git) */
  evidenceFiles?: string[];
}

export interface FrameworkDetection {
  name: string;
  version?: string;
  findings: Finding[];
}

export interface StructureAnalysis {
  /** Detected project layout pattern (e.g., "feature-based", "layer-based") */
  layout?: string;
  /** Entry points */
  entryPoints: string[];
  /** Key directories and their purposes */
  directories: Record<string, string>;
  /** Findings about structure that aren't obvious */
  findings: Finding[];
}

export interface BuildCommands {
  dev?: string;
  build?: string;
  test?: string;
  lint?: string;
  start?: string;
  [key: string]: string | undefined;
}

export interface ProjectScan {
  dir: string;
  files: string[];
  languages: string[];
  frameworks: string[];
  commands: BuildCommands;
  structure: StructureAnalysis;
  findings: Finding[];
  /** Files ranked by PageRank importance in the import graph */
  rankedFiles?: { file: string; score: number }[];
  /** Import graph edges (from → to) for dependency analysis */
  edges?: { from: string; to: string }[];
  /** Detected repo mode for context prioritization */
  repoMode?: "app" | "library" | "monorepo";
}
