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

