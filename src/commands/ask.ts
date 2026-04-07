import chalk from "chalk";
import path from "node:path";
import { scanProject } from "../scanner/index.js";
import type { ProjectScan, Finding } from "../types.js";

interface AskOptions {
  dir: string;
  json?: boolean;
}

// Topic taxonomy — maps natural language to finding categories
const TOPICS: Record<string, {
  keywords: string[];
  categories: string[];
  structureKeys?: string[];
  extraContext?: (scan: ProjectScan) => Record<string, unknown> | null;
}> = {
  auth: {
    keywords: ["auth", "login", "session", "jwt", "oauth", "signin", "signup", "password", "authentication"],
    categories: ["Dominant patterns", "Supabase"],
  },
  routing: {
    keywords: ["route", "routes", "endpoint", "api", "url", "router", "navigation"],
    categories: ["Dominant patterns", "Next.js routing", "Expo routing"],
    structureKeys: ["route", "api", "pages", "app"],
  },
  testing: {
    keywords: ["test", "tests", "spec", "jest", "vitest", "pytest", "testing", "coverage"],
    categories: ["Testing", "Dominant patterns"],
    structureKeys: ["test", "spec", "__tests__"],
    extraContext: (scan) => scan.commands.test ? { testCommand: scan.commands.test } : null,
  },
  database: {
    keywords: ["database", "db", "orm", "prisma", "sql", "model", "schema", "migration", "drizzle", "mongoose"],
    categories: ["Dominant patterns", "Supabase", "Django"],
    structureKeys: ["prisma", "migrations", "models", "db"],
  },
  styling: {
    keywords: ["style", "styles", "css", "tailwind", "styled", "sass", "scss", "theme"],
    categories: ["Dominant patterns", "Tailwind"],
  },
  imports: {
    keywords: ["import", "imports", "require", "module", "export", "exports", "dependency"],
    categories: ["Import conventions", "TypeScript imports", "Export conventions"],
  },
  errors: {
    keywords: ["error", "errors", "exception", "handling", "catch"],
    categories: ["Error handling"],
  },
  typescript: {
    keywords: ["typescript", "ts", "types", "typing", "interface"],
    categories: ["TypeScript", "TypeScript imports"],
  },
  structure: {
    keywords: ["structure", "directory", "folder", "layout", "architecture", "organize"],
    categories: ["Project structure"],
    extraContext: (scan) => ({
      layout: scan.structure.layout,
      entryPoints: scan.structure.entryPoints,
      directories: scan.structure.directories,
    }),
  },
  conventions: {
    keywords: ["convention", "conventions", "pattern", "patterns", "standard", "rule", "rules"],
    categories: [
      "Import conventions", "Error handling", "TypeScript", "Commit conventions",
      "Dominant patterns", "Export conventions", "Python conventions", "Go conventions",
    ],
  },
  fragile: {
    keywords: ["fragile", "risk", "risky", "dangerous", "careful", "brittle", "blast", "break"],
    categories: ["Fragile code", "Core modules", "Circular dependencies", "Anti-patterns", "Hidden dependencies"],
    extraContext: (scan) => {
      const top = (scan.rankedFiles || []).slice(0, 5);
      return top.length > 0 ? { highImpactFiles: top.map((f) => f.file) } : null;
    },
  },
  git: {
    keywords: ["git", "commit", "history", "change", "active", "recent"],
    categories: ["Git history", "Active development", "Commit conventions", "Hidden dependencies"],
  },
  build: {
    keywords: ["build", "deploy", "ci", "pipeline", "script", "command", "commands"],
    categories: ["Environment", "Next.js deployment", "Expo builds"],
    extraContext: (scan) => {
      const cmds: Record<string, string> = {};
      for (const [k, v] of Object.entries(scan.commands)) {
        if (v) cmds[k] = v;
      }
      return Object.keys(cmds).length > 0 ? { commands: cmds } : null;
    },
  },
  environment: {
    keywords: ["env", "environment", "config", "configuration", "variable", "secret"],
    categories: ["Environment"],
  },
  components: {
    keywords: ["component", "components", "ui", "widget"],
    categories: ["Dominant patterns"],
    structureKeys: ["components", "ui"],
  },
  graph: {
    keywords: ["graph", "dependency", "dependencies", "circular", "dead code", "hub", "import graph"],
    categories: ["Core modules", "Circular dependencies", "Dead code candidates"],
  },
};

const STOP_WORDS = new Set([
  "how", "does", "do", "what", "is", "are", "where", "should", "i", "a", "the",
  "my", "this", "in", "to", "for", "of", "and", "or", "about", "tell", "me",
  "show", "find", "get", "can", "work", "works", "use", "used", "using",
]);

interface QueryResult {
  matchedTopics: string[];
  findings: Finding[];
  structureInfo: Record<string, string>;
  extraContext: Record<string, unknown>;
  confidence: "high" | "medium" | "low";
}

function matchQuery(query: string, scan: ProjectScan): QueryResult {
  const normalized = query.toLowerCase();

  // Phase 1: Topic scoring
  const topicScores: { topic: string; score: number }[] = [];
  for (const [topic, def] of Object.entries(TOPICS)) {
    let score = 0;
    for (const kw of def.keywords) {
      // Word boundary match = +2, substring = +1
      if (new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(normalized)) {
        score += 2;
      } else if (normalized.includes(kw)) {
        score += 1;
      }
    }
    if (score > 0) {
      topicScores.push({ topic, score });
    }
  }
  topicScores.sort((a, b) => b.score - a.score);
  const matchedTopics = topicScores.map((t) => t.topic);

  // Phase 2: Finding collection
  let findings: Finding[];
  if (matchedTopics.length > 0) {
    const targetCategories = new Set<string>();
    for (const topic of matchedTopics) {
      for (const cat of TOPICS[topic].categories) {
        targetCategories.add(cat);
      }
    }

    // Collect all topic keywords for Dominant patterns filtering
    const allKeywords = matchedTopics.flatMap((t) => TOPICS[t].keywords);

    findings = scan.findings.filter((f) => {
      if (!targetCategories.has(f.category)) return false;
      // For "Dominant patterns" (catch-all), require description to match a topic keyword
      if (f.category === "Dominant patterns") {
        const desc = f.description.toLowerCase();
        return allKeywords.some((kw) => desc.includes(kw));
      }
      return true;
    });
  } else {
    // Phase 3: Fallback — keyword search across all findings
    const queryWords = normalized.split(/\s+/).filter((w) => !STOP_WORDS.has(w) && w.length > 2);
    findings = scan.findings.filter((f) => {
      const searchable = `${f.category} ${f.description} ${f.rationale || ""} ${f.evidence || ""}`.toLowerCase();
      return queryWords.some((w) => searchable.includes(w));
    });
  }

  // Deduplicate by description
  const seen = new Set<string>();
  findings = findings.filter((f) => {
    if (seen.has(f.description)) return false;
    seen.add(f.description);
    return true;
  });

  // Sort by confidence
  const confidenceOrder = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => confidenceOrder[a.confidence] - confidenceOrder[b.confidence]);

  // Phase 4: Structure matching
  const structureInfo: Record<string, string> = {};
  const structureKeys = matchedTopics.flatMap((t) => TOPICS[t].structureKeys || []);
  if (structureKeys.length > 0) {
    for (const [dir, purpose] of Object.entries(scan.structure.directories)) {
      if (structureKeys.some((sk) => dir.toLowerCase().includes(sk))) {
        structureInfo[dir] = purpose;
      }
    }
  }

  // Phase 5: Extra context
  const extraContext: Record<string, unknown> = {};
  for (const topic of matchedTopics) {
    const fn = TOPICS[topic].extraContext;
    if (fn) {
      const ctx = fn(scan);
      if (ctx) Object.assign(extraContext, ctx);
    }
  }

  // Compute overall confidence
  let confidence: "high" | "medium" | "low";
  if (matchedTopics.length > 0 && findings.length >= 2) confidence = "high";
  else if (findings.length > 0) confidence = "medium";
  else confidence = "low";

  return { matchedTopics, findings, structureInfo, extraContext, confidence };
}

function renderResult(question: string, result: QueryResult): void {
  console.log(chalk.bold("\nsourcebook ask"));
  console.log(chalk.dim(`"${question}"\n`));

  if (result.matchedTopics.length > 0) {
    console.log(chalk.dim(`  Topics: ${result.matchedTopics.join(", ")}\n`));
  }

  if (result.findings.length === 0 && Object.keys(result.extraContext).length === 0) {
    console.log(chalk.yellow("  No findings matched your query.\n"));
    console.log(chalk.dim("  Available topics: " + Object.keys(TOPICS).join(", ")));
    console.log(chalk.dim("  Try: sourcebook ask \"auth\" or sourcebook ask \"what's fragile?\"\n"));
    return;
  }

  // Group findings by category
  const grouped = new Map<string, Finding[]>();
  for (const f of result.findings) {
    const existing = grouped.get(f.category) || [];
    existing.push(f);
    grouped.set(f.category, existing);
  }

  for (const [category, findings] of grouped) {
    for (const f of findings) {
      const icon =
        f.confidence === "high"
          ? chalk.green("●")
          : f.confidence === "medium"
            ? chalk.yellow("●")
            : chalk.dim("●");
      console.log(`  ${icon} ${f.description}`);
      if (f.evidence) {
        console.log(chalk.dim(`    evidence: ${f.evidence}`));
      }
    }
  }

  // Structure info
  if (Object.keys(result.structureInfo).length > 0) {
    console.log(chalk.dim("\n  Related directories:"));
    for (const [dir, purpose] of Object.entries(result.structureInfo)) {
      console.log(chalk.dim(`    ${chalk.cyan(dir + "/")} — ${purpose}`));
    }
  }

  // Extra context
  if (result.extraContext.commands) {
    const cmds = result.extraContext.commands as Record<string, string>;
    console.log(chalk.dim("\n  Commands:"));
    for (const [name, cmd] of Object.entries(cmds)) {
      console.log(chalk.dim(`    ${name}: `) + cmd);
    }
  }
  if (result.extraContext.testCommand) {
    console.log(chalk.dim("\n  Test command: ") + result.extraContext.testCommand);
  }
  if (result.extraContext.highImpactFiles) {
    const files = result.extraContext.highImpactFiles as string[];
    console.log(chalk.dim("\n  Highest impact files:"));
    for (const f of files) {
      console.log(chalk.dim(`    ${chalk.cyan(f)}`));
    }
  }
  if (result.extraContext.layout) {
    console.log(chalk.dim(`\n  Layout: ${result.extraContext.layout}`));
  }
  if (result.extraContext.entryPoints) {
    const eps = result.extraContext.entryPoints as string[];
    if (eps.length > 0) {
      console.log(chalk.dim(`  Entry points: ${eps.join(", ")}`));
    }
  }
  if (result.extraContext.directories && !Object.keys(result.structureInfo).length) {
    const dirs = result.extraContext.directories as Record<string, string>;
    if (Object.keys(dirs).length > 0) {
      console.log(chalk.dim("\n  Directories:"));
      for (const [dir, purpose] of Object.entries(dirs)) {
        console.log(chalk.dim(`    ${chalk.cyan(dir + "/")} — ${purpose}`));
      }
    }
  }

  console.log(
    chalk.dim(`\n  ${result.findings.length} finding${result.findings.length !== 1 ? "s" : ""} (confidence: ${result.confidence})\n`)
  );
}

export async function ask(question: string, options: AskOptions) {
  const targetDir = path.resolve(options.dir);

  const scan = await scanProject(targetDir);
  const result = matchQuery(question, scan);

  if (options.json) {
    console.log(JSON.stringify({
      question,
      ...result,
      findings: result.findings.map((f) => ({
        category: f.category,
        description: f.description,
        evidence: f.evidence,
        confidence: f.confidence,
        evidenceFiles: f.evidenceFiles,
      })),
    }, null, 2));
    return;
  }

  renderResult(question, result);
}
