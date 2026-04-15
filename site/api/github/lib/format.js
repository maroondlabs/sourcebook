/**
 * Format sourcebook check results as a GitHub PR comment.
 *
 * Comment structure:
 *   1. Incomplete change detection (Layer A — rules-based)
 *   2. AI completeness check (Layer B — only if ANTHROPIC_API_KEY set)
 *   3. Blast radius (collapsed details)
 *   4. Footer with timing + cost
 */
function formatComment(analysis, duration) {
  const {
    warnings = [],
    aiSuggestions = [],
    tokenUsage,
    blastRadius = [],
    checkFailed,
    aiRequested,
  } = analysis;

  const lines = ["<!-- sourcebook-pr-check -->", "## sourcebook"];

  if (checkFailed) {
    lines.push("");
    lines.push("> Diff analysis hit an error — falling back to blast-radius only.");
  }

  // ── Section 1: Layer A — incomplete change detection ───────────────────
  if (warnings.length > 0) {
    lines.push("");
    lines.push("### Likely missing from this PR");
    lines.push("");
    lines.push("| Confidence | File | Why |");
    lines.push("|------------|------|-----|");
    for (const w of warnings.slice(0, 12)) {
      const conf = w.confidence === "high"
        ? "🔴 High"
        : w.confidence === "medium"
          ? "🟡 Medium"
          : "⚪ Low";
      lines.push(`| ${conf} | \`${w.file}\` | ${escapePipes(w.reasoning)} |`);
    }
    if (warnings.length > 12) {
      lines.push("");
      lines.push(`<sub>+${warnings.length - 12} more — run \`npx sourcebook check\` locally.</sub>`);
    }
  }

  // ── Section 2: Layer B — AI completeness check ─────────────────────────
  if (aiRequested && aiSuggestions.length > 0) {
    lines.push("");
    lines.push("### AI completeness check");
    lines.push("");
    for (const s of aiSuggestions.slice(0, 8)) {
      const dot = s.confidence === "high" ? "🔴" : s.confidence === "medium" ? "🟡" : "⚪";
      // AI output is untrusted — strip backticks, HTML tags, and leading markdown markers
      // to prevent layout disruption if a PR prompt-injects the model.
      lines.push(`- ${dot} **\`${sanitizeInline(s.file)}\`** — ${sanitizeInline(s.reasoning)}`);
    }
  }

  // ── Section 3: Blast radius (collapsed) ────────────────────────────────
  if (blastRadius.length > 0) {
    lines.push("");
    lines.push("<details>");
    lines.push("<summary>📊 Blast radius — high-impact files in this PR</summary>");
    lines.push("");
    lines.push("| File | Rank | Dependents |");
    lines.push("|------|------|-----------|");
    for (const b of blastRadius.slice(0, 10)) {
      const rank = b.isHub ? `**#${b.rank}** (hub)` : b.rank ? `#${b.rank}` : "—";
      lines.push(`| \`${b.file}\` | ${rank} | ${b.dependents} files |`);
    }
    lines.push("</details>");
  }

  // ── Empty state ────────────────────────────────────────────────────────
  if (warnings.length === 0 && aiSuggestions.length === 0 && blastRadius.length === 0 && !checkFailed) {
    lines.push("");
    lines.push("✅ No incomplete changes detected. No high-impact files touched.");
  } else if (warnings.length === 0 && aiSuggestions.length === 0) {
    // Findings exist only in blast radius
    lines.push("");
    lines.push("✅ No incomplete changes detected.");
  }

  // ── Footer ─────────────────────────────────────────────────────────────
  lines.push("");
  lines.push("---");
  const bits = [];
  if (duration) bits.push(`${(duration / 1000).toFixed(1)}s`);
  if (tokenUsage) {
    // claude-sonnet-4-5: $3/MTok in, $15/MTok out
    const cost = (tokenUsage.input * 3 + tokenUsage.output * 15) / 1_000_000;
    bits.push(`AI: ${tokenUsage.input.toLocaleString()}/${tokenUsage.output.toLocaleString()} tok (~$${cost.toFixed(4)})`);
  }
  if (aiRequested && aiSuggestions.length === 0 && !checkFailed) {
    bits.push("AI found nothing to flag");
  }
  if (!aiRequested) {
    bits.push("Layer A only");
  }
  const meta = bits.length ? ` · ${bits.join(" · ")}` : "";
  lines.push(`*[sourcebook](https://sourcebook.run)${meta}*`);

  return lines.join("\n");
}

function escapePipes(s) {
  return String(s).replace(/\|/g, "\\|");
}

/**
 * Sanitize untrusted (LLM-generated) text for inline markdown use.
 * Strips HTML tags, backticks that would close a code span, and markdown
 * structure characters at line start. Keeps text readable.
 */
function sanitizeInline(s) {
  return String(s)
    .replace(/<[^>]*>/g, "")        // strip HTML tags
    .replace(/`+/g, "'")            // backticks → apostrophes (prevent code-span escape)
    .replace(/\r?\n/g, " ")         // flatten newlines (prevents heading/list injection)
    .replace(/\|/g, "\\|")          // escape table pipes
    .trim()
    .slice(0, 300);                  // hard cap per suggestion
}

module.exports = { formatComment };
