# Show HN: sourcebook -- We benchmarked AI context files against handwritten briefs. Here's what actually helps.

We started by trying to figure out why AI agents feel unreliable on real codebases. The obvious problems are infrastructure -- auth, gateways, observability. But what we kept seeing was something earlier: agents fail before they even start. They spend most of their time orienting, and they get it wrong.

That led us to build sourcebook -- a CLI that extracts the project knowledge agents can't figure out by reading code alone. Import graph PageRank, git forensics, dominant pattern detection, filtered through a discoverability test (if the agent can infer it from code, drop it). On cal.com (10,453 files), it produces 858 tokens of non-discoverable context.

Then we benchmarked it honestly. Four conditions -- no context, handwritten brief, Repomix, sourcebook -- on real closed GitHub issues across cal.com, pydantic, and hono. Same model (Claude Sonnet), same prompt, same turns.

**The handwritten brief won initially.** A human who understands a project encodes workflow knowledge that tools struggle to match: "use `useLocale()` + `t("key")` for i18n, keys go in `packages/i18n/locales/en/common.json`." That's a recipe. sourcebook v0.3 had structural intelligence (hub files, circular deps, co-change coupling) but not workflow recipes.

**What we learned and changed:**

- Added dominant pattern detection (v0.4.1) -- finds the recurring code patterns that define how a project works
- Added repo-mode detection (v0.5) -- adjusts context for apps vs. libraries vs. monorepos
- Added quick-reference handoff -- 30-second orientation at the top

**After the changes:** sourcebook v0.5 closed to within 6% of handwritten speed on cal.com while producing 36% broader patches. On one task, sourcebook was actually faster than handwritten (113s vs. 115s).

**What automated analysis catches that handwritten briefs miss:**

- Hub file: types.ts imported by 183 files
- 14 generated files -- do NOT edit directly
- Co-change coupling: auth/provider.ts ↔ middleware/session.ts (88% correlation)
- Fragile file: openapi.json -- 5 edits in one week
- 1,907 dead code candidates

**Honest limitations:** Small benchmark (4 tasks, 3 repos). Correctness scoring still evolving. Language coverage is TS/Python/Go only.

The full writeup with all benchmark data and charts: https://sourcebook.run/blog/we-benchmarked-ai-context-files.html

No API keys. No LLM calls. Everything runs locally in under 3 seconds.

```bash
npx sourcebook init
```

https://sourcebook.run | https://github.com/maroondlabs/sourcebook
