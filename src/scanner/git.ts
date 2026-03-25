import { execSync } from "node:child_process";
import path from "node:path";
import type { Finding } from "../types.js";

interface GitAnalysis {
  findings: Finding[];
  activeAreas: string[];
  revertedPatterns: string[];
  coChangeClusters: [string, string, number][];
}

/**
 * Mine git history for non-obvious context:
 * - Reverted commits (literal "don't do this" signals)
 * - Co-change coupling (invisible dependencies)
 * - Recently active areas
 * - Commit message patterns (module structure)
 * - Rapid re-edits (code that was hard to get right)
 */
export async function analyzeGitHistory(dir: string): Promise<GitAnalysis> {
  const findings: Finding[] = [];
  const activeAreas: string[] = [];
  const revertedPatterns: string[] = [];
  const coChangeClusters: [string, string, number][] = [];

  // Check if this is a git repo
  if (!isGitRepo(dir)) {
    return { findings, activeAreas, revertedPatterns, coChangeClusters };
  }

  // 1. Reverted commits -- "don't do this" signals
  findings.push(...detectRevertedPatterns(dir, revertedPatterns));

  // 2. Recently active areas
  findings.push(...detectActiveAreas(dir, activeAreas));

  // 3. Co-change coupling -- invisible dependencies
  findings.push(...detectCoChangeCoupling(dir, coChangeClusters));

  // 4. Rapid re-edits -- code that was hard to get right
  findings.push(...detectRapidReEdits(dir));

  // 5. Commit message patterns -- development focus
  findings.push(...detectCommitPatterns(dir));

  return { findings, activeAreas, revertedPatterns, coChangeClusters };
}

function isGitRepo(dir: string): boolean {
  try {
    execSync("git rev-parse --is-inside-work-tree", {
      cwd: dir,
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

function git(dir: string, args: string): string {
  try {
    return execSync(`git ${args}`, {
      cwd: dir,
      stdio: "pipe",
      maxBuffer: 10 * 1024 * 1024,
    }).toString();
  } catch {
    return "";
  }
}

/**
 * Find reverted commits -- these are explicit "we tried this and it didn't work" signals.
 */
function detectRevertedPatterns(
  dir: string,
  revertedPatterns: string[]
): Finding[] {
  const findings: Finding[] = [];

  const revertLog = git(
    dir,
    'log --grep="^Revert" --oneline --since="1 year ago" -50'
  );

  if (!revertLog.trim()) return findings;

  const reverts = revertLog.trim().split("\n").filter(Boolean);

  if (reverts.length >= 2) {
    // Extract what was reverted
    const revertDescriptions: string[] = [];
    for (const line of reverts.slice(0, 10)) {
      const match = line.match(/^[a-f0-9]+ Revert "(.+)"/);
      if (match) {
        revertDescriptions.push(match[1]);
        revertedPatterns.push(match[1]);
      }
    }

    if (revertDescriptions.length > 0) {
      findings.push({
        category: "Git history",
        description: `${reverts.length} reverted commits in the last year. Previously attempted and rolled back: ${revertDescriptions.slice(0, 3).join("; ")}${revertDescriptions.length > 3 ? "; ..." : ""}`,
        rationale:
          "Reverted commits are explicit signals of approaches that were tried and failed. Agents should avoid re-attempting these patterns.",
        confidence: "high",
        discoverable: false,
      });
    }
  }

  return findings;
}

/**
 * Find recently active areas -- where development is concentrated.
 */
function detectActiveAreas(
  dir: string,
  activeAreas: string[]
): Finding[] {
  const findings: Finding[] = [];

  // Get files changed in the last 30 days, count changes per directory
  const recentChanges = git(
    dir,
    'log --since="30 days ago" --name-only --pretty=format: --diff-filter=AMRC'
  );

  if (!recentChanges.trim()) return findings;

  const dirCounts = new Map<string, number>();
  for (const file of recentChanges.trim().split("\n").filter(Boolean)) {
    const dir = path.dirname(file);
    const topDir = dir.split(path.sep)[0] || dir;
    if (topDir === "." || topDir === "node_modules") continue;
    dirCounts.set(topDir, (dirCounts.get(topDir) || 0) + 1);
  }

  // Sort by activity
  const sorted = [...dirCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (sorted.length >= 2) {
    const topAreas = sorted
      .filter(([, count]) => count >= 3)
      .map(([dir, count]) => `${dir}/ (${count} changes)`);

    if (topAreas.length > 0) {
      activeAreas.push(...sorted.map(([dir]) => dir));
      findings.push({
        category: "Active development",
        description: `Most active areas in the last 30 days: ${topAreas.join(", ")}. Expect ongoing changes here.`,
        rationale:
          "Active areas may have in-progress refactoring. Check recent commits before making large changes.",
        confidence: "medium",
        discoverable: false,
      });
    }
  }

  return findings;
}

/**
 * Detect co-change coupling -- files that are always committed together
 * but have no import relationship. These are invisible dependencies.
 */
function detectCoChangeCoupling(
  dir: string,
  clusters: [string, string, number][]
): Finding[] {
  const findings: Finding[] = [];

  // Get the last 200 commits with their changed files
  const log = git(
    dir,
    'log --name-only --pretty=format:"COMMIT" --since="6 months ago" -200'
  );

  if (!log.trim()) return findings;

  // Parse commits into file groups
  const commits: string[][] = [];
  let current: string[] = [];

  for (const line of log.split("\n")) {
    if (line.trim() === '"COMMIT"' || line.trim() === "COMMIT") {
      if (current.length > 0) commits.push(current);
      current = [];
    } else if (line.trim() && !line.includes("node_modules")) {
      current.push(line.trim());
    }
  }
  if (current.length > 0) commits.push(current);

  // Build co-occurrence matrix (only for source files)
  const sourceExts = new Set([
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".py",
    ".go",
    ".rs",
  ]);
  const pairCounts = new Map<string, number>();
  const fileCounts = new Map<string, number>();

  for (const commit of commits) {
    const sourceFiles = commit.filter((f) =>
      sourceExts.has(path.extname(f).toLowerCase())
    );

    // Skip mega-commits (likely merges or bulk changes)
    if (sourceFiles.length > 20 || sourceFiles.length < 2) continue;

    for (const file of sourceFiles) {
      fileCounts.set(file, (fileCounts.get(file) || 0) + 1);
    }

    // Count pairs
    for (let i = 0; i < sourceFiles.length; i++) {
      for (let j = i + 1; j < sourceFiles.length; j++) {
        const pair = [sourceFiles[i], sourceFiles[j]].sort().join("|||");
        pairCounts.set(pair, (pairCounts.get(pair) || 0) + 1);
      }
    }
  }

  // Find statistically significant co-changes
  // (files committed together more than expected by chance)
  const significantPairs: { files: [string, string]; count: number; strength: number }[] = [];

  for (const [pairKey, count] of pairCounts) {
    if (count < 4) continue; // Need at least 4 co-occurrences

    const [fileA, fileB] = pairKey.split("|||");
    const countA = fileCounts.get(fileA) || 0;
    const countB = fileCounts.get(fileB) || 0;

    // Skip files in the same directory (obvious coupling)
    if (path.dirname(fileA) === path.dirname(fileB)) continue;

    // Jaccard-like strength: co-changes / union of changes
    const strength = count / (countA + countB - count);

    if (strength > 0.3) {
      significantPairs.push({
        files: [fileA, fileB],
        count,
        strength,
      });
    }
  }

  // Sort by strength
  significantPairs.sort((a, b) => b.strength - a.strength);

  if (significantPairs.length > 0) {
    const topPairs = significantPairs.slice(0, 5);
    for (const pair of topPairs) {
      clusters.push([pair.files[0], pair.files[1], pair.count]);
    }

    const pairDescriptions = topPairs
      .slice(0, 3)
      .map(
        (p) =>
          `${path.basename(p.files[0])} ↔ ${path.basename(p.files[1])} (${p.count} co-commits)`
      );

    findings.push({
      category: "Hidden dependencies",
      description: `Files that change together across directories (invisible coupling): ${pairDescriptions.join("; ")}`,
      rationale:
        "These files have no import relationship but are always modified together. Changing one without the other likely introduces bugs.",
      confidence: "high",
      discoverable: false,
    });
  }

  return findings;
}

/**
 * Detect files that were edited many times in quick succession --
 * code that was hard to get right.
 */
function detectRapidReEdits(dir: string): Finding[] {
  const findings: Finding[] = [];

  // Get files with high commit frequency in short windows
  const log = git(
    dir,
    'log --format="%H %aI" --name-only --since="3 months ago" -300'
  );

  if (!log.trim()) return findings;

  // Track edits per file with timestamps
  const fileEdits = new Map<string, Date[]>();
  let currentDate: Date | null = null;

  for (const line of log.split("\n")) {
    const commitMatch = line.match(/^[a-f0-9]{40} (\d{4}-\d{2}-\d{2})/);
    if (commitMatch) {
      currentDate = new Date(commitMatch[1]);
    } else if (line.trim() && currentDate && !line.includes("node_modules")) {
      const file = line.trim();
      if (!fileEdits.has(file)) fileEdits.set(file, []);
      fileEdits.get(file)!.push(currentDate);
    }
  }

  // Find files edited 5+ times within a 7-day window
  const churnyFiles: { file: string; edits: number; window: string }[] = [];

  for (const [file, dates] of fileEdits) {
    if (dates.length < 5) continue;

    // Sort dates
    dates.sort((a, b) => a.getTime() - b.getTime());

    // Sliding window: find any 7-day window with 5+ edits
    for (let i = 0; i <= dates.length - 5; i++) {
      const windowStart = dates[i];
      const windowEnd = new Date(windowStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      const editsInWindow = dates.filter(
        (d) => d >= windowStart && d <= windowEnd
      ).length;

      if (editsInWindow >= 5) {
        churnyFiles.push({
          file,
          edits: editsInWindow,
          window: `${windowStart.toISOString().split("T")[0]}`,
        });
        break; // One detection per file is enough
      }
    }
  }

  // Sort by edit count
  churnyFiles.sort((a, b) => b.edits - a.edits);

  if (churnyFiles.length > 0) {
    const topFiles = churnyFiles
      .slice(0, 3)
      .map((f) => `${f.file} (${f.edits} edits in one week)`);

    findings.push({
      category: "Fragile code",
      description: `Files that required many rapid edits (hard to get right): ${topFiles.join("; ")}`,
      rationale:
        "High churn in short windows indicates tricky logic. Take extra care when modifying these files.",
      confidence: "medium",
      discoverable: false,
    });
  }

  return findings;
}

/**
 * Detect commit message patterns -- reveals development focus and conventions.
 */
function detectCommitPatterns(dir: string): Finding[] {
  const findings: Finding[] = [];

  const log = git(dir, 'log --oneline --since="6 months ago" -200');
  if (!log.trim()) return findings;

  const messages = log.trim().split("\n").filter(Boolean);

  // Detect conventional commits usage
  const conventionalPattern =
    /^[a-f0-9]+ (feat|fix|docs|refactor|test|chore|style|perf|ci|build)(\(.+?\))?[!:]?\s*:/;
  const conventionalCount = messages.filter((m) =>
    conventionalPattern.test(m)
  ).length;

  if (conventionalCount > messages.length * 0.5) {
    // Extract scope patterns
    const scopes = new Map<string, number>();
    for (const msg of messages) {
      const match = msg.match(conventionalPattern);
      if (match?.[2]) {
        const scope = match[2].replace(/[()]/g, "");
        scopes.set(scope, (scopes.get(scope) || 0) + 1);
      }
    }

    const topScopes = [...scopes.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([scope]) => scope);

    findings.push({
      category: "Commit conventions",
      description: `Uses Conventional Commits (feat/fix/docs/etc). ${topScopes.length > 0 ? `Common scopes: ${topScopes.join(", ")}` : ""}. Follow this pattern for new commits.`,
      confidence: "high",
      discoverable: false,
    });
  }

  return findings;
}
