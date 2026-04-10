/**
 * Format sourcebook analysis results as a GitHub PR comment.
 */
function formatComment(analysis, duration) {
  const { fileAnalysis, missedCouplings, conventions } = analysis;
  const lines = ["<!-- sourcebook-pr-check -->", "## sourcebook", ""];

  // Blast radius table
  if (fileAnalysis.length > 0) {
    lines.push("### Blast Radius");
    lines.push("");
    lines.push("| File | Importance | Dependents | Risk |");
    lines.push("|------|-----------|-----------|------|");

    for (const f of fileAnalysis) {
      const importance = f.isHub
        ? `**#${f.rank}** (hub)`
        : f.rank
          ? `#${f.rank}`
          : "—";
      const risk = f.isHub
        ? "**High**"
        : f.dependents > 5
          ? "Medium"
          : "Low";
      lines.push(
        `| \`${f.file}\` | ${importance} | ${f.dependents} files | ${risk} |`
      );
    }
    lines.push("");
  }

  // Warnings section
  const warnings = [];

  for (const f of fileAnalysis) {
    if (f.isHub) {
      warnings.push(
        `**\`${f.file}\`** is a hub file (imported by ${f.dependents} modules). Changes here have wide blast radius.`
      );
    }
    if (f.isFragile) {
      warnings.push(
        `**\`${f.file}\`** has high recent churn (fragile code flag).`
      );
    }
    for (const ap of f.antiPatterns) {
      warnings.push(
        `**\`${f.file}\`** — ${ap.description}`
      );
    }
  }

  // Missed co-change couplings
  for (const mc of missedCouplings) {
    const inPR = mc.inPR.map((f) => `\`${f}\``).join(", ");
    const missing = mc.missing.map((f) => `\`${f}\``).join(", ");
    warnings.push(
      `${inPR} and ${missing} have co-change coupling — **${missing} not in this PR**.`
    );
  }

  if (warnings.length > 0) {
    lines.push("### Warnings");
    lines.push("");
    for (const w of warnings) {
      lines.push(`- ${w}`);
    }
    lines.push("");
  }

  // Conventions (keep brief)
  if (conventions.length > 0 && conventions.length <= 5) {
    lines.push("### Conventions");
    lines.push("");
    for (const c of conventions.slice(0, 3)) {
      lines.push(`- ${c.description}`);
    }
    lines.push("");
  }

  // If nothing to report
  if (fileAnalysis.length === 0 && missedCouplings.length === 0) {
    lines.push("No high-impact files detected in this PR. All clear.");
    lines.push("");
  }

  // Footer
  lines.push("---");
  const durationStr = duration ? ` in ${(duration / 1000).toFixed(1)}s` : "";
  lines.push(
    `*[sourcebook](https://sourcebook.run)${durationStr}*`
  );

  return lines.join("\n");
}

module.exports = { formatComment };
