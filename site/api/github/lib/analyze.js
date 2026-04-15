/**
 * Run sourcebook check + scan on a cloned repo.
 *
 * Uses the public `checkChanges()` API from sourcebook 0.14+.
 * Layer A is always run (rules-based, sub-second, no API key needed).
 * Layer B (AI completeness check) is gated on ANTHROPIC_API_KEY presence.
 *
 * Blast radius is computed separately so we can show it as a secondary
 * section (file rank + dependent count) even when there are no findings.
 */
async function analyzePR(repoDir, prFiles) {
  const { checkChanges } = await import("sourcebook/dist/commands/check.js");

  const changedPaths = prFiles.map((f) => f.filename);

  // Build a path → patch map so checkChanges can use real PR diffs
  // for Layer B (AI) hunk extraction instead of running git diff.
  const patchMap = new Map();
  for (const f of prFiles) {
    if (f.patch) patchMap.set(f.filename, f.patch);
  }
  const diffSource = (file) => patchMap.get(file) || "";

  const wantsAI = !!process.env.ANTHROPIC_API_KEY;

  let result;
  try {
    result = await checkChanges({
      dir: repoDir,
      modifiedFiles: changedPaths,
      diffSource,
      ai: wantsAI,
    });
  } catch (err) {
    // If check itself blows up, still try a bare scan so we can show blast radius
    console.error("[sourcebook] checkChanges failed:", err.message);
    const { scanProject } = await import("sourcebook/dist/scanner/index.js");
    const scan = await scanProject(repoDir);
    return {
      modifiedFiles: changedPaths,
      warnings: [],
      aiSuggestions: [],
      tokenUsage: undefined,
      blastRadius: computeBlastRadius(scan, changedPaths),
      checkFailed: true,
      aiRequested: wantsAI,
    };
  }

  return {
    modifiedFiles: result.modifiedFiles,
    warnings: result.warnings,
    aiSuggestions: result.aiSuggestions,
    tokenUsage: result.tokenUsage,
    blastRadius: result.scan ? computeBlastRadius(result.scan, changedPaths) : [],
    checkFailed: false,
    aiRequested: wantsAI,
  };
}

/**
 * Per-file rank + dependent count for changed files.
 * Returns only files that are notable (ranked top-5 or >3 dependents).
 */
function computeBlastRadius(scan, changedFiles) {
  const rankedMap = new Map();
  if (scan.rankedFiles) {
    scan.rankedFiles.forEach((f, i) => {
      rankedMap.set(f.file, { rank: i + 1, score: f.score });
    });
  }

  const dependentCount = new Map();
  if (scan.edges) {
    for (const edge of scan.edges) {
      dependentCount.set(edge.to, (dependentCount.get(edge.to) || 0) + 1);
    }
  }

  const out = [];
  for (const file of changedFiles) {
    const ranking = rankedMap.get(file);
    const deps = dependentCount.get(file) || 0;
    const isHub = ranking && ranking.rank <= 5;
    if (isHub || deps > 3) {
      out.push({
        file,
        rank: ranking ? ranking.rank : null,
        dependents: deps,
        isHub,
      });
    }
  }
  out.sort((a, b) => {
    if (a.isHub !== b.isHub) return a.isHub ? -1 : 1;
    return b.dependents - a.dependents;
  });
  return out;
}

module.exports = { analyzePR };
