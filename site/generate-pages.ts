/**
 * Programmatic SEO page generator for sourcebook.run/for/[repo]
 *
 * Clones repos, runs sourcebook analysis, extracts top insights,
 * and generates static HTML pages matching the site's design.
 *
 * Usage: npx tsx site/generate-pages.ts
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { scanProject } from "../src/scanner/index.js";
import { generateClaude } from "../src/generators/claude.js";
import { buildQuickReference } from "../src/generators/shared.js";
import type { ProjectScan, Finding } from "../src/types.js";

interface RepoConfig {
  slug: string;
  name: string;
  repo: string;
  description: string;
  language: string;
  related: string[];
}

const SITE_DIR = path.resolve(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname));
const REPOS: RepoConfig[] = JSON.parse(fs.readFileSync(path.join(SITE_DIR, "repos.json"), "utf-8"));
const TMP_DIR = "/tmp/sourcebook-seo";

/**
 * Extract the most interesting/surprising insights from findings.
 */
function extractTopInsights(scan: ProjectScan): string[] {
  const insights: string[] = [];

  for (const f of scan.findings) {
    // Critical constraints are always interesting
    if (f.category === "Critical constraints") {
      if (f.description.includes("Generated files")) {
        insights.push("Generated files detected — editing them directly will break builds");
      } else {
        insights.push(f.description.split(".")[0]);
      }
    }

    // TypeScript strict mode OFF is surprising
    if (f.description.includes("Strict mode is OFF")) {
      insights.push("TypeScript strict mode is OFF — agents shouldn't add strict type annotations");
    }

    // Hub files with high fan-in
    if (f.category === "Core modules" && f.description.includes("imported by")) {
      const match = f.description.match(/(\S+)\s+\(imported by (\d+) files\)/);
      if (match) {
        insights.push(`${match[1]} is a hub file (imported by ${match[2]} files) — changes here ripple everywhere`);
      }
    }

    // Circular dependencies
    if (f.category === "Circular dependencies") {
      insights.push("Circular import chains detected — avoid adding to these cycles");
    }

    // Framework-specific routing
    if (f.category === "Dominant patterns" && f.description.includes("API endpoints use") && f.confidence !== "low") {
      const routeMatch = f.description.match(/API endpoints use (.+?)\./);
      if (routeMatch) {
        insights.push(`Uses ${routeMatch[1]} for routing — follow this pattern, don't add REST routes directly`);
      }
    }

    // Monorepo
    if (f.description.includes("monorepo")) {
      insights.push("This is a monorepo — check workspace dependencies before modifying shared code");
    }
  }

  // Deduplicate and take top 4
  const seen = new Set<string>();
  return insights.filter((i) => {
    if (seen.has(i)) return false;
    seen.add(i);
    return true;
  }).slice(0, 4);
}

/**
 * Generate "how to use this with AI tools" guidance from findings.
 */
function generateAIGuidance(scan: ProjectScan): string[] {
  const guidance: string[] = [];

  const hasRouting = scan.findings.some((f) => f.description.includes("API endpoints") && f.confidence !== "low");
  const hasGenFiles = scan.findings.some((f) => f.description.includes("Generated files"));
  const hasHubs = scan.rankedFiles && scan.rankedFiles.length > 0;
  const hasConventions = scan.findings.some((f) => f.category === "Dominant patterns" && f.confidence !== "low");

  if (hasRouting) guidance.push("Don't guess routing patterns — check the detected routing conventions first");
  if (hasGenFiles) guidance.push("Avoid editing generated files directly — modify the source/schema instead");
  if (hasHubs) guidance.push("Check file importance before editing hub files — they affect many dependents");
  if (hasConventions) guidance.push("Follow existing patterns listed above instead of introducing new approaches");

  return guidance.slice(0, 4);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderFinding(f: Finding): string {
  const color = f.confidence === "high" ? "#22c55e" : f.confidence === "medium" ? "#eab308" : "#666";
  return `
    <div style="margin-bottom: 12px; padding-left: 16px; border-left: 2px solid ${color};">
      <p style="margin: 0; font-size: 14px;">${escapeHtml(f.description)}</p>
      ${f.evidence ? `<p style="margin: 4px 0 0 0; font-size: 12px; color: #888;">${escapeHtml(f.evidence)}</p>` : ""}
    </div>`;
}

function renderPage(repo: RepoConfig, scan: ProjectScan, claudeMd: string): string {
  const insights = extractTopInsights(scan);
  const guidance = generateAIGuidance(scan);
  const relatedRepos = REPOS.filter((r) => repo.related.includes(r.slug));

  // Group findings by category
  const highFindings = scan.findings.filter((f) => f.confidence === "high");
  const medFindings = scan.findings.filter((f) => f.confidence === "medium");

  // Quick reference items
  const qrLines: string[] = [];
  for (const f of scan.findings.filter((f) => f.category === "Dominant patterns" && f.confidence !== "low")) {
    const desc = f.description;
    let label = "";
    if (desc.includes("route") || desc.includes("endpoint") || desc.includes("API")) label = "Routing";
    else if (desc.includes("auth") || desc.includes("Auth")) label = "Auth";
    else if (desc.includes("Test") || desc.includes("test")) label = "Testing";
    else if (desc.includes("validation") || desc.includes("Zod") || desc.includes("Pydantic")) label = "Validation";
    else if (desc.includes("database") || desc.includes("Database") || desc.includes("Prisma") || desc.includes("ORM")) label = "Database";
    else if (desc.includes("Tailwind") || desc.includes("styled") || desc.includes("CSS")) label = "Styling";
    else if (desc.includes("i18n") || desc.includes("translation") || desc.includes("internationalization")) label = "i18n";
    else if (desc.includes("fetching") || desc.includes("Query") || desc.includes("SWR")) label = "Data Fetching";
    else continue;

    const short = desc.replace(/\. Follow this pattern.*$/, "").replace(/\. This is the project's standard.*$/, "");
    qrLines.push(`<span class="inline-block bg-gray-100 dark:bg-gray-800 text-sm px-3 py-1 rounded-full mr-2 mb-2"><strong>${label}:</strong> ${escapeHtml(short)}</span>`);
  }

  const metaInsights = insights.slice(0, 2).join(". ");
  const metaDesc = `How the ${repo.name} repo actually works: ${metaInsights}. Extracted from ${scan.files.length.toLocaleString()} files with sourcebook.`;

  return `<!DOCTYPE html>
<html class="light" lang="en">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>How ${repo.name} Works — Conventions, Patterns & Architecture | sourcebook</title>
<meta name="description" content="${escapeHtml(metaDesc)}"/>
<meta property="og:title" content="How ${repo.name} Works | sourcebook"/>
<meta property="og:description" content="${escapeHtml(metaDesc)}"/>
<meta property="og:type" content="article"/>
<meta property="og:url" content="https://sourcebook.run/for/${repo.slug}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="How ${repo.name} Works | sourcebook"/>
<meta name="twitter:description" content="${escapeHtml(metaDesc)}"/>
<link rel="canonical" href="https://sourcebook.run/for/${repo.slug}"/>
<meta name="robots" content="index, follow"/>
<meta name="theme-color" content="#000000"/>
<link rel="icon" type="image/png" href="/logo.png"/>
<meta property="og:image" content="https://sourcebook.run/og-image.png"/>
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet"/>
<style>
  body { font-family: 'Inter', sans-serif; background-color: #FFFFFF; color: #000000; }
  .font-mono-tech { font-family: 'Space Grotesk', monospace; }
  html.dark body { background-color: #000000; color: #FFFFFF; }
</style>
</head>
<body>

<!-- Nav -->
<nav class="border-b border-gray-200 dark:border-gray-800 py-4 px-6">
  <div class="max-w-4xl mx-auto flex justify-between items-center">
    <a href="/" class="font-mono-tech font-bold text-lg">sourcebook</a>
    <div class="flex gap-4 text-sm">
      <a href="/for/" class="text-gray-600 hover:text-black dark:text-gray-400 dark:hover:text-white">all repos</a>
      <a href="https://github.com/maroondlabs/sourcebook" class="text-gray-600 hover:text-black dark:text-gray-400 dark:hover:text-white">github</a>
    </div>
  </div>
</nav>

<main class="max-w-4xl mx-auto px-6 py-12">

  <!-- Hero -->
  <div class="mb-12">
    <p class="text-sm text-gray-500 mb-2 font-mono-tech">${repo.language} · ${scan.files.length.toLocaleString()} files · ${scan.findings.length} findings</p>
    <h1 class="text-3xl font-bold font-mono-tech mb-3">how ${repo.name.toLowerCase()} actually works</h1>
    <p class="text-gray-600 dark:text-gray-400">${escapeHtml(repo.description)}. Extracted by <a href="https://github.com/maroondlabs/sourcebook" class="underline">sourcebook</a> from the <a href="https://github.com/${repo.repo}" class="underline">${repo.repo}</a> repository.</p>
  </div>

  ${qrLines.length > 0 ? `
  <!-- Quick Reference -->
  <section class="mb-12">
    <h2 class="text-lg font-bold font-mono-tech mb-4">quick reference</h2>
    <div class="flex flex-wrap">${qrLines.join("\n")}</div>
  </section>` : ""}

  ${insights.length > 0 ? `
  <!-- What Matters -->
  <section class="mb-12">
    <h2 class="text-lg font-bold font-mono-tech mb-4">what matters</h2>
    <div class="bg-gray-50 dark:bg-gray-900 rounded-lg p-6">
      <ul class="space-y-3">
        ${insights.map((i) => `<li class="flex items-start gap-2"><span class="text-yellow-500 mt-0.5">→</span><span class="text-sm">${escapeHtml(i)}</span></li>`).join("\n")}
      </ul>
    </div>
  </section>` : ""}

  <!-- Key Findings -->
  <section class="mb-12">
    <h2 class="text-lg font-bold font-mono-tech mb-4">key findings</h2>
    ${highFindings.map(renderFinding).join("\n")}
    ${medFindings.length > 0 ? `
    <details class="mt-4">
      <summary class="text-sm text-gray-500 cursor-pointer hover:text-gray-700">+ ${medFindings.length} more finding${medFindings.length > 1 ? "s" : ""} (medium confidence)</summary>
      <div class="mt-4">${medFindings.map(renderFinding).join("\n")}</div>
    </details>` : ""}
  </section>

  ${guidance.length > 0 ? `
  <!-- AI Tools Guidance -->
  <section class="mb-12">
    <h2 class="text-lg font-bold font-mono-tech mb-4">using AI tools on this repo</h2>
    <div class="bg-black text-green-400 rounded-lg p-6 font-mono text-sm">
      <p class="text-gray-400 mb-3">before making changes, your agent should:</p>
      ${guidance.map((g) => `<p class="mb-1">→ ${escapeHtml(g)}</p>`).join("\n")}
    </div>
  </section>` : ""}

  <!-- Full CLAUDE.md -->
  <section class="mb-12">
    <h2 class="text-lg font-bold font-mono-tech mb-4">full CLAUDE.md</h2>
    <details>
      <summary class="text-sm text-gray-500 cursor-pointer hover:text-gray-700 mb-2">show generated CLAUDE.md</summary>
      <pre class="bg-gray-50 dark:bg-gray-900 rounded-lg p-6 text-xs overflow-x-auto whitespace-pre-wrap">${escapeHtml(claudeMd)}</pre>
    </details>
  </section>

  <!-- CTA -->
  <section class="mb-12 text-center py-8 border-t border-b border-gray-200 dark:border-gray-800">
    <p class="text-sm text-gray-500 mb-2">generated in ~3 seconds with</p>
    <code class="block text-lg font-mono-tech font-bold mb-4">npx sourcebook init</code>
    <p class="text-sm text-gray-500">generate this for your own repo. free, no API keys.</p>
    <a href="https://github.com/maroondlabs/sourcebook" class="inline-block mt-4 bg-black text-white dark:bg-white dark:text-black px-6 py-2 rounded-lg text-sm font-medium hover:opacity-80">view on github</a>
  </section>

  ${relatedRepos.length > 0 ? `
  <!-- Related Repos -->
  <section class="mb-12">
    <h2 class="text-lg font-bold font-mono-tech mb-4">similar repos</h2>
    <div class="flex flex-wrap gap-3">
      ${relatedRepos.map((r) => `<a href="/for/${r.slug}" class="bg-gray-100 dark:bg-gray-800 px-4 py-2 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-700">${r.name}</a>`).join("\n")}
    </div>
  </section>` : ""}

</main>

<!-- Footer -->
<footer class="border-t border-gray-200 dark:border-gray-800 py-6 px-6">
  <div class="max-w-4xl mx-auto flex justify-between items-center text-sm text-gray-500">
    <a href="/" class="font-mono-tech">sourcebook</a>
    <span>project knowledge for coding agents</span>
  </div>
</footer>

</body>
</html>`;
}

function renderIndex(): string {
  return `<!DOCTYPE html>
<html class="light" lang="en">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>How Open Source Repos Work — sourcebook</title>
<meta name="description" content="How popular open-source repos actually work — conventions, patterns, and architecture extracted by sourcebook. Browse CLAUDE.md files for Next.js, FastAPI, Django, and more."/>
<link rel="canonical" href="https://sourcebook.run/for/"/>
<meta name="robots" content="index, follow"/>
<link rel="icon" type="image/png" href="/logo.png"/>
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet"/>
<style>
  body { font-family: 'Inter', sans-serif; }
  .font-mono-tech { font-family: 'Space Grotesk', monospace; }
</style>
</head>
<body>
<nav class="border-b border-gray-200 py-4 px-6">
  <div class="max-w-4xl mx-auto flex justify-between items-center">
    <a href="/" class="font-mono-tech font-bold text-lg">sourcebook</a>
    <a href="https://github.com/maroondlabs/sourcebook" class="text-sm text-gray-600 hover:text-black">github</a>
  </div>
</nav>
<main class="max-w-4xl mx-auto px-6 py-12">
  <h1 class="text-3xl font-bold font-mono-tech mb-3">how open source repos work</h1>
  <p class="text-gray-600 mb-8">Conventions, patterns, and architecture extracted from real codebases by <a href="https://github.com/maroondlabs/sourcebook" class="underline">sourcebook</a>.</p>
  <div class="grid gap-4">
    ${REPOS.map((r) => `
    <a href="/for/${r.slug}" class="block border border-gray-200 rounded-lg p-4 hover:border-black transition-colors">
      <div class="flex justify-between items-start">
        <div>
          <h2 class="font-mono-tech font-bold">${r.name}</h2>
          <p class="text-sm text-gray-500">${r.description}</p>
        </div>
        <span class="text-xs bg-gray-100 px-2 py-1 rounded">${r.language}</span>
      </div>
    </a>`).join("\n")}
  </div>
  <div class="mt-12 text-center text-sm text-gray-500">
    <p>generate this for your own repo:</p>
    <code class="block text-lg font-mono-tech font-bold mt-2">npx sourcebook init</code>
  </div>
</main>
</body>
</html>`;
}

async function main() {
  // Ensure output directories exist
  fs.mkdirSync(path.join(SITE_DIR, "for"), { recursive: true });

  // Generate index page
  fs.writeFileSync(path.join(SITE_DIR, "for", "index.html"), renderIndex());
  console.log("✓ Generated /for/index.html");

  // Process each repo
  for (const repo of REPOS) {
    console.log(`\n→ ${repo.name} (${repo.repo})...`);

    const cloneDir = path.join(TMP_DIR, repo.slug);

    // Clone
    try {
      fs.rmSync(cloneDir, { recursive: true, force: true });
      console.log("  cloning...");
      execFileSync("git", ["clone", "--depth", "1", `https://github.com/${repo.repo}.git`, cloneDir], {
        encoding: "utf-8",
        timeout: 120000,
        stdio: "pipe",
      });
    } catch (err) {
      console.error(`  ✗ Failed to clone ${repo.repo}: ${err}`);
      continue;
    }

    // Scan
    try {
      console.log("  scanning...");
      const scan = await scanProject(cloneDir);
      console.log(`  ${scan.files.length} files, ${scan.findings.length} findings`);

      // Generate CLAUDE.md
      const claudeMd = generateClaude(scan, 4000);

      // Render HTML
      const html = renderPage(repo, scan, claudeMd);

      // Write
      const outDir = path.join(SITE_DIR, "for", repo.slug);
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, "index.html"), html);
      console.log(`  ✓ Generated /for/${repo.slug}/index.html`);
    } catch (err) {
      console.error(`  ✗ Failed to scan ${repo.repo}: ${err}`);
    }

    // Cleanup
    fs.rmSync(cloneDir, { recursive: true, force: true });
  }

  // Cleanup tmp dir
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  console.log("\n✓ Done");
}

main().catch(console.error);
