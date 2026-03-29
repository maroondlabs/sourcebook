# sourcebook — Competitor Intelligence Log

Automated daily tracking of competitive landscape.

---

## 2026-03-26

### GitHub Stars

| Repo | Stars | Forks |
|---|---|---|
| maroondlabs/sourcebook | 0 | 0 |
| yamadashy/repomix | 22,660 | 1,054 |
| Aider-AI/aider | 42,398 | 4,071 |

Repomix remains the primary incumbent benchmark. Gap is expected at this stage.

### New Repos (Last 48h)

**`claude-md` topic (4 new repos):**
- `buildingopen/claude-setup` — Production-grade CLAUDE.md templates + hooks + skills. Config kit, not a generator. Complementary.
- `awrshift/claude-starter-kit` — OS-style starter kit for Claude Code agents. Not a generator.
- `rdrsss/ctxfr` — "Context fragment routing for agentic coding." No stars, no code yet. Watch.
- `rpatino-cw/claude-response-hud` — HUD paste for CLAUDE.md. Niche novelty.

**`cursor-rules` topic (2 new repos):**
- `TashanGKD/cognitive-os` and `tashan-cursor-skills` — Chinese-language OS-layer configs. Not competitive.

**`ai-context` topic (2 new repos):**
- `cortexkit/opencode-magic-context` — "Cache-aware infinite context, cross-session memory, background history compression" for OpenCode (OSS Claude Code fork). *31 minutes old at time of research.* Adjacent problem space — watch.
- `BlackRoad-OS-Inc/operator` — Enterprise OS-layer context. Concept-aligned with sourcebook but static config.

**Signal:** The `claude-md` topic is exploding with static config repos and starter kits. These are not generators — they are demand signal for what sourcebook serves. The generator/automation angle remains relatively uncrowded.

### npm (Last 7 Days)

- **repomix 1.13.0** (2026-03-23) — Active shipping. Also published `@repomix/tree-sitter-wasms` — they are moving toward AST-level parsing. If they ship convention detection, the gap with sourcebook narrows. Watch their changelog closely.
- **gitnexus 1.4.8** (2026-03-23) — "Graph-powered code intelligence for AI agents. Index any codebase, query via MCP or CLI." Most competitive-looking new arrival this week. v1.4.8 suggests it's been shipping a while. **Needs deeper investigation.**
- **@anthropic-ai/claude-agent-sdk 0.2.84** (2026-03-26) — SDK shipping fast. More agents = more potential sourcebook customers.
- **claude-md-lint 1.2.0** — Linter/scorer for CLAUDE.md architecture. Could be complementary.

### Platform Announcements

- **Cursor (2026-03-25): Self-hosted Cloud Agents** — Enterprises can now run Cursor agents on internal infrastructure. Tailwind for sourcebook's open-core/BSL pivot — enterprise self-hosted agents need better codebase context files.
- **Anthropic:** No feature announcements. SDK version bumps only.
- **OpenAI:** No intelligence gathered (403 on news page).

### Flags for Founder

🚨 **gitnexus** — "Graph-powered code intelligence for AI agents" with MCP + CLI. v1.4.8, actively shipping. Most direct competitive posture seen this week. Review their GitHub and positioning before next sourcebook marketing push.

⚠️ **repomix + tree-sitter** — Repomix is moving toward AST parsing. Timeline unknown, but if they ship convention detection, the differentiation story gets harder. The 19,680x token reduction claim remains sourcebook's strongest moat — lean into it now while the gap is clear.

✅ **Cursor enterprise push** — Validates the BSL open-core pivot timing. No action needed, good signal.

---

## 2026-03-27

### GitHub Stars

| Repo | Stars | Forks |
|---|---|---|
| maroondlabs/sourcebook | 0 | 0 |
| yamadashy/repomix | 22,685 (+25) | 1,055 (+1) |
| Aider-AI/aider | 42,440 (+42) | 4,079 (+8) |

Repomix added 25 stars overnight. Aider added 42 — both growing steadily. sourcebook at 0 (repo is 2 days old).

### New Repos (Last 24h)

**`claude-md` topic (4 new repos — high activity day):**
- `lunacompsia-oss/claudecheck` — "Lint and validate your CLAUDE.md — catch mistakes before Claude Code does." Also ships `claudecheck-web` as a free online validator. GitHub Action-based. Adjacent to sourcebook but validation/linting, not generation. **Complementary, could be a pipeline partner.**
- `M3phist0s/ai-ready` — "Score your repo's AI-readiness (0-100) and auto-generate CLAUDE.md, .cursorrules, and copilot-instructions.md." Multi-IDE context file generation. **Direct overlap with sourcebook's core function.** Watch.
- `M3phist0s/promptkit` — "Premium AI Coding Prompt Library for Claude Code, Cursor & Copilot." Not a generator — curated prompts. Adjacent.

**`cursor-rules`, `ai-context`, `codebase-context` topics:** No new repos in last 24h.

**Signal:** The `claude-md` ecosystem is continuing to fill in around generators and validators. `ai-ready` is the most direct competitive signal today — multi-file output targeting the same customer (developers who want context files auto-generated). Not at feature parity with sourcebook (no token reduction / convention inference), but worth watching velocity.

### npm (Last 24h)

- **gitnexus 1.4.10** (2026-03-27) — "Graph-powered code intelligence for AI agents. Index any codebase, query via MCP or CLI." Active shipping — went from 1.4.8 yesterday to 1.4.10 today (2 patch bumps in 24h). **Most actively shipping direct competitor this week.**
- **@anthropic-ai/claude-agent-sdk 0.2.85** (2026-03-26) — Version bump, published yesterday. SDK cadence remains fast. Agentic coding tooling ecosystem expanding.

### Platform Announcements

- **Anthropic (2026-03-09):** Launched multi-agent **Code Review tool inside Claude Code** — parallel agents examine codebases from different perspectives, aggregated by a final agent. Validates the direction: AI agents need structured codebase context to do useful review work. Tailwind for sourcebook.
- **Anthropic:** Claude Opus 4.6 released with improved codebase navigation and self-debugging. Claude Code run-rate revenue surpassed $2.5B since launch. Agentic coding trends report: Claude Code now authors 4% of GitHub public commits, projected 20%+ by end of 2026. Massive macro tailwind.
- **OpenAI Codex:** Now uses **AGENTS.md** as primary codebase context mechanism — explicitly analogous to CLAUDE.md. OpenAI's own framing: "context management is a matter of preparing your repo and configuration files, not crafting perfect prompts." This is sourcebook's exact thesis, validated by OpenAI. Strong.
- **Cursor:** No new announcements in last 24h. Shared rules (team-wide) and CLI `/rules` command shipped earlier in Jan — still expanding the context file paradigm.

### Flags for Founder

🚨 **gitnexus shipping at 2 patch bumps/day** — v1.4.8 → v1.4.10 in 24h. Most actively shipping competitor in the MCP/CLI codebase intelligence space. Needs a deeper look at their actual feature set vs. sourcebook's convention-detection angle.

⚠️ **M3phist0s/ai-ready** — "Auto-generate CLAUDE.md, .cursorrules, and copilot-instructions.md" is a direct value prop overlap. Currently 0 stars, brand new — check again in a week for traction.

✅ **OpenAI Codex AGENTS.md** — OpenAI independently arrived at "prepare your repo with context files" as the right model. This is the strongest third-party validation of sourcebook's thesis to date. Use in positioning/marketing: the whole industry is converging on structured context files — sourcebook automates the generation.

✅ **Anthropic 4% of GitHub commits** → projected 20% — more AI agents = more demand for quality context files. The macro is accelerating.

---

## 2026-03-28

### GitHub Stars

| Repo | Stars | Forks |
|---|---|---|
| maroondlabs/sourcebook | 0 | 0 |
| yamadashy/repomix | 22,690 (+5) | 1,056 (+1) |
| Aider-AI/aider | 42,467 (+27) | 4,086 (+7) |

Repomix and Aider both growing at normal pace. sourcebook repo is 3 days old — star gap expected.

### New Repos (Last 24h)

**`claude-md` topic (1 new repo):**
- `Samarth0211/claude-md-examples` — "Real-world CLAUDE.md examples for Next.js, FastAPI, Django, Go, React Native." Links to `clskills.in/claude-md-generator` as a free generator. 2 stars at time of scan. Example repo, not a generator itself — but the external generator link is worth checking. Demand signal continues.

**`cursor-rules` topic:** 0 new repos.

**`ai-context` topic (1 new repo):**
- `micilini/AITokenSaver` — "Windows desktop app that indexes your codebase and builds optimized AI context — so you send exactly what the model needs." C# / WPF / .NET 8. Desktop-native, Windows-only. Different distribution model than sourcebook's CLI/npm approach. Niche overlap.

**`codebase-context` topic:** 0 new repos.

**Signal:** Quiet day for new repos — lower volume than the prior two days. The `claude-md` ecosystem is consolidating around examples/templates rather than new tooling. Generator tooling remains thin.

### npm (Last 24h)

- **@anthropic-ai/claude-agent-sdk 0.2.86** (2026-03-27) — Bumped from 0.2.85. SDK continues daily version cadence. More agentic infra shipping = more potential sourcebook users.
- **gitnexus 1.4.10** — No new bump since yesterday (same version). May have stabilized after the rapid 1.4.8 → 1.4.10 run.
- **@probelabs/probe 0.6.0-rc312** (2026-03-27) — "Node.js wrapper for the probe code search tool." RC still, active shipping.
- **cursor-rules-generator-mcp 3.4.0** — Last published December 2025, not new. Still ranking in search.

### Platform Announcements

- **Cursor Glass (March 2026):** Unified workspace for agents, repos, and cloud tasks. **Context Engine** introduced — claims to process codebases with 400K+ files via semantic dependency analysis. This is Cursor moving directly into structured context territory. If it automates context extraction, that's a potential moat challenge. Watch how it handles convention inference vs. raw file indexing.
- **Cursor Composer 2 (~March 21):** Code-only model, 61.3 on CursorBench. Positioned as a model-layer play, not directly competitive with sourcebook — but more capable agents need better context, which is tailwind.
- **Anthropic:** No new codebase intelligence announcements. SDK version bumps only.
- **OpenAI:** No new announcements isolated today.

### Flags for Founder

⚠️ **Cursor Context Engine** — "Processes codebases with 400K+ files via semantic dependency analysis" is the most significant competitive signal this week. If Cursor Glass ships automated convention extraction, they could subsume part of sourcebook's value prop for Cursor users. Key question: does it generate structured context files (like CLAUDE.md) or just do live retrieval? Needs investigation before next sourcebook marketing push.

🔍 **clskills.in/claude-md-generator** — Linked from a new GitHub examples repo. Unknown product, free tier, targeting the same user. Worth a 5-minute look to understand scope and quality vs. sourcebook.

✅ **Ecosystem quiet day** — No new direct generators shipped. The generator angle remains relatively uncluttered. Good window to push sourcebook marketing and capture organic search before the space fills in further.

---

