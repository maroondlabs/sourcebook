# Title Options

1. **Your AI Agent Can Read Your Code. It Still Doesn't Know How Your Project Works.**
2. **The Missing Layer: Why Repo Dumps Fail and Handwritten Briefs Win**
3. **We Benchmarked AI Context Files on Real GitHub Issues. Handwritten Briefs Won. Then We Caught Up.**

# Subtitle

How we tested four context strategies on real codebases, lost to a human-written brief, and built the tool that closed the gap.

---

## AI can read your code. It still doesn't know how your project works.

Point an AI coding agent at a 10,000-file monorepo and tell it to fix a bug. It will read files. Lots of files. It will trace imports, scan directory trees, and build a mental model of the codebase from raw source. Then it will produce a patch that technically compiles but misses the project's i18n conventions, edits a generated file that gets overwritten on build, and ignores the co-change coupling between two files that always need to move together.

The agent had access to every file. It still didn't know how the project works.

This is the problem we set out to understand with sourcebook -- and the results surprised us enough that we decided to write them up properly.

---

## The orientation tax

AI coding agents spend most of their token budget on orientation. Reading files, understanding structure, figuring out where things live. By the time they start reasoning about the actual task, the context window is already crowded with file contents that don't help.

This isn't a model problem. It's a knowledge problem. There's a difference between code (what exists in the repo) and project knowledge (how the repo actually works). Conventions. Dominant patterns. Which files are fragile. Where changes tend to go. What was tried and reverted. Which files always change together even though they live in different directories.

The missing layer is project knowledge.

---

## "More context" is not "better context"

The intuitive solution is to give the agent more information. Dump the whole repo. Concatenate everything. Let the model sort it out.

This actively makes things worse. The ETH Zurich AGENTS.md study (February 2025) tested auto-generated context files on real agent benchmarks and found that files restating obvious information -- tech stack, directory trees, basic framework detection -- degraded agent performance by 2-3% compared to no context at all. The mechanism is straightforward: obvious context competes for attention with task-relevant information. Every token spent confirming that the project uses TypeScript is a token not available for understanding the i18n conventions the agent actually needs.

The strongest context is not the biggest context.

---

## The experiment

We wanted to know what actually helps. Not in theory. On real issues, with real patches, measured against real outcomes.

### Setup

We pulled closed GitHub issues with merged PRs from three repos:

- **cal.com** -- TypeScript monorepo, 10,453 files. Enterprise scheduling platform.
- **pydantic** -- Python library. Core data validation.
- **hono** -- TypeScript web framework. Minimal, fast.

We tested four context conditions:

1. **None** -- no context file at all. Just the agent, the issue description, and the codebase.
2. **Handwritten** -- a CLAUDE.md written by a human who understands the project. The kind of brief a senior developer would leave for a new team member.
3. **Repomix** -- the repo concatenated into a single file. This is the current market default at 22K GitHub stars.
4. **sourcebook** -- our tool, tested at v0.3 and v0.5.

Same model (Claude Sonnet) for every run. Same prompt template. Same maximum turn count. We measured wall-clock time, files touched, and lines changed -- then manually reviewed each patch for correctness and completeness.

### What we measured

We're not claiming a single magic number. Agent benchmarks are hard, and anyone who tells you they've solved evaluation is selling something. We tracked:

- **Time to completion** -- wall-clock seconds from prompt to final patch
- **Patch scope** -- files touched and lines changed
- **Correctness** -- manual review of whether the patch actually solves the issue
- **Completeness** -- whether the fix covers all instances (e.g., all untranslated strings, not just the first one found)

---

## What happened

[CHART: Outcome matrix -- table with rows=tasks, columns=conditions (none / handwritten / repomix / sourcebook v0.3 / sourcebook v0.5), cells showing time(s) / files / lines]

### cal.com #27298 -- OAuth untranslated strings

| Condition | Time | Files | Lines |
|---|---|---|---|
| None | 241s | 5 | 381 |
| Handwritten | 120s | 3 | 321 |
| Repomix | 176s | 3 | 283 |
| sourcebook v0.3 | 140s | 3 | 350 |
| sourcebook v0.5 | 136s | 6 | 469 |

Handwritten was fastest by a wide margin. The human brief encoded the exact i18n workflow: use `useLocale()`, call `t("key")`, add translation keys to `packages/i18n/locales/en/common.json`. The agent didn't have to discover any of this -- it was handed the recipe.

sourcebook v0.3 was close on time but produced a narrower fix. v0.5 was 3% slower than v0.3 but touched 6 files and produced 469 lines -- a 36% broader patch than the handwritten condition. It found instances the handwritten brief didn't flag.

### cal.com #27907 -- PayPal untranslated strings

| Condition | Time | Files | Lines |
|---|---|---|---|
| None | 94s | 5 | 314 |
| Handwritten | 115s | 5 | 362 |
| sourcebook v0.3 | 103s | 5 | 390 |
| sourcebook v0.5 | 113s | 6 | 458 |

This one was interesting: no context was actually the fastest. The task was straightforward enough that orientation overhead was low. But the no-context condition produced a narrower fix.

More notable: sourcebook v0.5 (113s) was faster than the handwritten brief (115s). First time we saw that. And it produced a broader patch -- 6 files, 458 lines vs. 5 files, 362 lines.

### hono #4806 -- request body caching

| Condition | Time | Files | Lines |
|---|---|---|---|
| None | 253s | 1 | 31 |
| Handwritten | 323s | 2 | 86 |
| sourcebook v0.5 | 267s | 2 | 101 |

Different story. The handwritten brief was slowest here. This task was deep enough into framework internals that the extra context sent the agent down a more thorough path -- which took longer but produced a more complete fix (86 lines vs. 31 lines for no-context). sourcebook split the difference: faster than handwritten, more complete than no-context.

### pydantic #12715 -- JSON schema

| Condition | Time | Files | Lines |
|---|---|---|---|
| None | 312s | 1 | 99 |
| Handwritten | 180s | 2 | 83 |
| sourcebook v0.5 | 308s | 2 | 117 |

Handwritten dominated on time. sourcebook was slow here -- almost as slow as no context. In review, we discovered this was partly a benchmark scoring issue: sourcebook correctly identified the issue was already fixed in the latest code. A correct no-op looks like failure in a naive benchmark. We're still sorting out how to score "correctly refused to change code" as distinct from "failed to change code."

[CHART: Per-task comparison -- grouped bar chart, one group per task, bars for each condition showing time in seconds]

---

## Why handwritten briefs won (at first)

Handwritten briefs are a monster baseline.

This is the part nobody talks about when they're pitching context tools. A human who understands a project encodes something remarkably dense in a few hundred words: not just what the code looks like, but how the project works. The workflow. The conventions. The "when you need to do X, you go here and use this pattern" knowledge that takes weeks to absorb from code alone.

[DIAGRAM: Handwritten vs sourcebook insight comparison -- two columns]

**What the handwritten brief encoded:**
- `useLocale()` + `t("key")` for all user-facing strings
- Translation keys live in `packages/i18n/locales/en/common.json`
- PayPal-specific strings follow the `paypal_setup_*` naming convention
- Auth flow touches `packages/features/auth/` and `packages/trpc/server/routers/viewer/auth/`
- "Don't edit files in `packages/prisma/` directly -- run migrations"

**What sourcebook v0.3 encoded:**
- Hub files: `types.ts` imported by 183 files
- 14 generated files detected -- do NOT edit directly
- Circular dependency: `bookingScenario.ts` ↔ `getMockRequestData.ts`
- Co-change coupling: `auth/provider.ts` ↔ `middleware/session.ts` (88% correlation)
- Fragile file: `openapi.json` -- 5 edits in one week
- 1,907 dead code candidates

The handwritten brief had workflow recipes. sourcebook had structural intelligence. The workflow recipes were more immediately useful for these specific tasks.

Repo dumps show the code. Handoffs explain the project.

---

## What sourcebook was missing

Looking at the early benchmarks, the gap was clear. sourcebook v0.3 was good at telling agents what NOT to touch and where the structural risks were. It was bad at telling agents what TO DO and how to do it.

Structural intelligence matters -- knowing the hub files, the circular deps, the generated file traps. But it's not enough. An agent that knows which files are important still needs to know: when the project needs i18n, you use this exact pattern. When you add a new API route, these are the files that need to change together. When you touch auth, this is the middleware chain.

This is the difference between a map and directions.

sourcebook got better by losing first.

---

## What changed: v0.4.1 and v0.5

We added three capabilities based directly on what the benchmarks exposed:

### Dominant pattern detection (v0.4.1)

sourcebook now scans for the recurring code patterns that define how a project works. Not framework detection -- that's what you're already using. Dominant patterns are the project-specific conventions that sit on top of frameworks:

- **i18n pattern:** uses `useLocale()` + `t("key")`, translation keys in `packages/i18n/locales/en/common.json`
- **Auth pattern:** session handling via `packages/auth/`, middleware chain in `middleware.ts`
- **Validation pattern:** Zod schemas in `schemas/` directories, co-located with route handlers
- **Database pattern:** Prisma queries in `packages/db/queries/`, never raw SQL in route handlers
- **Component pattern:** UI primitives in `packages/ui/`, app components in `components/`

These are exactly the kind of conventions handwritten briefs encode naturally. We taught sourcebook to find them automatically.

### Repo-mode detection (v0.5)

Not every repo is the same kind of project. A library (hono, pydantic) needs different context than an application (cal.com) or a monorepo. v0.5 detects the repo mode and adjusts what it surfaces:

- **App mode:** emphasizes routes, pages, workflows, env vars
- **Library mode:** emphasizes public API surface, test patterns, backwards compatibility constraints
- **Monorepo mode:** emphasizes package boundaries, shared dependencies, cross-package coupling

### Quick reference (v0.5)

A new section at the top of the generated file: a 30-second handoff covering the absolute essentials. Stack. Key commands. The one thing most likely to go wrong. Designed for the first 10 seconds of agent orientation.

[CHART: Progression -- line chart showing sourcebook v0.3 → v0.4.1 → v0.5 vs handwritten baseline, dual y-axis for time (seconds) and patch breadth (lines changed), on the cal.com #27298 task]

---

## The numbers after the changes

On cal.com #27298 (the first task where handwritten dominated): sourcebook v0.5 closed to within 6% of handwritten speed (136s vs. 120s) while producing a 46% broader fix (469 lines vs. 321 lines). The fix touched more files because it found untranslated strings the handwritten brief didn't mention.

On cal.com #27907: sourcebook v0.5 beat handwritten on speed (113s vs. 115s). First time. Small margin, but directionally meaningful.

On hono and pydantic: the gap narrowed but handwritten still had an edge on pure speed. Across the board, sourcebook v0.5 consistently produced broader patches.

---

## What we learned

### 1. Handwritten briefs encode workflow knowledge that tools struggle to match

A human who understands the project doesn't describe the code -- they describe how to work with the code. This is a fundamentally different kind of information. Tools are getting closer but there is still a gap, especially on project-specific workflows with no standard pattern.

### 2. Structural intelligence and workflow intelligence are complementary

sourcebook's structural analysis (hub files, co-change coupling, generated file traps) caught things handwritten briefs missed entirely. The 14 generated files in cal.com? The handwritten brief didn't mention those. The 88% co-change coupling between auth/provider.ts and middleware/session.ts? Not in the brief. The 1,907 dead code candidates? Invisible to a human writing from memory.

The ideal context file encodes both.

### 3. The discoverability filter is real

The ETH Zurich finding held up in our tests. Repomix (full repo dump) performed worse than a targeted handwritten brief and sometimes worse than no context at all. Agents don't need more code to read. They need the non-obvious things the code doesn't tell them.

### 4. Benchmarking agent context is genuinely hard

One of our pydantic tasks was a scoring artifact -- sourcebook correctly identified a no-op and we initially scored that as failure. Patch size is not quality. Speed is not correctness. We're still iterating on evaluation methodology, and we think anyone claiming clean benchmark numbers on agent context should show their scoring rubric.

[DIAGRAM: Stack -- three horizontal layers. Bottom: "Code" (repo dumps, file concatenation, raw source). Middle: "Runtime tools" (MCP, function calling, dynamic file access). Top: "Project knowledge" (conventions, patterns, constraints, workflow rules). Arrow pointing to the top layer labeled "The missing layer".]

---

## Implications for coding agents

If you're building or using AI coding agents, here's what this suggests:

**Project knowledge should be a first-class input.** Not an afterthought, not a nice-to-have. It should be loaded alongside the task description, before the agent starts reading files. The difference between 241s and 120s on the OAuth task was entirely explained by project knowledge.

**Concise beats comprehensive.** sourcebook's output for cal.com (10,453 files) is 858 tokens. That's not a compromise -- it's the point. Every finding passed a discoverability filter: can an agent figure this out by reading the code? If yes, drop it. The 19,680x reduction vs. Repomix is a feature, not a limitation.

**Humans should still edit the output.** sourcebook generates a starting point, not a finished product. The best context files we've seen are machine-generated, human-reviewed. sourcebook even includes a "What to Add Manually" section at the bottom -- because it knows what it doesn't know.

**Static analysis and git forensics reveal things humans forget.** Nobody remembers all 14 generated files. Nobody manually tracks co-change coupling percentages. Nobody counts dead code candidates. The structural layer is where automation has a genuine edge over handwritten briefs.

---

## Limitations and open questions

We want to be upfront about what this is and isn't.

**Small benchmark sample.** Four tasks across three repos is enough to see patterns but not enough to make statistical claims. We're expanding the benchmark suite, and the full data is in the repo. We'd welcome others reproducing these results or contributing tasks.

**Correctness scoring is still evolving.** As the pydantic no-op showed, evaluating whether a patch is "right" is harder than measuring whether it's fast or big. We're working on better correctness rubrics, but this is an open problem across the field.

**Language coverage is early.** TypeScript, Python, and Go are supported. Rust, Java, Ruby, PHP are not yet analyzed for dominant patterns or framework conventions.

**The discoverability filter has false positives.** Sometimes sourcebook drops a finding that would have helped. The filter errs on the side of conciseness, which means occasionally useful information is classified as "discoverable" when it isn't quite. We're tuning this.

**We built the tool and ran the benchmark.** That's a conflict of interest and we know it. The benchmark code is open. The issues and PRs are all public. We've tried to present the results honestly, including the cases where we lost.

---

## What this is

sourcebook is a CLI that analyzes your codebase and generates context files containing only what AI coding agents can't figure out by reading the code themselves.

```bash
npx sourcebook init
```

One command. Produces a CLAUDE.md (or .cursorrules, or copilot-instructions.md) containing hub files, dominant patterns, generated file traps, co-change coupling, fragile code warnings, and a quick-reference handoff -- all filtered through the discoverability test.

It's open-source on GitHub. There's a free tier that does everything described in this post. Pro ($19/mo) adds `sourcebook update` to preserve your manual edits across re-scans.

If you're using AI coding agents on a real codebase, the 30 seconds it takes to run is probably worth it. If you already have a handwritten CLAUDE.md, running sourcebook next to it will likely surface structural insights you didn't know about.

The best context files are machine-generated, human-reviewed.

Try it: [sourcebook.run](https://sourcebook.run)

---

*Built by [maroond](https://maroond.ai). If you use sourcebook and find something interesting, we'd genuinely like to hear about it.*
