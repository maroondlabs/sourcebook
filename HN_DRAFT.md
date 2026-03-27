# HN Launch Post — Final Draft

**Title:** Show HN: sourcebook – give your AI agents the project knowledge they keep missing

---

AI can read your code. It still doesn't know how your project works.

I built sourcebook because I kept watching coding agents make the same mistakes — wrong conventions, touching fragile files, suggesting approaches that were already tried and reverted. The agents weren't dumb. They just didn't have the project knowledge my team carries around in our heads.

Most context tools solve this by dumping the entire repo into one big file. sourcebook takes the opposite approach: it captures only what the agent can't figure out by reading the code alone.

`npx sourcebook init` analyzes your codebase across four dimensions:

- **Import graph + PageRank** — identifies the hub files with the widest blast radius (not just the biggest files)
- **Git forensics** — reverted commits ("don't do this" signals), co-change coupling (files that always change together but have no import relationship), fragile files (code that was hard to get right)
- **Convention + pattern detection** — naming patterns, export style, dominant i18n hooks, auth middleware, router patterns, database/ORM usage, styling approach
- **Context-rot-aware formatting** — critical constraints at the top and bottom (where LLMs pay the most attention), reference info in the middle

Outputs to CLAUDE.md, .cursorrules, copilot-instructions.md, and AGENTS.md.

We benchmarked it on real GitHub issues across cal.com (10K+ files), pydantic, and hono. Honest results: handwritten developer briefs were the strongest baseline. sourcebook is now within ~6% of handwritten speed on convention-heavy app repos while producing broader fixes. On one task it was actually faster than the handwritten brief. On library repos it improved significantly between versions but still has ground to cover.

The key insight from the benchmark: structural intelligence (hub files, circular deps) is necessary but not sufficient. Agents also need dominant usage patterns — "use `useLocale()` for i18n, add keys in `common.json`, integrations live under `packages/app-store/`." That's what humans naturally encode in handoff notes, and what sourcebook now detects automatically.

No API keys. No LLM dependency. Everything runs locally in under 3 seconds. BSL-1.1 licensed (free CLI, paid update/serve/team features).

https://github.com/maroondlabs/sourcebook

https://sourcebook.run

---

# X Launch Thread

**Tweet 1 (hook):**
repomix gives the model your codebase.
sourcebook gives it your project knowledge.

one command. captures the conventions, patterns, traps, and history your coding agents keep missing.

npx sourcebook init

sourcebook.run

**Tweet 2 (what it does):**
what sourcebook actually finds:
- hub files that break everything when touched
- reverted commits (approaches that were tried and failed)
- files that always change together (invisible dependencies)
- dominant patterns: "use this hook, put keys here, don't edit that file"

~800 tokens of what matters. not 15M tokens of everything.

**Tweet 3 (benchmark):**
we benchmarked it honestly.

handwritten developer briefs won at first. so we used the benchmark to improve:
- v0.3: structural intelligence
- v0.4: added dominant pattern detection
- v0.5: within 6% of handwritten speed, 36% broader fixes

the product gets better because the benchmark tells us where it's weak.

**Tweet 4 (CTA):**
free cli. works with claude code, cursor, copilot, and codex.

generates CLAUDE.md, .cursorrules, copilot-instructions.md, and AGENTS.md from one command.

no api keys. no llm. runs locally in under 3 seconds.

github.com/maroondlabs/sourcebook
