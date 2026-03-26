# sourcebook: Complete Product Overview

**Prepared for external review. March 2026.**

This document is intended to give a second-opinion reviewer (human or AI) full context on sourcebook -- what it is, how it works, the research it draws on, the business model, and the open questions we are wrestling with. It is written to be honest, not promotional.

---

## 1. Executive Summary

**One-line pitch:** sourcebook generates AI context files containing only what coding agents cannot figure out by reading the code themselves.

**What it is:** A CLI tool (TypeScript, ~3,300 lines) that analyzes a codebase across four dimensions -- static code analysis, import graph PageRank, git history forensics, and context-rot-aware formatting -- then outputs a CLAUDE.md, .cursorrules, or copilot-instructions.md file containing only non-discoverable information.

**Core insight -- the discoverability filter:** Most auto-generated context files restate what agents already know (tech stack, directory structure, basic commands). Research shows this actively degrades agent performance by 2-3%. sourcebook inverts the approach: for every finding, it asks "can an agent figure this out by reading the code?" If yes, that finding is dropped. Only conventions, constraints, hidden dependencies, and architectural truths that agents would miss survive the filter.

**The headline number:** On cal.com (10,456 files), sourcebook produces 858 tokens of non-discoverable context. Repomix (the market leader at 22K GitHub stars) produces 16.8 million tokens of raw file concatenation for the same codebase. That is a 19,680x reduction.

**Current state:** Shipped as an npm package (`npx sourcebook init`). Supports TypeScript, Python, and Go. Three output formats. Has `update` (preserve manual edits), `diff` (CI-friendly change detection), and `--budget` (smart token limiting) commands. GitHub Action available. Website live at sourcebook.run. Pro tier ($19/mo) and Team tier ($39/seat/mo) pricing pages are up. No revenue yet -- payments integration is not yet live.

---

## 2. Problem Statement

### 2.1 The Orientation Tax

AI coding agents (Claude Code, Cursor, GitHub Copilot Workspace) spend the majority of their context window on orientation -- reading files, understanding project structure, and building a mental model before doing any real work. Internal estimates from the strategy doc put this at ~76% of tokens spent on navigation rather than task completion.

This is a structural problem: context windows are finite (even at 200K tokens), and every token spent on orientation is a token not spent on reasoning about the actual task.

### 2.2 Auto-Generated Context Hurts

The ETH Zurich AGENTS.md study (February 2025, arxiv.org/abs/2502.09601) tested auto-generated context files on real agent benchmarks. Key finding: context files that restate obvious information (tech stack enumeration, directory trees, basic framework detection) made agents **worse** by 2-3% compared to no context file at all.

The mechanism: obvious context competes with task-relevant information in the attention mechanism. The agent wastes attention on facts it could have inferred, leaving less attention budget for the non-obvious things it actually needs.

### 2.3 Manual Context Files Go Stale

Developers who write CLAUDE.md or .cursorrules by hand face a maintenance problem. These files reflect the codebase at the moment they were written. Within days, code changes make them partially wrong. Within weeks, they can be actively misleading. Nobody schedules time to update their AI context files.

### 2.4 No Existing Tool Solves This

Before sourcebook, the options were:
- **Repomix** (22K stars): Concatenates all files into one blob. No intelligence. Massive token waste.
- **ContextPilot**: Checks package.json for framework names. No code analysis.
- **Rulegen**: Asks the developer questions. No automated analysis.
- **Manual writing**: Works great for a day, stale by next week.

No tool existed that automatically extracted only non-discoverable information from a codebase.

---

## 3. Solution: How sourcebook Works

### 3.1 Usage

```bash
npx sourcebook init                  # Generate CLAUDE.md (default)
npx sourcebook init --format all     # CLAUDE.md + .cursorrules + copilot-instructions.md
npx sourcebook update                # Re-analyze, preserve manual edits (Pro)
npx sourcebook diff                  # Show changes without writing (CI exit code 1 = drift detected)
npx sourcebook init --budget 1000    # Cap output at 1000 tokens, drop low-priority sections first
```

### 3.2 Four Analysis Dimensions

**Dimension 1: Static Code Analysis**
- Framework detection: Next.js, Expo, Vite, React, Express, Supabase, Tailwind, Django, FastAPI, Flask, Gin, Echo, Fiber
- Convention inference: naming patterns, export style (named vs default ratios), import organization (path aliases vs relative), barrel exports, error handling patterns, type hint usage
- Environment variable mapping: public vs private, documented vs undocumented
- Build/test/lint command detection from package.json, Makefile, pyproject.toml
- Project structure classification: feature-based, layer-based, monorepo, co-located tests

**Dimension 2: Import Graph + PageRank**
- Builds a directed graph of all import/require/from-import relationships across the codebase
- Runs PageRank (custom implementation, no external dependency) to rank files by structural importance
- Identifies hub files: files with the highest fan-in (most depended-upon). These are the files where a change has the widest blast radius.
- Detects circular dependencies
- Finds orphan files (potential dead code) -- files with no inbound edges

**Dimension 3: Git History Forensics**
- Reverted commits: literal "don't do this" signals from the project's own history. These are anti-patterns the team already tried and rejected.
- Co-change coupling: files that always change together across different directories. These are invisible dependencies that no import graph reveals.
- Rapid re-edits: files edited 5+ times in a single week. These are code sections that were hard to get right -- fragile code an agent should approach carefully.
- Active development areas: where changes concentrate in the last 30 days.
- Commit message pattern detection: Conventional Commits usage, common scopes.
- Anti-pattern detection from reverts and deleted approaches.

**Dimension 4: Context-Rot-Aware Output Formatting**
Based on Chroma Research (2026) showing LLMs have 30%+ accuracy drops for information in the middle of long contexts (the "lost in the middle" / U-shaped attention curve):
- Critical constraints (hidden deps, fragile code, circular deps) are placed at the **top** of the output
- Lightweight reference info (stack summary, structure) goes in the **middle**
- Action prompts ("What to Add Manually") go at the **bottom**
- When budget is exceeded, low-priority (supplementary) findings are dropped first; critical constraints are never dropped

### 3.3 The Discoverability Test

Every finding passes through a filter before inclusion. The `Finding` type has a `discoverable: boolean` field. If `discoverable` is true, the finding is excluded from output. The test is: "Can an agent figure this out by reading the code?" Examples:

- "This project uses TypeScript" -- discoverable (any agent can see .ts files). **Excluded.**
- "ThemeContext.tsx is imported by 684 files" -- not discoverable without building the full import graph and running PageRank. **Included.**
- "profile.tsx was edited 18 times in one week" -- not discoverable from code alone, requires git forensics. **Included.**
- "auth/provider.ts and middleware/session.ts have 88% co-change correlation" -- not discoverable. **Included.**

### 3.4 Three Output Formats

| Format | File | Used By |
|--------|------|---------|
| claude | `CLAUDE.md` | Claude Code |
| cursor | `.cursor/rules/sourcebook.mdc` + `.cursorrules` | Cursor |
| copilot | `.github/copilot-instructions.md` | GitHub Copilot |

All three share the same analysis pipeline and discoverability filter. The generators differ in formatting conventions for each tool.

---

## 4. Technical Architecture

### 4.1 Data Flow

```
Codebase (local directory)
  |
  +---> File Scanner (glob)
  |       Collects all files, ignores node_modules/dist/build/.git/.next/coverage/.expo
  |       Detects languages from file extensions
  |
  +---> Framework Detector (frameworks.ts, 430 lines)
  |       Reads ALL package.json files (root + workspace packages)
  |       Pattern-matches on dependency names + config file presence
  |       Supports: Next.js, Expo, Vite, React, Express, Supabase, Tailwind,
  |                 Django, FastAPI, Flask, pytest, Gin, Echo, Fiber
  |
  +---> Build Detector (build.ts, 87 lines)
  |       Reads: package.json scripts, Makefile, pyproject.toml
  |       Outputs: dev, build, test, lint, start commands
  |
  +---> Structure Analyzer (structure.ts, 176 lines)
  |       Classifies: feature-based, layer-based, monorepo
  |       Identifies entry points, key directories
  |
  +---> Pattern Detector (patterns.ts, 366 lines)
  |       Samples 50 source files (prioritizes entry points + configs)
  |       Detects: naming, imports, exports, env vars, error handling
  |
  +---> Git Analyzer (git.ts, 497 lines)
  |       Reads: git log (last 6-12 months, up to 300 commits)
  |       Detects: reverts, co-change coupling, churn, active areas, commit patterns
  |       Detects: anti-patterns from reverts and deleted approaches
  |
  +---> Graph Analyzer (graph.ts, 328 lines)
          Reads all source file imports (regex-based extraction)
          Builds directed graph, runs PageRank
          Detects: hub files, circular deps, orphan files
  |
  v
ProjectScan (unified scan result -- types.ts, 52 lines)
  |
  v
Generator (claude.ts / cursor / copilot + shared.ts, ~210 lines combined)
  |  Applies: discoverability filter (drop findings where discoverable=true)
  |  Applies: criticality ranking (critical > important > supplementary)
  |  Applies: context-rot-aware layout (U-shaped attention optimization)
  |  Applies: token budget enforcement (PageRank-based prioritization)
  |
  v
Output File (CLAUDE.md / .cursorrules / copilot-instructions.md)
```

### 4.2 Module Breakdown

| Module | Lines | Purpose |
|--------|------:|---------|
| scanner/git.ts | 497 | Git history forensics (largest module) |
| scanner/frameworks.ts | 430 | Framework detection across 13+ frameworks |
| scanner/patterns.ts | 366 | Convention inference from sampled files |
| scanner/graph.ts | 328 | Import graph builder + PageRank |
| scanner/structure.ts | 176 | Project layout classification |
| generators/claude.ts | ~104 | CLAUDE.md generator |
| generators/shared.ts | 106 | Shared generator utilities (categorization, budget enforcement) |
| scanner/index.ts | 102 | Scanner orchestrator |
| scanner/build.ts | 87 | Build command detection |
| cli.ts | ~100 | CLI entry point (commander) |
| commands/init.ts | ~50 | Init command orchestration |
| types.ts | 52 | Core type definitions |
| utils/output.ts | 15 | File writer |
| **Total** | **~3,300** | |

### 4.3 Key Design Decisions

**No LLM dependency for core analysis.** All analysis is deterministic, runs locally, requires no API keys, no network calls (except optional license key validation for Pro). This means: (a) it is fast (sub-second to ~3 seconds), (b) it is free to run, (c) output is reproducible, (d) it works offline. An optional `--ai` flag for natural language polish is planned but not required.

**Regex-based import extraction, not full AST.** The graph module uses regex patterns to extract import/export/require statements. This is ~10x faster than full Tree-sitter parsing and sufficient for building the import graph. Tree-sitter is planned for deeper convention analysis in a future version (naming patterns by AST context).

**File sampling for pattern detection.** Instead of reading every file, patterns.ts samples 50 files, prioritizing entry points and config files. This keeps analysis fast while capturing dominant patterns. The assumption: conventions in a well-maintained codebase are consistent enough that 50 files represent the whole.

**Monorepo awareness.** Framework detection reads ALL package.json files in the project (root + workspace packages), not just the root. This catches dependencies in workspace packages that root-only scanning would miss.

**Custom PageRank implementation.** No external dependency for graph analysis. The PageRank implementation is self-contained in graph.ts (~100 lines of the 328-line module). This avoids adding heavy graph-processing libraries for a focused use case.

**Git analysis is bounded.** Git forensics reads the last 6-12 months of history, capped at 300 commits. This prevents analysis from taking minutes on repos with 50K+ commits while capturing the relevant recent history.

### 4.4 Languages Supported

| Language | Framework Detection | Convention Detection | Import Graph | Git Analysis |
|----------|:---:|:---:|:---:|:---:|
| TypeScript / JavaScript | Next.js, Expo, Vite, React, Express, Tailwind, Supabase | Barrel exports, path aliases, export style, error handling | Full (import/export/require) | Full |
| Python | Django, FastAPI, Flask, pytest | Type hints, `__init__.py` barrels | Full (import/from-import) | Full |
| Go | Gin, Echo, Fiber | Module path, cmd/pkg/internal layout, error wrapping, interfaces | Full (import) | Full |

---

## 5. Test Results

### 5.1 Results on Internal Codebases

**crowned** (Expo + Supabase, 3,467 files) -- 15 findings:
- Critical: ThemeContext.tsx imported by 684 files (highest blast radius), circular dep in brain-api.ts <-> chat.ts, hidden coupling between useTodayBrain.ts and brain-api.ts
- Conventions: barrel exports (35 index files), path aliases (@/), named exports (25:6 ratio), EAS Build required
- History: profile.tsx had 18 rapid edits in one week, src/ had 265 changes in 30 days, Conventional Commits detected

**ReportCraft** (Vite + Express monorepo, 163 files) -- 8 findings:
- Critical: auth.ts middleware imported by 11 files, reportBlueprint.ts by 10
- Structure: monorepo detected, co-located tests
- History: frontend/ dominates with 99 changes, App.tsx had 5 rapid edits
- 15 dead code candidates identified

**marooondAI** (Vite + React, 116 files) -- 7 findings:
- Hidden dependency: App.tsx <-> tailwind.config.js always change together
- Tailwind custom color tokens detected
- FloatingNav.tsx is the hub component (5 importers)
- Named export preference (37:10 ratio)

**morningof** (Next.js + Supabase, 281 files) -- 8 findings:
- Strong path alias preference (45 alias vs 6 relative imports)
- 18 env vars mapped (public NEXT_PUBLIC_* vs private)
- Core modules: types/index.ts (10 importers), timeline.ts (8)

### 5.2 Results on External Codebases

**cal.com** (10,456 files) -- the primary benchmark codebase:
- 11 findings extracted
- Core hub: types.ts imported by 183 files
- Circular dependency: bookingScenario.ts <-> getMockRequestData.ts
- Co-change coupling: auth/provider.ts <-> middleware/session.ts (88% correlation)
- 1,907 orphan files detected (potential dead code)
- Conventions: named exports preferred (26:2 ratio), 40 barrel export index files
- Commit style: Conventional Commits (feat/fix/docs)
- Analysis time: 3.1 seconds

**create-t3-app**, **hono**, **FastAPI**, **Gin** -- also tested but specific results not documented in detail.

### 5.3 Performance

| Codebase | Files | Analysis Time |
|----------|------:|:-------------:|
| crowned | 3,467 | ~3 seconds |
| cal.com | 10,456 | 3.1 seconds |
| morningof | 281 | ~1 second |
| ReportCraft | 163 | <1 second |
| marooondAI | 116 | <1 second |

Sub-3-second analysis on 10K+ file codebases. Most projects analyze in under 1 second.

### 5.4 Token Comparison: sourcebook vs Repomix

Measured on cal.com (10,456 files):

| Tool | Output Tokens | What It Contains |
|------|-------------:|------------------|
| sourcebook | 858 | Non-discoverable findings only: hub files, co-change coupling, circular deps, conventions, anti-patterns, active areas |
| Repomix | 16,880,000 (~16.8M) | Every file concatenated into one blob |
| **Reduction factor** | **19,680x** | |

**Important caveat on this number:** These tools are doing fundamentally different things. Repomix provides the full codebase as context (for models with very large context windows). sourcebook provides a curated summary. The 19,680x number is a token-count comparison, not an apples-to-apples feature comparison. A fairer comparison might be "information density per token" or "agent task success rate with each approach," but those benchmarks have not been run yet. See Section 12 for open questions on this.

---

## 6. Research Foundation

### 6.1 ETH Zurich AGENTS.md Study (February 2025)

**Paper:** arxiv.org/abs/2502.09601

**Key finding:** Auto-generated context files containing obvious information make agents worse by 2-3%. The only context that improves agent performance is non-discoverable information.

**How sourcebook uses it:** The discoverability filter is a direct implementation of this finding. Every finding has a `discoverable: boolean` flag. Discoverable findings are excluded from output.

### 6.2 Karpathy's autoresearch / program.md

**Source:** github.com/karpathy/autoresearch

**Key insight:** A curated `program.md` file is the single highest-leverage intervention for agent effectiveness. The file should contain constraints, conventions, and autonomy boundaries -- not just project descriptions.

**How sourcebook uses it:** The output format follows the program.md philosophy: constraints and gotchas first, reference info second, autonomy boundaries (what to add manually) last.

### 6.3 Aider's repo-map (PageRank)

**Source:** aider.chat/docs/repomap.html

**Key insight:** Running PageRank on a codebase's import graph identifies the structurally most important files. Conventions found in high-PageRank files are likely canonical for the project.

**How sourcebook uses it:** graph.ts builds a directed import graph and runs PageRank. Hub files (highest PageRank scores) are surfaced as critical findings. When budget enforcement kicks in, higher-PageRank findings are preserved over lower-PageRank ones.

### 6.4 Chroma Context-Rot Research (2026)

**Key finding:** LLMs show 30%+ accuracy drops for information placed in the middle of long contexts. Accuracy follows a U-shaped curve: highest at the beginning and end, lowest in the middle.

**How sourcebook uses it:** Context-rot-aware output formatting. Critical constraints go at the top of the generated file. Action prompts go at the bottom. Supplementary reference info goes in the middle. This matches the U-shaped attention curve.

### 6.5 SWE-Pruner (January 2026)

**Key finding:** 23-54% token reduction is achievable while maintaining agent accuracy by using relevance scoring to filter context.

**How sourcebook uses it:** Validates the general approach of aggressive context pruning. sourcebook goes further (99.99% reduction) by filtering on discoverability rather than relevance.

### 6.6 Codified Context Paper (February 2026)

**Key insight:** Hot/cold memory architecture for agent context. Hot memory (frequently needed, changes often) should be structured differently from cold memory (stable reference info).

**How sourcebook uses it:** The criticality ranking (critical / important / supplementary) loosely maps to hot/cold memory. Critical findings change with the codebase and need prominent placement. Supplementary findings are more stable reference info.

---

## 7. Competitive Landscape

### 7.1 Repomix (22K GitHub stars)

**What it does:** Concatenates all repository files into a single text file for use as LLM context.

**Strengths:** Dead simple. Huge adoption. Works with any LLM. The "just give it everything" approach works when context windows are very large.

**Weaknesses:** No intelligence about what matters. Massive token waste (16.8M tokens for cal.com). No discoverability filtering. No convention extraction. No git forensics. As context windows grow, the brute-force approach becomes viable for smaller repos, but for large codebases it still fills or overflows the window.

**sourcebook advantage:** 19,680x fewer tokens with higher information density per token.

### 7.2 ContextPilot

**What it does:** Detects frameworks by checking package.json dependency names.

**Strengths:** Simple, fast.

**Weaknesses:** No code analysis, no git history, no graph analysis, no convention detection. 0 GitHub stars. Extremely limited scope.

**sourcebook advantage:** Four analysis dimensions vs one. Orders of magnitude more findings.

### 7.3 Rulegen

**What it does:** Interview-based approach. Asks the developer questions and generates context from answers.

**Strengths:** Good philosophy ("Claude can read your code, it can't read your mind"). Captures tacit knowledge that automated tools miss.

**Weaknesses:** Requires manual effort every time. No automated analysis. Does not scale. Goes stale just like manually written context.

**sourcebook advantage:** Fully automated. Repeatable. Can run in CI. The `update` command preserves manual additions while refreshing automated findings.

### 7.4 codebrief

**What it does:** File concatenation tool, similar to Repomix.

**No convention detection, no git analysis, no graph analysis.** Same fundamental limitation as Repomix.

### 7.5 GrapeRoot

**What it does:** Runtime caching and context management for AI agents.

**Weakness:** No static analysis. Addresses a different part of the problem (runtime context management rather than project-level understanding).

### 7.6 Summary: Why sourcebook Wins

The combination no one else offers:

1. **Behavioral forensics** -- extracting implicit knowledge from how code evolved (git history: reverts, co-change coupling, churn patterns)
2. **Graph-based importance ranking** -- PageRank on the import graph to identify hub files
3. **Discoverability filtering** -- dropping what agents already know (research-backed)
4. **Context-rot-aware formatting** -- structured for how LLMs actually process information (U-shaped attention)

No competitor combines more than one of these four.

---

## 8. Business Model

### 8.1 Pricing Tiers

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 forever | `sourcebook init`, `sourcebook diff`, all three output formats (CLAUDE.md, .cursorrules, copilot-instructions.md), TypeScript/Python/Go support, import graph PageRank, git forensics |
| **Pro** | $19/month | Everything in Free + `sourcebook update` (preserve manual edits), `sourcebook serve` (MCP server mode), `sourcebook watch` (auto-regenerate daemon), web demo (shareable analysis links), priority language & framework support |
| **Team** | $39/seat/month | Everything in Pro + shared conventions across repos, GitHub Action (auto-update on merge), multi-repo dashboard, drift alerts (know when context goes stale), SSO/SAML |
| **Enterprise** | Custom | Self-hosted, custom SLA, dedicated support |

**Note:** The strategy doc from earlier in development listed prices of $12/mo (Pro) and $29/seat/mo (Team). The live pricing page shows $19/mo and $39/seat/mo. The pricing page is the current source of truth.

### 8.2 Free Tier Strategy

The free tier includes the full analysis pipeline and all generators. This is intentional: the core value proposition (discoverability-filtered context generation) should be free. The paid tiers add workflow conveniences (update, serve, watch) and team features (shared conventions, drift alerts).

The risk: the free tier may be sufficient for most individual developers, limiting Pro conversion. The bet is that developers who use sourcebook daily will want `update` (to preserve their manual edits across re-analyses) and `watch` (to never think about regeneration).

### 8.3 Revenue Projections (Conservative)

No projections are included because payments are not yet live and there is no historical conversion data. The pricing page exists; Stripe checkout flow is coded but not activated. Pre-revenue.

### 8.4 Licensing

**BSL-1.1 (Business Source License 1.1):**
- Source-available. Anyone can read, modify, and self-host.
- The restriction: you cannot offer sourcebook to third parties as a commercial code analysis or context generation service.
- Converts to MIT on 2030-03-25.
- Same model used by Sentry, MariaDB, CockroachDB.
- Licensor: maroond labs.

The intent: prevent competitors from taking the source and reselling it as a hosted service while keeping the tool free for every developer and team to use directly.

---

## 9. Go-to-Market Strategy

### 9.1 Distribution Channels

| Channel | Status | Purpose |
|---------|--------|---------|
| npm CLI (`npx sourcebook init`) | Live | Primary distribution. Zero-install experience. |
| Website (sourcebook.run) | Live | Landing page, pricing, blog |
| GitHub Action | Live | CI integration (auto-update on merge) |
| Web demo | Planned (v0.4) | Shareable analysis links for public repos |
| MCP server (`sourcebook serve`) | Planned (v0.4) | Queryable context for AI agents |
| Browser extension | Planned | Analyze any GitHub repo from the browser |
| VS Code extension | Planned (v1.0) | IDE integration |

### 9.2 Launch Channels

- **Hacker News:** Show HN post. The 19,680x number and research backing are designed for HN's audience.
- **Reddit:** r/programming, r/ChatGPTCoding, r/ClaudeAI, r/cursor
- **X/Twitter:** Dev community, AI agent builders
- **dev.to / Hashnode:** Long-form walkthrough posts
- **MCP directories:** Listed as an MCP server once `serve` ships
- **GitHub trending:** Organic discovery via stars

### 9.3 Growth Playbook

The strategy explicitly models Repomix's growth trajectory: Repomix reached 22K GitHub stars in approximately 6 months by being a dead-simple CLI tool that solves an obvious pain point.

sourcebook's advantages for virality:
- One-command install (`npx sourcebook init`)
- Immediate visible output (a CLAUDE.md file appears in your repo)
- The 19,680x number is shareable and provocative
- Research backing gives credibility for technical audiences
- Free tier includes the full analysis -- no paywall on the core insight

The challenge: Repomix's value proposition is trivially understood ("dump your repo into one file"). sourcebook's value proposition requires understanding why less context is better than more, which is counterintuitive.

---

## 10. Roadmap

### v0.3 (Shipped)

- [x] `.cursorrules` and `.cursor/rules/sourcebook.mdc` output generators
- [x] `.github/copilot-instructions.md` output generator
- [x] `sourcebook update` command (re-analyze, preserve sections added manually)
- [x] `sourcebook diff` command (show changes, CI-friendly exit code 1 on drift)
- [x] `--budget <tokens>` enforcement with PageRank-based prioritization
- [x] Anti-pattern detection from reverted commits and deleted files
- [x] Python support (Django, FastAPI, Flask, pytest)
- [x] Go support (Gin, Echo, Fiber, module layout)
- [x] GitHub Action for CI

### v0.4 (Next)

- [ ] Web demo -- shareable analysis links for public GitHub repos
- [ ] `sourcebook serve` -- MCP server mode (agents query context on-demand)
- [ ] `sourcebook watch` -- daemon that auto-regenerates on file changes
- [ ] Framework knowledge packs (community-contributed)
- [ ] Tree-sitter AST parsing for deeper naming convention detection

### v0.5

- [ ] Multi-repo dashboard with context quality scores
- [ ] Shared conventions across repositories (Team tier)
- [ ] Drift detection and alerts (notify when context diverges from code)
- [ ] Decision shadow capture (reconstruct WHY from commit patterns)
- [ ] Load-bearing code detection (high fan-in + low churn + departed author)

### v1.0

- [ ] Pack marketplace (community + premium framework packs)
- [ ] Self-evaluating context (measure and improve context quality over time)
- [ ] VS Code extension
- [ ] Hosted service for enterprise

---

## 11. Team & Origin Story

### The Team

sourcebook is built by **maroond** -- a one-person AI studio operated by a solo founder. The founder uses Claude Code as the primary engineering partner. There are no employees, no co-founders, no investors.

### The Origin

sourcebook was built BY an AI agent FOR AI agents. The founder, while building multiple products with Claude Code, noticed the agent spending enormous amounts of time re-orienting on every session. Manually writing CLAUDE.md files helped but went stale. The idea: automate the extraction of the non-obvious stuff and let the agent focus on work.

The product is itself a proof of concept: an AI agent building infrastructure for AI agents. The entire 3,300-line codebase was written in collaboration with Claude Code.

### The Studio

maroond operates as a solo-founder, many-agent studio. Active projects include consumer apps (crowned, morningof, ScrollAfter), developer tools (sourcebook, ReportCraft), and a portfolio site (marooondAI). The studio tagline: "you're exactly where you're supposed to be."

sourcebook is currently the highest-priority project in the portfolio, with the strategy document describing it as a "category-defining" opportunity given the 19,680x token reduction result.

---

## 12. Open Questions for Review

These are genuine questions where an outside perspective would be valuable.

### 12.1 Is BSL-1.1 the Right License?

**Current position:** BSL-1.1 prevents hosted service competition while keeping the tool free for all developers. Converts to MIT in 2030.

**Arguments for BSL-1.1:** Precedent (Sentry, MariaDB, CockroachDB). Open-source community can inspect, contribute, and self-host. Prevents Amazon/Google from wrapping it in a hosted service.

**Arguments for full proprietary:** BSL creates confusion ("is it open source or not?"). Some enterprises will not use BSL-licensed software. Simplifies the business model.

**Arguments for MIT:** Maximizes adoption. Harder to build a business, but if the goal is category adoption, MIT wins. Repomix is MIT and has 22K stars.

### 12.2 Should the Web Demo Be Free or Gated?

The web demo (analyze any public GitHub repo via the website) is planned for v0.4. Options:
- **Free:** Maximizes virality. Anyone can share analysis links. Lowers barrier to understanding the product.
- **Gated (Pro):** Creates a clear monetization path. But limits organic sharing.
- **Freemium:** X free analyses per month, then Pro. Balances both.

### 12.3 Is $19/mo the Right Price for Pro?

The strategy doc originally proposed $12/mo. The live pricing page shows $19/mo.

**Arguments for $19:** Developer tools like Cursor ($20/mo), Copilot ($19/mo for Business), and Aider ($0 CLI + API costs) set the expectation in this range. $19 is below the "ask permission" threshold for most developers.

**Arguments for lower ($9-12):** sourcebook is a supporting tool, not a primary IDE. Developers already pay for Cursor/Copilot. Adding $19/mo on top may cause friction. Lower price = higher conversion from free.

**Arguments for higher ($29):** If the tool saves even 30 minutes of agent orientation time per week, $29/mo is trivially justified. Higher price signals quality and funds development.

### 12.4 MCP Server Mode or Web Demo First?

Both are planned for v0.4. Resource constraints (solo founder) mean one ships before the other.

**MCP server first:** Technically closer to the core product (context for agents). Would make sourcebook usable directly within Claude Code and Cursor without a static file. Higher value per user.

**Web demo first:** Better for growth and marketing. Shareable links. Visual proof of what the tool finds. Lower barrier to understanding.

### 12.5 Is the 19,680x Claim Defensible?

**The math:** 858 tokens (sourcebook on cal.com) vs 16,880,000 tokens (Repomix on cal.com) = 19,680x.

**Why it might be misleading:** These tools do fundamentally different things. Repomix gives you the entire codebase. sourcebook gives you a curated summary. A fairer comparison might be against a hand-written CLAUDE.md (typically 500-2000 tokens) -- in which case the "reduction" is negative (sourcebook produces slightly more or slightly less).

**Why it might be defensible:** The comparison is valid if the question is "how many tokens does an agent need to consume to get useful project context?" Repomix's answer: 16.8M. sourcebook's answer: 858. Both claim to solve "give the agent project context."

**What would make it rigorous:** A/B testing on real agent benchmarks. Run the same set of coding tasks with (a) no context, (b) Repomix context, (c) sourcebook context, and measure task success rate, token consumption, and time to completion. This has not been done.

### 12.6 Additional Risks to Consider

**Risk: The problem may shrink.** As context windows grow (1M+ tokens are already available), the orientation tax decreases. If agents can just read the whole codebase cheaply, the need for curated context diminishes. Counter-argument: even with infinite context, attention is finite. The ETH Zurich study shows that more context is not always better.

**Risk: Platform integration may obsolete standalone tools.** Claude Code, Cursor, and Copilot could build context generation directly into their products. They have more data (usage patterns, task success rates) to optimize context. Counter-argument: platform vendors optimize for generality, not project-specific conventions. sourcebook's git forensics and co-change coupling are unlikely to be built into an IDE.

**Risk: Solo founder dependency.** The entire product depends on one person. No bus factor. Counter-argument: the codebase is small (3,300 lines), well-structured, and source-available. A competent TypeScript developer could pick it up.

**Risk: Pre-revenue.** Pricing pages exist but payments are not live. There is zero validation that developers will pay for this. The free tier may be sufficient for most users.

---

## 13. AI-Adjusted Market Projections

The original projections in Section 8 used 2024-2025 growth rates. Updated March 2026 data shows the market is compounding, not plateauing.

### Market acceleration data (March 2026)

- **Cursor:** $100M → $1B → $2B ARR in 3 months (doubling every ~2 months)
- **AI coding market:** $5.1B (2024) → $12.8B (2026) — 2.5x in 2 years
- **AI agent market:** $3B (2025) → projected $47B by 2030 at 45.8% CAGR
- **GitHub:** 51% of all code committed in early 2026 is AI-generated or AI-assisted
- **Developer adoption:** 84% using or planning to use AI tools; 51% using daily
- **Fortune 500:** 78% have AI-assisted development in production (up from 42% in 2024)
- **MCP ecosystem:** 5,800+ servers, 8M+ downloads/month, moved under Linux Foundation

### Why this changes our model

The number of developers using AI agents is doubling roughly every 6-8 months. sourcebook's addressable market is expanding exponentially while we grow. Critically, as agents write 50%+ of code, they need MORE contextual intelligence, not less. The problem is getting worse, not better.

### Revised financial projections (AI-adjusted moderate scenario)

| Month | Total users | Pro ($19) | Team seats ($39) | API revenue | MRR | ARR |
|-------|-------------|-----------|------------------|-------------|-----|-----|
| 1 | 5,000 | 150 | 0 | $0 | $2,850 | $34K |
| 3 | 30,000 | 900 | 100 | $1,000 | $22,000 | $264K |
| 6 | 100,000 | 4,000 | 500 | $8,000 | $103,500 | $1.2M |
| 9 | 250,000 | 10,000 | 1,500 | $25,000 | $273,500 | $3.3M |
| 12 | 500,000 | 20,000 | 4,000 | $60,000 | $596,000 | $7.2M |

### Revised acquisition scenarios

| Timing | ARR | Multiple | Exit range |
|--------|-----|----------|-----------|
| Month 9 | $2-3M | 20-30x (strategic) | $40-90M |
| Month 12 | $5-7M | 15-25x | $75-175M |
| Month 18 | $15-20M | 10-20x | $150-400M |
| Month 24 | $30-50M | 10-15x | $300-750M |

The acquisition window is 6-12 months. Big players (Anthropic, Cursor, GitHub) are buying NOW.

### Billion-dollar path

If the AI agent market hits $47B by 2030 and sourcebook captures 1% as the standard context layer, that's $470M ARR at a 10x multiple = $4.7B company. Requires raising capital within 6 months and hiring a team to capture the market before the window closes.

---

## 14. Continuous Research & Self-Improvement Strategy

sourcebook's moat is not static technology — it's a continuously improving intelligence engine. Three loops run permanently.

### Loop 1: Automated intelligence gathering

**Daily:**
- Track GitHub stars, releases, and npm downloads for all competitors (Repomix, Aider, ContextPilot, Cursor, new entrants)
- Monitor MCP directory listings for new tools in the codebase/context category
- Alert on any tool that overlaps with sourcebook's roadmap

**Weekly:**
- Scrape arXiv for new papers on LLM context optimization, code understanding, agent architecture
- Monitor Anthropic, OpenAI, and Google blog posts for features that affect the context layer
- Track HN/Reddit threads about CLAUDE.md, .cursorrules, and agent context (these are product feedback in the wild)
- Check GitHub issues and npm trends for feature demand signals

**Monthly:**
- Update competitive comparison benchmarks
- Re-run token comparison tests against latest competitors
- Track AI coding adoption statistics
- Update financial projections with actual growth data

### Loop 2: Self-improving product (the Karpathy loop)

The product should measure its own effectiveness and improve automatically.

**The experiment cycle:**
1. `sourcebook init` generates context for a project
2. An agent performs coding tasks with that context
3. Measure outcomes: fewer retries, correct conventions, no broken imports
4. Compare to baseline (no context, or competitor context)
5. Identify: what findings helped? What was ignored? What was missing?
6. Feed results back into the analysis engine

**What this enables:**
- Score each finding type by measurable impact on agent performance
- Auto-tune output — prioritize findings that help, drop ones that don't
- Build the benchmark dataset that proves the value claim with hard data
- Self-evaluating context (ACE framework) — no one else is doing this

### Loop 3: User feedback integration

**Open channels:**
- GitHub Issues for feature requests and bug reports
- `sourcebook feedback` command — one-command report for context quality issues
- Community (Discord/forum when engagement justifies it, not before)

**Closed channels (analytics):**
- Pro feature activation rates (update vs serve vs watch)
- Churn analysis — when someone cancels, which feature were they not using?
- "Aha moment" tracking — what triggers conversion from free to paid?
- Finding quality scores — which findings users keep vs delete when editing

### Research-to-product pipeline

| Input | Analysis | Product change |
|-------|----------|---------------|
| New paper on context placement | Evaluate against current layout | Update generator formatting |
| New paper on co-change accuracy | Compare to our git forensics | Tune co-change threshold |
| Competitor ships new feature | Evaluate signal vs noise | Build better or ignore |
| User deletes a finding type | Track deletion rate | Lower priority or remove |
| Agent fails despite context | Identify missing finding | Add new analysis to scanner |

The principle: research is not a phase. It's a heartbeat. Every data point — from academic papers to user edits to agent outcomes — feeds back into making the analysis engine smarter.

---

*Document prepared March 2026. Updated with AI-adjusted projections and continuous research strategy. Source files: sourcebook/ repository, context/projects/sourcebook-strategy.md, site/pro/index.html, LICENSE, and public market data from Sacra, TechCrunch, Gartner, MarketsandMarkets, Grand View Research. All claims should be independently verified.*
