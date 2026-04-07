import { Server } from "@modelcontextprotocol/sdk/server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanProject } from "../scanner/index.js";
import type { ProjectScan, Finding } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgVersion = (
  JSON.parse(fs.readFileSync(path.join(__dirname, "../../package.json"), "utf-8")) as { version: string }
).version;

interface ServeOptions {
  dir: string;
}

// Cache the scan to avoid re-running on every tool call
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cachedScan: ProjectScan | null = null;
let cachedDir: string | null = null;
let cachedAt = 0;

async function getScan(dir: string, refresh = false): Promise<ProjectScan> {
  const resolved = path.resolve(dir);
  const isStale = Date.now() - cachedAt > CACHE_TTL_MS;
  if (cachedScan && cachedDir === resolved && !refresh && !isStale) {
    return cachedScan;
  }
  cachedScan = await scanProject(resolved);
  cachedDir = resolved;
  cachedAt = Date.now();
  return cachedScan;
}

function invalidateCache(): void {
  cachedScan = null;
  cachedDir = null;
  cachedAt = 0;
}

const TOOLS = [
  {
    name: "analyze_codebase",
    description:
      "Run a full sourcebook analysis on the codebase. Returns the complete ProjectScan including detected languages, frameworks, build commands, project structure, architectural findings, file importance rankings, and repo mode. Use this for a comprehensive overview before making changes.",
    inputSchema: {
      type: "object" as const,
      properties: {
        refresh: {
          type: "boolean",
          description:
            "Force a fresh scan instead of using cached results. Default: false.",
        },
      },
    },
  },
  {
    name: "get_file_context",
    description:
      "Get context for a specific file: its importance score (PageRank), what imports it, what it imports, which conventions apply to it, and whether it appears in co-change clusters. Use this before editing a file to understand its role and impact.",
    inputSchema: {
      type: "object" as const,
      properties: {
        file: {
          type: "string",
          description:
            "Relative file path from the project root (e.g. 'src/utils/auth.ts').",
        },
      },
      required: ["file"],
    },
  },
  {
    name: "get_blast_radius",
    description:
      "Determine what could break if you edit a given file. Returns direct dependents (files that import it), co-change partners (files historically modified together), and whether the file is a hub module. Use this to assess risk before modifying critical code.",
    inputSchema: {
      type: "object" as const,
      properties: {
        file: {
          type: "string",
          description:
            "Relative file path from the project root (e.g. 'src/lib/db.ts').",
        },
      },
      required: ["file"],
    },
  },
  {
    name: "query_conventions",
    description:
      "Return all detected conventions and patterns in the codebase: import styles, error handling, naming conventions, framework-specific patterns, and commit conventions. Use this to ensure new code follows established project patterns.",
    inputSchema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string",
          description:
            "Optional filter by category (e.g. 'Import conventions', 'Error handling', 'Commit conventions'). Returns all conventions if omitted.",
        },
      },
    },
  },
  {
    name: "get_import_graph",
    description:
      "Get import relationship data: hub files (most depended-on), circular dependencies, dead code candidates, and file importance rankings from PageRank analysis. Use this to understand the dependency architecture.",
    inputSchema: {
      type: "object" as const,
      properties: {
        file: {
          type: "string",
          description:
            "Optional file path to focus on. If provided, returns only edges involving this file. If omitted, returns the full graph summary.",
        },
      },
    },
  },
  {
    name: "get_git_insights",
    description:
      "Get insights mined from git history: fragile files (high churn), reverted commits (failed approaches to avoid), active development areas, co-change coupling (invisible dependencies), and commit conventions. Use this to avoid repeating past mistakes.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "get_pressing_questions",
    description:
      "Get the most important things to know before editing a specific file or area of the codebase. Combines blast radius, conventions, git history, and structural context into prioritized guidance. This is the 'what should I know?' briefing.",
    inputSchema: {
      type: "object" as const,
      properties: {
        file: {
          type: "string",
          description:
            "Relative file path you're about to edit (e.g. 'src/api/routes.ts').",
        },
      },
      required: ["file"],
    },
  },
  {
    name: "search_codebase_context",
    description:
      "Search across all analyzed context (findings, conventions, structure, frameworks) by keyword. Returns matching findings with their category, confidence, and rationale. Use this when looking for specific architectural knowledge.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description:
            "Keyword or phrase to search for across all findings and context (e.g. 'authentication', 'circular', 'migration').",
        },
      },
      required: ["query"],
    },
  },
];

// --- Tool Handlers ---

async function handleAnalyzeCodebase(
  dir: string,
  args: { refresh?: boolean }
): Promise<object> {
  if (args.refresh) invalidateCache();
  const scan = await getScan(dir);
  return {
    dir: scan.dir,
    languages: scan.languages,
    frameworks: scan.frameworks,
    repoMode: scan.repoMode,
    commands: scan.commands,
    structure: {
      layout: scan.structure.layout,
      entryPoints: scan.structure.entryPoints,
      directories: scan.structure.directories,
    },
    fileCount: scan.files.length,
    findingCount: scan.findings.length,
    findings: scan.findings.map((f) => ({
      category: f.category,
      description: f.description,
      rationale: f.rationale,
      confidence: f.confidence,
    })),
    topFiles: (scan.rankedFiles || []).slice(0, 15).map((f) => ({
      file: f.file,
      score: Math.round(f.score * 10000) / 10000,
    })),
  };
}

/**
 * Build a human-readable explanation of why a finding was detected.
 */
function buildWhy(f: Finding): string {
  const parts: string[] = [];
  if (f.evidenceFiles && f.evidenceFiles.length > 0) {
    parts.push(`found in ${f.evidenceFiles.length} file${f.evidenceFiles.length > 1 ? "s" : ""}`);
  }
  if (f.evidence) {
    parts.push(f.evidence);
  }
  parts.push(`confidence: ${f.confidence}`);
  return parts.join(", ");
}

/**
 * Check if a finding is relevant to a specific file.
 * Uses evidenceFiles for precise matching, falls back to description matching.
 */
function findingMatchesFile(f: Finding, file: string): boolean {
  // Precise match via evidenceFiles (populated by pattern detection)
  if (f.evidenceFiles && f.evidenceFiles.includes(file)) return true;
  // Fall back to evidence/description string matching
  if (f.evidence?.includes(file)) return true;
  if (f.description.includes(file)) return true;
  return false;
}

async function handleGetFileContext(
  dir: string,
  args: { file: string }
): Promise<object> {
  const scan = await getScan(dir);
  const file = args.file;

  // Find importance score
  const ranked = scan.rankedFiles || [];
  const fileRank = ranked.find((r) => r.file === file);
  const rank = ranked.findIndex((r) => r.file === file);

  // Find findings relevant to this file
  const relevantFindings = scan.findings.filter((f) => findingMatchesFile(f, file));

  // Get conventions that apply (category-based)
  const conventionCategories = new Set([
    "Import conventions",
    "Error handling",
    "TypeScript",
    "TypeScript imports",
    "Commit conventions",
  ]);
  const conventions = scan.findings.filter((f) =>
    conventionCategories.has(f.category)
  );

  // Check if it's a hub file
  const hubFinding = scan.findings.find(
    (f) => f.category === "Core modules" && f.description.includes(file)
  );

  // Check co-change clusters
  const coChangeFinding = scan.findings.find(
    (f) => f.category === "Hidden dependencies" && findingMatchesFile(f, file)
  );

  // Build human-readable summary
  const summaryParts: string[] = [];
  if (hubFinding) summaryParts.push("hub file (high blast radius)");
  if (coChangeFinding) summaryParts.push("has co-change partners");
  if (relevantFindings.length > 0) summaryParts.push(`${relevantFindings.length} relevant finding${relevantFindings.length > 1 ? "s" : ""}`);

  return {
    file,
    exists: scan.files.includes(file),
    summary: summaryParts.length > 0
      ? `${file}: ${summaryParts.join(", ")}`
      : `${file}: no special concerns found`,
    importance: fileRank
      ? {
          score: Math.round(fileRank.score * 10000) / 10000,
          rank: rank + 1,
          totalFiles: ranked.length,
        }
      : null,
    isHub: !!hubFinding,
    hubDetail: hubFinding?.description || null,
    coChangePartners: coChangeFinding?.description || null,
    relevantFindings: relevantFindings.map((f) => ({
      category: f.category,
      description: f.description,
      confidence: f.confidence,
      evidence: f.evidence || null,
      evidenceFiles: f.evidenceFiles?.slice(0, 10) || null,
      why: buildWhy(f),
    })),
    applicableConventions: conventions.map((f) => ({
      category: f.category,
      description: f.description,
    })),
  };
}

async function handleGetBlastRadius(
  dir: string,
  args: { file: string }
): Promise<object> {
  const scan = await getScan(dir);
  const file = args.file;

  // Use cached edges from scan (no re-analysis needed)
  const edges = scan.edges || [];

  // Files that directly import this file (dependents)
  const directDependents = edges
    .filter((e) => e.to === file)
    .map((e) => e.from)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, 20);

  // Find relevant findings using precise matching
  const hubFinding = scan.findings.find(
    (f) => f.category === "Core modules" && findingMatchesFile(f, file)
  );
  const coChangeFinding = scan.findings.find(
    (f) => f.category === "Hidden dependencies" && findingMatchesFile(f, file)
  );
  const fragileFinding = scan.findings.find(
    (f) => f.category === "Fragile code" && findingMatchesFile(f, file)
  );
  const circularFinding = scan.findings.find(
    (f) => f.category === "Circular dependencies" && findingMatchesFile(f, file)
  );

  // Importance rank
  const ranked = scan.rankedFiles || [];
  const fileRank = ranked.find((r) => r.file === file);

  // Compute risk level with more factors
  const riskFactors: string[] = [];
  if (hubFinding) riskFactors.push("hub file (many dependents)");
  if (directDependents.length >= 5) riskFactors.push(`${directDependents.length} direct dependents`);
  if (circularFinding) riskFactors.push("involved in circular dependency");
  if (fragileFinding) riskFactors.push("historically fragile (frequent re-edits)");
  if (coChangeFinding) riskFactors.push("has co-change partners that may need updating");

  const riskLevel = hubFinding || directDependents.length >= 10
    ? "high"
    : circularFinding || fragileFinding || directDependents.length >= 5
      ? "medium"
      : "low";

  return {
    file,
    summary: riskFactors.length > 0
      ? `${file}: ${riskLevel} risk — ${riskFactors.join("; ")}`
      : `${file}: low risk — no special concerns`,
    importance: fileRank
      ? Math.round(fileRank.score * 10000) / 10000
      : null,
    directDependents,
    directDependentCount: directDependents.length,
    isHub: !!hubFinding,
    hubDetail: hubFinding?.description || null,
    coChangePartners: coChangeFinding?.description || null,
    isFragile: !!fragileFinding,
    fragileDetail: fragileFinding?.description || null,
    inCircularDep: !!circularFinding,
    circularDetail: circularFinding?.description || null,
    riskLevel,
    riskFactors,
  };
}

async function handleQueryConventions(
  dir: string,
  args: { category?: string }
): Promise<object> {
  const scan = await getScan(dir);

  // Convention-related categories
  const conventionCategories = new Set([
    "Import conventions",
    "Error handling",
    "TypeScript",
    "TypeScript imports",
    "Commit conventions",
    "Tailwind",
    "Next.js routing",
    "Next.js deployment",
    "Next.js images",
    "Expo routing",
    "Expo builds",
    "Expo deep linking",
    "Supabase",
    "Django",
    "FastAPI",
    "Go module",
    "Go layout",
    "Go visibility",
    "Testing",
    "Python environment",
    "Dominant patterns",
  ]);

  let conventions = scan.findings.filter(
    (f) =>
      conventionCategories.has(f.category) ||
      f.category.includes("convention") ||
      f.category.includes("pattern")
  );

  if (args.category) {
    const cat = args.category.toLowerCase();
    conventions = conventions.filter(
      (f) => f.category.toLowerCase().includes(cat)
    );
  }

  return {
    summary: `${conventions.length} convention${conventions.length !== 1 ? "s" : ""} detected across ${new Set(conventions.map((f) => f.category)).size} categories`,
    conventions: conventions.map((f) => ({
      category: f.category,
      description: f.description,
      confidence: f.confidence,
      evidence: f.evidence || null,
      evidenceFiles: f.evidenceFiles?.slice(0, 10) || null,
      why: buildWhy(f),
    })),
    frameworks: scan.frameworks,
    repoMode: scan.repoMode,
  };
}

async function handleGetImportGraph(
  dir: string,
  args: { file?: string }
): Promise<object> {
  const scan = await getScan(dir);

  const graphFindings = scan.findings.filter((f) =>
    ["Core modules", "Circular dependencies", "Dead code candidates"].includes(
      f.category
    )
  );

  const ranked = scan.rankedFiles || [];

  const edges = scan.edges || [];

  if (args.file) {
    const file = args.file;
    const fileRank = ranked.find((r) => r.file === file);
    const rank = ranked.findIndex((r) => r.file === file);

    // Direct imports (what this file imports)
    const imports = edges
      .filter((e) => e.from === file)
      .map((e) => e.to)
      .filter((v, i, arr) => arr.indexOf(v) === i);

    // Direct dependents (what imports this file)
    const dependents = edges
      .filter((e) => e.to === file)
      .map((e) => e.from)
      .filter((v, i, arr) => arr.indexOf(v) === i);

    return {
      file,
      importance: fileRank
        ? {
            score: Math.round(fileRank.score * 10000) / 10000,
            rank: rank + 1,
            totalFiles: ranked.length,
          }
        : null,
      imports,
      dependents,
      graphFindings: graphFindings
        .filter((f) => findingMatchesFile(f, file))
        .map((f) => ({
          category: f.category,
          description: f.description,
          confidence: f.confidence,
        })),
    };
  }

  return {
    totalEdges: edges.length,
    topFiles: ranked.slice(0, 20).map((f) => ({
      file: f.file,
      score: Math.round(f.score * 10000) / 10000,
    })),
    findings: graphFindings.map((f) => ({
      category: f.category,
      description: f.description,
      confidence: f.confidence,
    })),
  };
}

async function handleGetGitInsights(dir: string): Promise<object> {
  const scan = await getScan(dir);

  const gitCategories = new Set([
    "Git history",
    "Anti-patterns",
    "Active development",
    "Hidden dependencies",
    "Fragile code",
    "Commit conventions",
  ]);

  const gitFindings = scan.findings.filter((f) =>
    gitCategories.has(f.category)
  );

  return {
    findings: gitFindings.map((f) => ({
      category: f.category,
      description: f.description,
      rationale: f.rationale,
      confidence: f.confidence,
    })),
  };
}

async function handleGetPressingQuestions(
  dir: string,
  args: { file: string }
): Promise<object> {
  const scan = await getScan(dir);
  const file = args.file;

  const questions: { priority: number; question: string; detail: string }[] =
    [];

  // Check if it's a hub file
  const hubFinding = scan.findings.find(
    (f) => f.category === "Core modules" && findingMatchesFile(f, file)
  );
  if (hubFinding) {
    questions.push({
      priority: 1,
      question: "This is a hub file with wide blast radius",
      detail: hubFinding.description,
    });
  }

  // Check circular dependencies
  const circularFinding = scan.findings.find(
    (f) => f.category === "Circular dependencies" && findingMatchesFile(f, file)
  );
  if (circularFinding) {
    questions.push({
      priority: 2,
      question: "This file is involved in a circular dependency",
      detail: circularFinding.description,
    });
  }

  // Check fragile code
  const fragileFinding = scan.findings.find(
    (f) => f.category === "Fragile code" && findingMatchesFile(f, file)
  );
  if (fragileFinding) {
    questions.push({
      priority: 3,
      question: "This file has high recent churn (hard to get right)",
      detail: fragileFinding.description,
    });
  }

  // Check co-change coupling
  const coChangeFinding = scan.findings.find(
    (f) => f.category === "Hidden dependencies" && findingMatchesFile(f, file)
  );
  if (coChangeFinding) {
    questions.push({
      priority: 4,
      question: "This file has hidden dependencies (co-change partners)",
      detail: coChangeFinding.description,
    });
  }

  // Check anti-patterns
  const antiPatterns = scan.findings.filter(
    (f) => f.category === "Anti-patterns"
  );
  if (antiPatterns.length > 0) {
    questions.push({
      priority: 5,
      question: "There are known anti-patterns in this project",
      detail: antiPatterns.map((f) => f.description).join("; "),
    });
  }

  // Applicable conventions
  const conventions = scan.findings.filter(
    (f) =>
      f.category.includes("convention") ||
      f.category.includes("Convention") ||
      f.category.includes("Import") ||
      f.category.includes("TypeScript") ||
      f.category.includes("pattern") ||
      f.category.includes("Pattern")
  );
  if (conventions.length > 0) {
    questions.push({
      priority: 6,
      question: "Follow these project conventions",
      detail: conventions.map((f) => f.description).join("; "),
    });
  }

  // Active development area?
  const activeFinding = scan.findings.find(
    (f) =>
      f.category === "Active development" &&
      f.description.includes(file.split("/")[0])
  );
  if (activeFinding) {
    questions.push({
      priority: 7,
      question: "This area is under active development",
      detail: activeFinding.description,
    });
  }

  questions.sort((a, b) => a.priority - b.priority);

  return {
    file,
    questions,
    summary:
      questions.length > 0
        ? `${questions.length} things to know before editing ${file}`
        : `No special concerns found for ${file}`,
  };
}

async function handleSearchCodebaseContext(
  dir: string,
  args: { query: string }
): Promise<object> {
  const scan = await getScan(dir);
  const query = args.query.toLowerCase();

  const matches = scan.findings.filter(
    (f) =>
      f.description.toLowerCase().includes(query) ||
      f.category.toLowerCase().includes(query) ||
      (f.rationale && f.rationale.toLowerCase().includes(query)) ||
      (f.evidence && f.evidence.toLowerCase().includes(query))
  );

  // Also search structure
  const structureMatches: { key: string; value: string }[] = [];
  for (const [dir, purpose] of Object.entries(scan.structure.directories)) {
    if (
      dir.toLowerCase().includes(query) ||
      purpose.toLowerCase().includes(query)
    ) {
      structureMatches.push({ key: dir, value: purpose });
    }
  }

  // Search frameworks
  const frameworkMatches = scan.frameworks.filter((f) =>
    f.toLowerCase().includes(query)
  );

  return {
    query: args.query,
    findings: matches.map((f) => ({
      category: f.category,
      description: f.description,
      rationale: f.rationale,
      confidence: f.confidence,
    })),
    structureMatches,
    frameworkMatches,
    totalResults: matches.length + structureMatches.length + frameworkMatches.length,
  };
}

// --- Main ---

export async function serve(options: ServeOptions): Promise<void> {
  const dir = path.resolve(options.dir);

  // Suppress all console output — STDIO transport uses stdout for JSON-RPC
  const originalLog = console.log;
  const originalError = console.error;
  console.log = () => {};
  console.error = () => {};

  const server = new Server(
    {
      name: "sourcebook",
      version: pkgVersion,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: object;

      switch (name) {
        case "analyze_codebase":
          result = await handleAnalyzeCodebase(dir, args as { refresh?: boolean });
          break;
        case "get_file_context":
          result = await handleGetFileContext(dir, args as { file: string });
          break;
        case "get_blast_radius":
          result = await handleGetBlastRadius(dir, args as { file: string });
          break;
        case "query_conventions":
          result = await handleQueryConventions(dir, args as { category?: string });
          break;
        case "get_import_graph":
          result = await handleGetImportGraph(dir, args as { file?: string });
          break;
        case "get_git_insights":
          result = await handleGetGitInsights(dir);
          break;
        case "get_pressing_questions":
          result = await handleGetPressingQuestions(dir, args as { file: string });
          break;
        case "search_codebase_context":
          result = await handleSearchCodebaseContext(dir, args as { query: string });
          break;
        default:
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: `Unknown tool: ${name}` }),
              },
            ],
            isError: true,
          };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: message }),
          },
        ],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Restore console for cleanup messages on stderr
  console.error = originalError;
}
