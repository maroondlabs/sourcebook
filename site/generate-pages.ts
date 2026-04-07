/**
 * Programmatic SEO page generator for sourcebook.run/for/[repo]
 *
 * Clones repos, runs sourcebook analysis, extracts top insights,
 * and generates static HTML pages with the sourcebook design system.
 *
 * Usage: npx tsx site/generate-pages.ts
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { scanProject } from "../src/scanner/index.js";
import { generateClaude } from "../src/generators/claude.js";
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

function extractTopInsights(scan: ProjectScan): string[] {
  const insights: string[] = [];
  for (const f of scan.findings) {
    if (f.category === "Critical constraints") {
      if (f.description.includes("Generated files")) {
        insights.push("Generated files detected — editing them directly will break builds");
      } else {
        insights.push(f.description.split(".")[0]);
      }
    }
    if (f.description.includes("Strict mode is OFF")) {
      insights.push("TypeScript strict mode is OFF — agents shouldn't add strict type annotations");
    }
    if (f.category === "Core modules" && f.description.includes("imported by")) {
      const match = f.description.match(/(\S+)\s+\(imported by (\d+) files\)/);
      if (match) insights.push(`${match[1]} is a hub file (imported by ${match[2]} files) — changes here ripple everywhere`);
    }
    if (f.category === "Circular dependencies") {
      insights.push("Circular import chains detected — avoid adding to these cycles");
    }
    if (f.category === "Dominant patterns" && f.description.includes("API endpoints use") && f.confidence !== "low") {
      const m = f.description.match(/API endpoints use (.+?)\./);
      if (m) insights.push(`Uses ${m[1]} for routing — follow this pattern, don't add REST routes directly`);
    }
    if (f.description.includes("monorepo")) {
      insights.push("This is a monorepo — check workspace dependencies before modifying shared code");
    }
  }
  const seen = new Set<string>();
  return insights.filter((i) => { if (seen.has(i)) return false; seen.add(i); return true; }).slice(0, 4);
}

function extractGuidance(scan: ProjectScan): string[] {
  const g: string[] = [];
  if (scan.findings.some((f) => f.description.includes("API endpoints") && f.confidence !== "low"))
    g.push("don't guess routing patterns — check first");
  if (scan.findings.some((f) => f.description.includes("Generated files")))
    g.push("avoid editing generated files — modify the source/schema instead");
  if (scan.rankedFiles && scan.rankedFiles.length > 0)
    g.push("check file importance before editing hub files");
  if (scan.findings.some((f) => f.category === "Dominant patterns" && f.confidence !== "low"))
    g.push("follow existing patterns listed in quick reference");
  return g.slice(0, 4);
}

function extractQuickRef(scan: ProjectScan): { label: string; value: string }[] {
  const qr: { label: string; value: string }[] = [];
  for (const f of scan.findings.filter((f) => f.category === "Dominant patterns" && f.confidence !== "low")) {
    const d = f.description;
    let label = "";
    let value = d.replace(/\. Follow this pattern.*$/, "").replace(/\. This is the project's standard.*$/, "");
    if (d.includes("route") || d.includes("endpoint") || d.includes("API")) label = "Routing";
    else if (d.includes("auth") || d.includes("Auth")) label = "Auth";
    else if (d.includes("Test") || d.includes("test")) label = "Testing";
    else if (d.includes("validation") || d.includes("Zod") || d.includes("Pydantic")) label = "Validation";
    else if (d.includes("database") || d.includes("Database") || d.includes("Prisma") || d.includes("ORM")) label = "Database";
    else if (d.includes("Tailwind") || d.includes("styled") || d.includes("CSS")) label = "Styling";
    else if (d.includes("i18n") || d.includes("translation") || d.includes("internationalization")) label = "i18n";
    else if (d.includes("fetching") || d.includes("Query") || d.includes("SWR")) label = "Data";
    else continue;
    // Extract just the key tool/pattern name
    const nameMatch = value.match(/use[s]?\s+(.+?)(?:\s+for|\s+\(|$)/i) || value.match(/(.+?)(?:\s+utility|\s+routes|\s+endpoints)/i);
    const shortValue = nameMatch ? nameMatch[1].trim() : value.split(".")[0].trim();
    qr.push({ label, value: shortValue });
  }
  // Deduplicate by label
  const seen = new Set<string>();
  return qr.filter((item) => { if (seen.has(item.label)) return false; seen.add(item.label); return true; });
}

function e(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const HEAD = `<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>
<script>
tailwind.config={darkMode:"class",theme:{extend:{colors:{"surface-tint":"#006e16","outline-variant":"#c6c6c6","surface-container":"#eeeeee","surface-container-low":"#f3f3f3","surface-container-high":"#e8e8e8","surface-container-highest":"#e2e2e2","surface":"#f9f9f9","on-surface":"#1b1b1b","secondary":"#5f5e5e","outline":"#777777","primary":"#000000","on-primary":"#72ff70","background":"#f9f9f9"},borderRadius:{DEFAULT:"0px",lg:"0px",xl:"0px",full:"0px"},fontFamily:{headline:["Space Grotesk"],body:["Inter"],label:["Space Grotesk"]}}}}
</script>
<style>
.material-symbols-outlined{font-variation-settings:'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24}
body{font-family:'Inter',sans-serif}
h1,h2,h3,h4,.label-mono{font-family:'Space Grotesk',sans-serif}
html.dark body{background-color:#000;color:#fff}
html.dark .bg-white{background-color:#000!important}
html.dark .text-black{color:#fff!important}
html.dark .border-black{border-color:#fff!important}
html.dark .border-black\\/5{border-color:rgba(255,255,255,0.05)!important}
html.dark .border-outline-variant\\/20{border-color:rgba(255,255,255,0.1)!important}
html.dark .border-outline-variant\\/10{border-color:rgba(255,255,255,0.05)!important}
html.dark .border-outline-variant\\/30{border-color:rgba(255,255,255,0.15)!important}
html.dark .border-outline-variant\\/40{border-color:rgba(255,255,255,0.2)!important}
html.dark .bg-surface-container-low{background-color:#0D0D0D!important}
html.dark .bg-surface-container{background-color:#111!important}
html.dark .bg-surface-container-high{background-color:#1a1a1a!important}
html.dark .text-secondary{color:#888!important}
html.dark .text-gray-400{color:#666!important}
html.dark .text-gray-500{color:#555!important}
html.dark .bg-black{background-color:#000!important}
html.dark .hover\\:bg-black:hover{background-color:#fff!important}
html.dark .hover\\:text-white:hover{color:#000!important}
html.dark .hover\\:text-black:hover{color:#000!important}
</style>`;

const NAV = `<nav class="bg-white flex justify-between items-center w-full px-6 py-4 border-b border-black/5 sticky top-0 z-50">
<div class="flex items-center gap-8">
<a href="/" class="text-xl font-bold text-black font-['Space_Grotesk'] uppercase tracking-tighter">SOURCEBOOK</a>
<div class="hidden md:flex gap-4">
<a class="font-['Space_Grotesk'] uppercase tracking-tighter text-xs text-black border-b-2 border-black" href="/for/">EXPLORE</a>
<a class="font-['Space_Grotesk'] uppercase tracking-tighter text-xs text-gray-500 hover:bg-[#00FF41] hover:text-black transition-none px-1" href="https://github.com/maroondlabs/sourcebook">GITHUB</a>
</div>
</div>
<div class="flex items-center gap-4">
<button onclick="toggleTheme()" class="material-symbols-outlined text-black hover:text-[#00FF41] transition-none" aria-label="Toggle dark mode">dark_mode</button>
</div>
</nav>`;

const FOOTER = `<footer class="bg-white flex justify-between items-center w-full px-6 py-8 border-t border-black/5">
<div class="flex items-center gap-4">
<span class="font-bold text-black font-['Space_Grotesk'] uppercase tracking-widest text-xs">SOURCEBOOK</span>
<span class="text-[10px] text-gray-500 font-['Space_Grotesk'] uppercase tracking-widest">v0.8.3</span>
</div>
<a class="font-['Space_Grotesk'] text-xs uppercase tracking-widest text-gray-500 hover:text-[#00FF41]" href="/">PROJECT KNOWLEDGE FOR CODING AGENTS</a>
</footer>
<script>
function toggleTheme(){var h=document.documentElement,d=h.classList.contains('dark');h.classList.remove('light','dark');h.classList.add(d?'light':'dark');localStorage.setItem('theme',d?'light':'dark');document.querySelector('[onclick="toggleTheme()"]').textContent=d?'dark_mode':'light_mode'}
(function(){var s=localStorage.getItem('theme');if(s==='dark'){document.documentElement.classList.remove('light');document.documentElement.classList.add('dark');var t=document.querySelector('[onclick="toggleTheme()"]');if(t)t.textContent='light_mode'}})();
</script>`;

function renderPage(repo: RepoConfig, scan: ProjectScan, claudeMd: string): string {
  const insights = extractTopInsights(scan);
  const guidance = extractGuidance(scan);
  const qr = extractQuickRef(scan);
  const relatedRepos = REPOS.filter((r) => repo.related.includes(r.slug));
  const highFindings = scan.findings.filter((f) => f.confidence === "high");
  const medFindings = scan.findings.filter((f) => f.confidence === "medium");
  const metaInsights = insights.slice(0, 2).join(". ");

  return `<!DOCTYPE html>
<html class="light" lang="en"><head>
${HEAD}
<title>HOW ${repo.name.toUpperCase()} WORKS | SOURCEBOOK</title>
<meta name="description" content="How the ${repo.name} repo actually works: ${e(metaInsights)}. Extracted from ${scan.files.length.toLocaleString()} files."/>
<link rel="canonical" href="https://sourcebook.run/for/${repo.slug}"/>
<meta property="og:title" content="How ${repo.name} Works | sourcebook"/>
<meta property="og:url" content="https://sourcebook.run/for/${repo.slug}"/>
<meta name="robots" content="index, follow"/>
<link rel="icon" type="image/png" href="/logo.png"/>
</head>
<body class="bg-white text-black antialiased">
${NAV}

<main class="max-w-7xl mx-auto px-6 pt-16 pb-12">

<!-- Hero -->
<section class="mb-12">
  <div class="flex flex-wrap gap-4 mb-4 text-xs font-['Space_Grotesk'] uppercase tracking-widest text-secondary">
    <span class="bg-black text-white px-2 py-0.5">${e(repo.language)}</span>
    <span>${scan.files.length.toLocaleString()} FILES</span>
    <span class="text-[#00881d]">${scan.findings.length} FINDINGS</span>
  </div>
  <h1 class="text-5xl md:text-7xl font-bold tracking-tighter uppercase mb-6 leading-none">
    HOW ${repo.name.toUpperCase()}<br/>ACTUALLY WORKS
  </h1>
  <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
    <p class="text-lg text-secondary col-span-2 leading-relaxed">${e(repo.description)}. Conventions, patterns, and architecture extracted from the <a href="https://github.com/${repo.repo}" class="underline">${repo.repo}</a> repository by <a href="/" class="underline">sourcebook</a>.</p>
    <div class="flex items-end justify-end">
      <a class="inline-flex items-center gap-2 border border-black px-6 py-3 hover:bg-[#00FF41] hover:text-black transition-none uppercase font-bold text-sm font-['Space_Grotesk']" href="https://github.com/${repo.repo}">
        VIEW_REPO <span class="material-symbols-outlined">north_east</span>
      </a>
    </div>
  </div>
</section>

${qr.length > 0 ? `
<!-- Quick Reference -->
<section class="mb-12 bg-surface-container-low p-4 flex flex-wrap gap-6 items-center border-l-4 border-black">
  <span class="text-xs font-bold font-['Space_Grotesk'] uppercase tracking-tighter">QUICK_REF:</span>
  <div class="flex flex-wrap gap-3">
    ${qr.map((q) => `<span class="px-3 py-1 bg-white border border-outline-variant/30 text-xs font-medium"><b class="font-bold">${q.label}:</b> ${e(q.value)}</span>`).join("\n    ")}
  </div>
</section>` : ""}

<div class="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
<section class="lg:col-span-8">

${insights.length > 0 ? `
<!-- What Matters -->
<div class="p-8 bg-surface-container-low border border-outline-variant/20 mb-12">
  <h2 class="text-xl font-bold uppercase mb-6 font-['Space_Grotesk']">WHAT_MATTERS</h2>
  <ul class="space-y-6">
    ${insights.map((i) => `<li class="flex gap-4 items-start">
      <span class="text-[#00881d] font-bold">→</span>
      <p class="text-sm leading-relaxed">${e(i)}</p>
    </li>`).join("\n    ")}
  </ul>
</div>` : ""}

<!-- Key Findings -->
<div class="mb-12">
  <h2 class="text-2xl font-bold uppercase mb-6 flex items-center gap-2 font-['Space_Grotesk']">
    <span class="w-8 h-1 bg-black"></span> KEY_FINDINGS
  </h2>
  <div class="space-y-4">
    ${highFindings.map((f) => `<div class="border-l-4 border-[#00FF41] bg-white p-6">
      <div class="flex justify-between items-start mb-2">
        <p class="font-medium text-sm">${e(f.description)}</p>
        <span class="bg-[#00FF41] text-black text-[10px] font-bold px-2 py-0.5 uppercase shrink-0 ml-4">HIGH</span>
      </div>
      ${f.evidence ? `<code class="text-[10px] font-['Space_Grotesk'] text-gray-400">${e(f.evidence)}</code>` : ""}
    </div>`).join("\n    ")}
    ${medFindings.length > 0 ? `
    <details class="mt-4">
      <summary class="text-xs font-['Space_Grotesk'] uppercase tracking-widest text-secondary cursor-pointer hover:text-black">+ ${medFindings.length} MORE FINDINGS (MEDIUM CONFIDENCE)</summary>
      <div class="mt-4 space-y-4">
        ${medFindings.map((f) => `<div class="border-l-4 border-yellow-400 bg-white p-6">
          <div class="flex justify-between items-start mb-2">
            <p class="font-medium text-sm">${e(f.description)}</p>
            <span class="bg-yellow-400 text-black text-[10px] font-bold px-2 py-0.5 uppercase shrink-0 ml-4">MED</span>
          </div>
          ${f.evidence ? `<code class="text-[10px] font-['Space_Grotesk'] text-gray-400">${e(f.evidence)}</code>` : ""}
        </div>`).join("\n        ")}
      </div>
    </details>` : ""}
  </div>
</div>

</section>
<aside class="lg:col-span-4 space-y-8">

${guidance.length > 0 ? `
<!-- AI Tools Sidebar -->
<div class="bg-black p-6 text-[#00FF41] border border-[#00FF41]/20">
  <h3 class="font-['Space_Grotesk'] font-bold text-xs uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
    <span class="material-symbols-outlined text-sm">smart_toy</span> USING_AI_TOOLS
  </h3>
  <ul class="space-y-4 font-['Space_Grotesk'] text-xs uppercase tracking-wider leading-loose">
    ${guidance.map((g) => `<li class="flex gap-3"><span>→</span><span>${e(g)}</span></li>`).join("\n    ")}
  </ul>
</div>` : ""}

<!-- CLAUDE.md -->
<details class="group bg-surface-container-low border border-outline-variant/20 overflow-hidden">
  <summary class="flex items-center justify-between p-4 cursor-pointer hover:bg-surface-container-high transition-none list-none">
    <span class="text-xs font-bold font-['Space_Grotesk'] uppercase">CLAUDE.MD</span>
    <span class="material-symbols-outlined group-open:rotate-180 transition-transform">expand_more</span>
  </summary>
  <div class="p-4 pt-0">
    <pre class="bg-white border border-outline-variant/30 p-3 font-mono text-[10px] leading-relaxed text-secondary overflow-y-auto max-h-64 whitespace-pre-wrap">${e(claudeMd)}</pre>
  </div>
</details>

</aside>
</div>

<!-- CTA -->
<section class="py-16 border-y border-outline-variant/20 flex flex-col items-center text-center">
  <span class="text-[10px] font-['Space_Grotesk'] uppercase tracking-[0.3em] mb-4 text-secondary">GENERATED IN ~3 SECONDS WITH</span>
  <h2 class="text-4xl md:text-6xl font-bold font-['Space_Grotesk'] mb-8 tracking-tighter">npx sourcebook init</h2>
  <a class="bg-black text-white px-10 py-4 font-bold uppercase tracking-widest hover:bg-[#00FF41] hover:text-black transition-none flex items-center gap-4 font-['Space_Grotesk']" href="https://github.com/maroondlabs/sourcebook">
    VIEW ON GITHUB <span class="material-symbols-outlined">star</span>
  </a>
</section>

${relatedRepos.length > 0 ? `
<!-- Related -->
<section class="mt-12">
  <h3 class="text-xs font-bold font-['Space_Grotesk'] uppercase mb-6 tracking-widest text-secondary">RELATED_REPOS</h3>
  <div class="flex flex-wrap gap-3">
    ${relatedRepos.map((r) => `<a class="px-4 py-2 border border-outline-variant/40 text-xs font-['Space_Grotesk'] hover:bg-black hover:text-white transition-none uppercase" href="/for/${r.slug}">${r.name.toUpperCase()}</a>`).join("\n    ")}
  </div>
</section>` : ""}

</main>
${FOOTER}
</body></html>`;
}

function renderIndex(): string {
  return `<!DOCTYPE html>
<html class="light" lang="en"><head>
${HEAD}
<title>SOURCEBOOK | Open Source Patterns</title>
<meta name="description" content="How popular open-source repos actually work — conventions, patterns, and architecture extracted by sourcebook."/>
<link rel="canonical" href="https://sourcebook.run/for/"/>
<meta name="robots" content="index, follow"/>
<link rel="icon" type="image/png" href="/logo.png"/>
</head>
<body class="bg-white text-black antialiased">
${NAV}

<!-- Hero -->
<header class="pt-24 pb-16 px-6 border-b border-outline-variant/10">
  <div class="max-w-7xl mx-auto">
    <div class="inline-block bg-black text-white px-3 py-1 mb-6 text-xs font-['Space_Grotesk'] font-bold uppercase tracking-widest">SYSTEM_ANALYSIS_V1.0</div>
    <h1 class="text-6xl md:text-8xl font-bold font-['Space_Grotesk'] leading-[0.9] tracking-tighter mb-8 max-w-4xl">how open source repos work</h1>
    <p class="text-xl md:text-2xl text-secondary max-w-2xl font-['Inter'] leading-relaxed">conventions, patterns, and architecture extracted from real codebases by sourcebook.</p>
  </div>
</header>

<!-- Grid -->
<main class="max-w-7xl mx-auto px-6 py-12">
  <div class="grid grid-cols-1 md:grid-cols-2 gap-0 border-t border-l border-outline-variant/20">
    ${REPOS.map((r, i) => `<a href="/for/${r.slug}" class="block border-r border-b border-outline-variant/20 p-8 hover:border-l-4 hover:border-l-[#00FF41] group transition-all duration-100 bg-white cursor-pointer">
      <div class="flex justify-between items-start mb-6">
        <h3 class="text-2xl font-bold font-['Space_Grotesk'] uppercase tracking-tight">${r.repo}</h3>
        <span class="material-symbols-outlined group-hover:text-[#00FF41]">arrow_outward</span>
      </div>
      <p class="text-secondary font-['Inter'] mb-8 text-sm leading-relaxed">${e(r.description)}</p>
      <div class="flex flex-wrap gap-2 mb-10">
        <span class="bg-surface-container text-black px-2 py-1 text-[10px] font-bold font-['Space_Grotesk'] uppercase">${r.language}</span>
      </div>
      <div class="flex justify-between items-center text-[10px] font-['Space_Grotesk'] uppercase tracking-widest text-secondary group-hover:text-black">
        <span class="text-primary font-bold">_VIEW_ANALYSIS</span>
      </div>
    </a>`).join("\n    ")}
  </div>
</main>

<!-- CTA -->
<section class="max-w-7xl mx-auto px-6 pb-24">
  <div class="grid grid-cols-1 md:grid-cols-12 gap-8">
    <div class="md:col-span-5 flex flex-col justify-center">
      <h2 class="text-4xl font-bold font-['Space_Grotesk'] uppercase tracking-tighter mb-4">generate this for your own repo</h2>
      <p class="text-secondary mb-8 font-['Inter']">Analyze your codebase for patterns and conventions in seconds. No setup required.</p>
      <a href="https://github.com/maroondlabs/sourcebook" class="bg-black text-white px-8 py-4 text-sm font-['Space_Grotesk'] font-bold hover:bg-[#00FF41] hover:text-black transition-none uppercase tracking-widest w-fit">GET STARTED</a>
    </div>
    <div class="md:col-span-7">
      <div class="bg-[#0D0D0D] p-8 relative">
        <div class="flex items-center gap-2 mb-6">
          <div class="w-3 h-3 bg-red-500/50"></div>
          <div class="w-3 h-3 bg-yellow-500/50"></div>
          <div class="w-3 h-3 bg-green-500/50"></div>
          <span class="ml-4 text-[10px] font-['Space_Grotesk'] text-gray-500 uppercase tracking-widest">terminal — sourcebook</span>
        </div>
        <div class="font-['Space_Grotesk'] text-[#00FF41] text-lg leading-relaxed">
          <div class="mb-2"><span class="opacity-50">$</span> npx sourcebook init</div>
          <div class="text-white opacity-70 mb-2">Analyzing repository structure...</div>
          <div class="text-white opacity-70 mb-2">Extracting pattern definitions...</div>
          <div><span class="opacity-50">$</span> <span class="bg-[#00FF41] text-black px-1">_</span></div>
        </div>
      </div>
    </div>
  </div>
</section>

${FOOTER}
</body></html>`;
}

async function main() {
  fs.mkdirSync(path.join(SITE_DIR, "for"), { recursive: true });

  fs.writeFileSync(path.join(SITE_DIR, "for", "index.html"), renderIndex());
  console.log("✓ Generated /for/index.html");

  for (const repo of REPOS) {
    console.log(`\n→ ${repo.name} (${repo.repo})...`);
    const cloneDir = path.join(TMP_DIR, repo.slug);

    try {
      fs.rmSync(cloneDir, { recursive: true, force: true });
      console.log("  cloning...");
      execFileSync("git", ["clone", "--depth", "1", `https://github.com/${repo.repo}.git`, cloneDir], {
        encoding: "utf-8", timeout: 120000, stdio: "pipe",
      });
    } catch (err) {
      console.error(`  ✗ Clone failed: ${err}`);
      continue;
    }

    try {
      console.log("  scanning...");
      const scan = await scanProject(cloneDir);
      console.log(`  ${scan.files.length} files, ${scan.findings.length} findings`);
      const claudeMd = generateClaude(scan, 4000);
      const html = renderPage(repo, scan, claudeMd);
      const outDir = path.join(SITE_DIR, "for", repo.slug);
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, "index.html"), html);
      console.log(`  ✓ Generated /for/${repo.slug}/index.html`);
    } catch (err) {
      console.error(`  ✗ Scan failed: ${err}`);
    }

    fs.rmSync(cloneDir, { recursive: true, force: true });
  }

  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  console.log("\n✓ Done");
}

main().catch(console.error);
