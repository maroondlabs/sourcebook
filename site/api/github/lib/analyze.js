/**
 * Run sourcebook analysis on a cloned repo, then filter results
 * to only the files changed in the PR.
 */
async function analyzeChangedFiles(repoDir, changedFiles) {
  const { scanProject } = await import("sourcebook/dist/scanner/index.js");
  const scan = await scanProject(repoDir);

  // Build lookup maps from scan data
  const rankedMap = new Map();
  if (scan.rankedFiles) {
    scan.rankedFiles.forEach((f, i) => {
      rankedMap.set(f.file, { rank: i + 1, score: f.score });
    });
  }

  // Count dependents for each file from import edges
  const dependentCount = new Map();
  const dependentFiles = new Map();
  if (scan.edges) {
    for (const edge of scan.edges) {
      const count = dependentCount.get(edge.to) || 0;
      dependentCount.set(edge.to, count + 1);
      const files = dependentFiles.get(edge.to) || [];
      files.push(edge.from);
      dependentFiles.set(edge.to, files);
    }
  }

  // Extract co-change coupling from findings
  const couplingFindings = scan.findings.filter(
    (f) =>
      f.category === "Hidden dependencies" && f.confidence === "high" && !f.discoverable
  );

  // Extract fragile file findings
  const fragileFindings = scan.findings.filter(
    (f) =>
      f.category === "Fragile code" && f.confidence !== "low" && !f.discoverable
  );

  // Extract anti-pattern / revert findings
  const antiPatternFindings = scan.findings.filter(
    (f) =>
      (f.category === "Anti-patterns" || f.category === "Git history") &&
      f.confidence === "high" &&
      !f.discoverable
  );

  // Convention findings
  const conventionFindings = scan.findings.filter(
    (f) =>
      f.category.includes("convention") ||
      f.category.includes("Convention") ||
      f.category === "Import conventions" ||
      f.category === "Error handling" ||
      f.category === "Commit conventions"
  );

  // Analyze each changed file
  const fileAnalysis = [];
  for (const file of changedFiles) {
    const ranking = rankedMap.get(file);
    const deps = dependentCount.get(file) || 0;
    const isHub = ranking && ranking.rank <= 5;

    // Find co-change partners for this file
    const coupledPartners = [];
    for (const finding of couplingFindings) {
      if (finding.evidence && finding.evidence.includes(file)) {
        coupledPartners.push(finding);
      }
      if (
        finding.evidenceFiles &&
        finding.evidenceFiles.includes(file)
      ) {
        coupledPartners.push(finding);
      }
    }

    // Check if file is fragile
    const isFragile = fragileFindings.some(
      (f) =>
        (f.evidence && f.evidence.includes(file)) ||
        (f.evidenceFiles && f.evidenceFiles.includes(file))
    );

    // Check for anti-patterns related to this file
    const relatedAntiPatterns = antiPatternFindings.filter(
      (f) =>
        (f.evidence && f.evidence.includes(file)) ||
        (f.evidenceFiles && f.evidenceFiles.includes(file))
    );

    // Only include files that have something worth reporting
    if (isHub || deps > 3 || coupledPartners.length > 0 || isFragile || relatedAntiPatterns.length > 0) {
      fileAnalysis.push({
        file,
        rank: ranking ? ranking.rank : null,
        dependents: deps,
        isHub,
        isFragile,
        coupledPartners,
        antiPatterns: relatedAntiPatterns,
      });
    }
  }

  // Find co-change partners that are NOT in the changed files set
  const changedSet = new Set(changedFiles);
  const missedCouplings = [];
  for (const finding of couplingFindings) {
    if (!finding.evidenceFiles || finding.evidenceFiles.length < 2) continue;
    const inPR = finding.evidenceFiles.filter((f) => changedSet.has(f));
    const notInPR = finding.evidenceFiles.filter((f) => !changedSet.has(f));
    if (inPR.length > 0 && notInPR.length > 0) {
      missedCouplings.push({
        inPR,
        missing: notInPR,
        description: finding.description,
      });
    }
  }

  return {
    fileAnalysis,
    missedCouplings,
    conventions: conventionFindings.filter((f) => !f.discoverable),
    totalFiles: scan.files.length,
    repoMode: scan.repoMode,
  };
}

module.exports = { analyzeChangedFiles };
