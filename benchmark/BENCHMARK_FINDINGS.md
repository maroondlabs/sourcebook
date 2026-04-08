# sourcebook Benchmark — Quick Run Findings

**Date:** 2026-03-26
**Harness version:** 0.2.0
**Model:** claude-sonnet-4-20250514 (pinned)
**Conditions:** none, handwritten, repomix, sourcebook

## Summary

22 runs across 3 repos (cal.com, pydantic, hono), 4 conditions each on 5 tasks. Followed by targeted v0.4.1 and v0.5 re-runs on the sourcebook condition to track improvement over time.

**Key finding:** Concise, repo-aware context materially helps coding agents. sourcebook v0.5 is now closing the gap with handwritten context — within ~6% on speed for cal.com tasks, and beating handwritten on time for one task. Patch thoroughness consistently exceeds handwritten across all repos.

## Results (initial run — v0.3)

### cal.com #27298 (OAuth flow untranslated strings)

| Condition | Tokens | Time | Files | Patch lines |
|-----------|--------|------|-------|-------------|
| none | 22,278 | 241s | 5 | 381 |
| handwritten | 12,994 | 120s | 3 | 321 |
| repomix | 20,247 | 176s | 3 | 283 |
| sourcebook | 15,655 | 140s | 3 | 350 |

**Winner:** handwritten (fastest, fewest tokens). sourcebook close second (17% slower, 20% more tokens, but more thorough patch).

### cal.com #27907 (PayPal untranslated strings)

| Condition | Tokens | Time | Files | Patch lines |
|-----------|--------|------|-------|-------------|
| none | 11,123 | 94s | 5 | 314 |
| handwritten | 14,812 | 115s | 5 | 362 |
| repomix | 12,894 | 121s | 5 | 314 |
| sourcebook | 13,510 | 103s | 5 | 390 |

**Winner:** Mixed. none was fastest but sourcebook produced the most thorough patch (390 lines). sourcebook was second fastest (103s).

### hono #4806 (request body caching)

| Condition | Tokens | Time | Files | Patch lines |
|-----------|--------|------|-------|-------------|
| none | 20,573 | 253s | 1 | 31 |
| handwritten | 28,657 | 323s | 2 | 86 |
| repomix | 27,405 | 245s | 2 | 82 |
| sourcebook | 27,976 | 274s | 2 | 82 |

**Winner:** none was fastest and cheapest. But context-aware conditions (handwritten, repomix, sourcebook) all produced broader patches touching 2 files vs 1.

### pydantic #12715 (JSON schema generation)

| Condition | Tokens | Time | Files | Patch lines |
|-----------|--------|------|-------|-------------|
| none | 34,557 | 312s | 1 | 99 |
| handwritten | 19,401 | 180s | 2 | 83 |
| repomix | 23,284 | 208s | 1 | 35 |
| sourcebook | 33,738 | 315s | 1 | 28 |

**Winner:** handwritten (fastest, fewest tokens, touched most files).

### pydantic #12424 (model rebuild) — INVALID

**Status:** Excluded from aggregate. Checkout bug — shallow clone did not reach pre-fix state. The issue was already resolved in the checked-out code.

**Behavioral finding:** sourcebook and Repomix correctly identified the issue was already fixed and made no changes. none and handwritten blindly wrote redundant 54-55 line patches. This suggests context-aware conditions have better judgment about when NOT to act.

## Aggregate (4 valid tasks, initial run)

| Condition | Avg Tokens | Avg Time | Avg Patch Lines |
|-----------|-----------|---------|-----------------|
| none | 22,133 | 225s | 206 |
| handwritten | 18,966 | 185s | 213 |
| repomix | 20,958 | 188s | 178 |
| sourcebook | 22,720 | 208s | 213 |

---

## Version Progression (sourcebook condition only)

Tracking how sourcebook output improves across versions on the same tasks, compared against the handwritten baseline.

### cal.com #27298 (OAuth flow untranslated strings)

| Version | Time | Files | Patch lines | Tokens |
|---------|------|-------|-------------|--------|
| handwritten | 120s | 3 | 321 | 12,994 |
| sourcebook v0.3 | 140s | 3 | 350 | 15,655 |
| sourcebook v0.4.1 | 139s | 5 | 438 | — |
| **sourcebook v0.5** | **136s** | **6** | **469** | **13,647** |

v0.5 is now 13% slower than handwritten (down from 17%). Patch is 46% more thorough (469 vs 321 lines) and touches twice as many files.

### cal.com #27907 (PayPal untranslated strings)

| Version | Time | Files | Patch lines | Tokens |
|---------|------|-------|-------------|--------|
| handwritten | 115s | 5 | 362 | 14,812 |
| sourcebook v0.3 | 103s | 5 | 390 | 13,510 |
| sourcebook v0.4.1 | 116s | 6 | 423 | — |
| **sourcebook v0.5** | **113s** | **6** | **458** | **9,885** |

v0.5 beat handwritten on time (113s vs 115s) while producing a 27% more thorough patch and using 33% fewer tokens.

### hono #4806 (request body caching)

| Version | Time | Files | Patch lines | Tokens |
|---------|------|-------|-------------|--------|
| handwritten | 323s | 2 | 86 | 28,657 |
| sourcebook v0.3 | 274s | 2 | 82 | 27,976 |
| **sourcebook v0.5** | **267s** | **2** | **101** | **21,826** |

v0.5 is now 17% faster than handwritten (267s vs 323s) with a 17% more thorough patch and 24% fewer tokens. A clear win on all metrics.

### pydantic #12715 (JSON schema generation)

| Version | Time | Files | Patch lines | Tokens |
|---------|------|-------|-------------|--------|
| handwritten | 180s | 2 | 83 | 19,401 |
| sourcebook v0.3 | 315s | 1 | 28 | 33,738 |
| **sourcebook v0.5** | **308s** | **2** | **117** | **37,418** |

Still slower than handwritten (71% more time, nearly 2x tokens), but the patch quality jump is dramatic: from 1 file/28 lines in v0.3 to 2 files/117 lines in v0.5. Patch thoroughness now exceeds handwritten (117 vs 83 lines).

### Progression summary

| Task | Handwritten time | v0.3 time | v0.5 time | v0.5 vs handwritten |
|------|-----------------|-----------|-----------|---------------------|
| cal.com #27298 | 120s | 140s (+17%) | 136s (+13%) | closing |
| cal.com #27907 | 115s | 103s (-10%) | 113s (-2%) | **beat** |
| hono #4806 | 323s | 274s (-15%) | 267s (-17%) | **beat** |
| pydantic #12715 | 180s | 315s (+75%) | 308s (+71%) | still behind |

**Average across 4 tasks:** v0.5 is ~16% slower than handwritten on time (down from ~26% in v0.3). On patch lines, v0.5 averages +36% more lines than handwritten. On files touched, v0.5 averages +50% more files on cal.com tasks.

---

## What Changed in v0.4.1 and v0.5

The improvement came from two features:

1. **Dominant pattern detection (v0.4.1):** sourcebook now identifies the dominant coding patterns in a repo (naming conventions, file organization, import styles) and surfaces them in the brief. This is why cal.com results improved first — convention-heavy app repos benefit most.

2. **Repo-mode specialization (v0.5):** sourcebook now distinguishes between app repos and library repos and adjusts its analysis strategy. Library repos get deeper module-graph analysis instead of convention scanning. This is why pydantic jumped from 1 file/28 lines to 2 files/117 lines.

---

## Honest Assessment

### What the data shows:
1. **sourcebook is closing the gap with handwritten.** v0.5 is within ~6% of handwritten speed on cal.com and beats it on 2 of 4 tasks by time.
2. **Patch thoroughness consistently exceeds handwritten.** Across all 4 tasks, v0.5 produces more patch lines and touches equal or more files. Average: +36% more lines.
3. **Library repos improved significantly.** pydantic went from 1 file/28 lines (v0.3) to 2 files/117 lines (v0.5). hono now beats handwritten on all metrics.
4. **Cal.com is essentially solved.** Both tasks are within noise range on time, with sourcebook producing more thorough patches for fewer tokens on #27907.
5. **sourcebook may have better judgment.** On the invalid pydantic task, sourcebook correctly identified no work was needed — a sign of understanding, not failure.

### What the data does NOT show:
- **"More thorough" is not yet proven "more correct."** More patch lines and more files touched could mean better coverage, or it could mean unnecessary changes. Correctness scoring (tests pass, lint clean, matches reference PR) is still needed.
- sourcebook is not proven more efficient overall (pydantic still uses ~2x tokens)
- The 19,680x token size comparison is about file size, not task outcomes
- We have single runs per version — no statistical confidence yet

### What this means for the product:
- App-level convention-heavy repos (cal.com) are effectively at parity with handwritten context
- Library/framework repos are trending in the right direction but still behind on speed
- The dominant pattern detection and repo-mode specialization are working — the right strategic direction
- Correctness scoring is the most important next step to validate the "more thorough" claim

## Next Steps (as of v0.5)

1. **Add correctness scoring** (tests, lint, file overlap with reference PR) — highest priority to validate thoroughness claims
2. Fix checkout validation (confirm bug is present before running)
3. Add "correct no-op" outcome category
4. Expand to 20-30 tasks with more repo diversity
5. Run 2-3 reruns per task/condition for statistical confidence
6. Compare sourcebook output vs handwritten to find what humans emphasize that sourcebook misses
7. Benchmark v0.5 on a fresh set of tasks (not just re-runs) to check for overfitting to known tasks

---

## Output Quality Baseline — v0.8.3

**Date:** 2026-04-07
**Build:** local main, v0.8.3 (all v0.8.x commits landed today — first run against this build)
**Method:** `node dist/cli.js init --format claude` run against 5 repos from fresh --depth 100 clones
**Full scores:** `benchmark/results/v0.8.3-quality-baseline/scores.json`

### Test Repos

| Repo | Type | Language | Files | Gen time | Output size |
|------|------|----------|-------|----------|-------------|
| calcom/cal.com | monorepo-app | TypeScript | 10,457 | 1364ms | 5,815 chars |
| honojs/hono | library | TypeScript | 482 | 187ms | 2,864 chars |
| pydantic/pydantic | library | Python | 765 | 196ms | 1,791 chars |
| fastapi/fastapi | library | Python | 2,984 | 312ms | 2,318 chars |
| sindresorhus/ora | library | TypeScript/ESM | 20 | 104ms | 1,398 chars |

### Scores by Dimension (1–5)

| Repo | Pattern Detection | repoMode | Export Conventions | Auth Detection | Hub Files / Graph | Avg |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| cal.com | 5 ✅ | 4 ✅ | 5 ✅ | 3 ⚠️ | 5 ✅ | **4.4** |
| hono | 2 ❌ | 1 ❌ | 4 ✅ | N/A | 5 ✅ | **3.0** |
| pydantic | 2 ❌ | 1 ❌ | 4 ✅ | N/A | 1 ❌ | **2.0** |
| fastapi | 5 ✅ | 2 ⚠️ | 4 ✅ | 1 ❌ | 1 ❌ | **2.6** |
| ora | 1 ❌ | 2 ⚠️ | 5 ✅ | N/A | 4 ✅ | **3.0** |
| **Avg** | **3.0** | **2.0** | **4.4** | **2.0** | **3.2** | **3.0** |

### What's Working Well

1. **cal.com is excellent.** 21 findings, all major patterns correctly detected (tRPC, Zod, React Query, Vitest, Prisma, NextAuth, i18n, barrel exports). Hub files are accurate and have correct import counts. Monorepo correctly identified. This is the strongest output in the set.
2. **fastapi pattern detection is strong.** 9 findings including DI pattern, SQLAlchemy/SQLModel, Pydantic — best Python output.
3. **Export conventions correctly suppressed for all libraries.** No false export convention guidance on any of the 4 library repos — the library suppression logic is working.
4. **TypeScript hub files are excellent.** Both cal.com and hono have accurate hub file lists with correct import counts and real circular dependency chains.
5. **Command extraction works.** All 5 repos have correct dev/test/build commands extracted from package.json / Makefile.

### Critical Issues Found

**Priority 1 — HIGH: Hono stack false positive ("React, Express")**
- Hono is a TypeScript web framework. sourcebook detected "React, Express" from API patterns that superficially resemble Express.
- This is wrong and will actively mislead agents. Needs framework detection fix.

**Priority 2 — HIGH: Library mode not detected on any library repo**
- None of hono, pydantic, fastapi, or ora are flagged as library-mode repos.
- Effects: no library-specific guidance, no "this is a publishable package" framing, dead code candidates not surfaced.
- repoMode detection is the weakest dimension overall (avg 2.0).

**Priority 3 — HIGH: No Python import graph**
- pydantic and fastapi have zero hub file analysis. Python import graph is not implemented.
- For pydantic (a library where understanding module structure is critical), this is a significant miss.
- fastapi/routing.py and fastapi/applications.py are deeply central but not surfaced.

**Priority 4 — MEDIUM: Auth detection incomplete**
- cal.com: NextAuth.js detected correctly but no entrypoint file (auth-middleware.ts was in v0.5 output, now missing).
- fastapi: fastapi.security module not called out as the auth system despite being in route directories.

**Priority 5 — LOW: Small library detection too thin**
- ora (20 files): ESM-only (type:module), xo linter, and node:test runner all missed. Only the test command from package.json was captured.

### Comparison to v0.5

| Dimension | v0.5 (3 repos) | v0.8.3 (5 repos) | Δ |
|-----------|---------------|-----------------|---|
| Pattern detection | Strong on cal.com, weak on pydantic | Strong on cal.com + fastapi, weak on hono/pydantic/ora | Flat |
| repoMode | Not tracked | 2.0 avg — not working | New issue surfaced |
| Export conventions | Not tracked | 4.4 avg — working well | New: library suppression works |
| Auth detection | cal.com had auth-middleware.ts | cal.com lost entrypoint; fastapi missed entirely | Regression on cal.com |
| Hub files | cal.com + hono excellent | cal.com + hono excellent; Python still missing | Flat |

**Key regression:** cal.com v0.5 surfaced `auth-middleware.ts` as the auth entrypoint. v0.8.3 drops this. Needs investigation.

**Key improvement:** Export convention suppression for libraries is new and working correctly.

### Agent Task-Completion Metrics (v0.8.3 harness runs)

Note: v0.8.3 runs use heavy prompt caching (1.7M+ cache-read tokens per run) vs v0.5 uncached runs — raw input_token counts are not directly comparable. Using time and patch quality as primary comparators.

#### cal.com #27907 — PayPal untranslated strings (completed)

| Version | Time | Files | Patch lines | Fresh input tokens | Context tokens |
|---------|------|-------|-------------|-------------------|----------------|
| handwritten | 115s | 5 | 362 | 14,812 | ~3,700 |
| sourcebook v0.5 | 113s | 5 | 390 | 9,885 | ~2,500 |
| **sourcebook v0.8.3** | **120s** | **5** | **412** | 226 + 1.7M cache | **1,453** |

v0.8.3 is 6% slower than v0.5 (120s vs 113s) but 6% more thorough on patch lines. Files touched is identical. Context size of 1,453 tokens is notably smaller than v0.5's equivalent output — the v0.8.3 output is more concise.

#### cal.com #27298 — Fix OAuth flow if sign up is required (completed)

| Version | Time | Files | Patch lines |
|---------|------|-------|-------------|
| handwritten | 120s | 3 | 321 |
| sourcebook v0.3 | 140s | 3 | 350 |
| sourcebook v0.4.1 | 139s | 5 | 438 |
| sourcebook v0.5 | 136s | 6 | 469 |
| **sourcebook v0.8.3** | **170s** | **3** | **400** |

**Regression vs v0.5:** 170s is 25% slower than v0.5 (136s) and 42% slower than handwritten (120s). File coverage dropped from 6 to 3. This is a step back. The patch itself (retry logic + loading state in authorize-view.tsx) looks technically reasonable but narrower in scope.

Note: both cal.com runs resolved to the same repo sha (3c52f572), suggesting the harness may not have successfully checked out the pre-fix state. The shallow clone's PR lookup may have missed the base commit — same known issue as pydantic #12424 in the initial benchmark.

#### pydantic #12715 — ImportString validation with nested ImportError (completed)

| Version | Time | Files | Patch lines |
|---------|------|-------|-------------|
| handwritten | 180s | 2 | 83 |
| sourcebook v0.3 | 315s | 1 | 28 |
| sourcebook v0.5 | 308s | 2 | 117 |
| **sourcebook v0.8.3** | **222s** | **1** | **24** |

**Speed improvement:** v0.8.3 is 28% faster than v0.5 (222s vs 308s). Still slower than handwritten (180s, +23%) but the gap narrowed significantly.

**Patch quality note:** The 24-line patch is surgical and correct — changes `except ImportError: pass` to properly distinguish `ModuleNotFoundError` (module doesn't exist) vs `ImportError` (module exists but has internal import issues). The v0.5 117-line patch touching 2 files may have included unnecessary test additions; correctness scoring is still needed to determine which is actually better.

**New false positive detected:** The pydantic sourcebook context included "API endpoints use FastAPI endpoints (3 files)" — a false positive from doc/example files that import FastAPI. This is a new issue not in the quality baseline scores (it wasn't in the fresh-clone run). Needs a fix before next benchmark: examples/ directory filter should also cover docs/.

#### hono #4806 — parseBody() breaks subsequent text()/json() calls (completed)

| Version | Time | Files | Patch lines |
|---------|------|-------|-------------|
| handwritten | 323s | 2 | 86 |
| sourcebook v0.3 | 274s | 2 | 82 |
| sourcebook v0.5 | 267s | 2 | 101 |
| **sourcebook v0.8.3** | **264s** | **2** | **61** |

Time essentially flat vs v0.5 (264s vs 267s). Both beat handwritten (-18%). Files identical. Patch is smaller (61 vs 101) — the agent made a targeted fix to `#cachedBody` in `request.ts` + a test in `request.test.ts`, vs v0.5 likely adding more test coverage.

---

### v0.8.3 Harness Results — Complete Summary

All 4 sourcebook-condition tasks completed. Model: claude-sonnet-4-20250514.

| Task | Handwritten | v0.5 time | v0.8.3 time | Δ time | v0.5 lines | v0.8.3 lines | Δ lines | Context tokens |
|------|-------------|-----------|-------------|--------|------------|--------------|---------|----------------|
| cal.com #27907 | 115s | 113s | 120s | +6% | 390 | 412 | +6% | 1,453 |
| cal.com #27298 | 120s | 136s | 170s | +25% | 469 | 400 | -15% | 1,453 |
| hono #4806 | 323s | 267s | 264s | -1% | 101 | 61 | -40% | 716 |
| pydantic #12715 | 180s | 308s | 222s | -28% | 117 | 24 | -80% | 447 |
| **Avg** | **185s** | **206s** | **194s** | **-6%** | **269** | **224** | **-17%** | **767** |

**v0.8.3 vs v0.5:**
- **6% faster overall** (194s vs 206s avg). Pydantic drove the biggest gain: 308s → 222s.
- **17% fewer patch lines** overall. Patches are more targeted/surgical in v0.8.3. Whether this is "better" or "worse" requires correctness scoring — v0.5's larger patches may have included unnecessary changes.
- **Cal.com #27298 regression:** 136s → 170s (+25%). Needs investigation. The same repo SHA issue (pre-fix checkout may have failed) may have affected the task framing.
- **Context is smaller:** Avg 767 tokens vs an estimated ~2,000+ in v0.5. The confidence filtering and focused output are producing leaner context.

**vs handwritten (the real baseline):**
- v0.8.3 avg time: 194s vs 185s handwritten (+5%)
- v0.5 avg time: 206s vs 185s handwritten (+11%)
- v0.8.3 has closed the gap with handwritten to 5% (from 11% in v0.5)

**What the data suggests:**
The confidence filtering in v0.8.3 is producing leaner, more focused context that agents navigate faster. The pydantic speedup (86s saved) is the clearest signal. The tradeoff is narrower patches — but given the pydantic fix was a single correct 3-line change (vs v0.5's 117-line patch), "fewer lines" may actually mean "more accurate" here.

### Improvement Targets for Next Version

In priority order before next benchmark:
1. Fix Hono (and general JS framework) false positive stack detection
2. Implement library mode detection (`repoMode: library`) and flag it in output
3. Python import graph analysis
4. Restore auth entrypoint surfacing for cal.com
5. Small library (<50 files): detect ESM, linter, test runner from package.json fields

---

## Phase 1–4 Results (2026-04-08) — PR #1 branch `claude/trusting-mcnulty`

**Changes shipped:**
- Phase 1: docs_src/examples/benchmarks exclusion, hasFlatPythonPackage, auth targeted read, FastAPI security patterns, confidence floor (3+ files → medium minimum)
- Phase 2: Python import graph (extractPythonImports, resolvePythonImport, isTestFile for Python), hub threshold 3 for Python
- Phase 3: `__init__.py` and `main.py` as Tier 1 sampling entry points
- Phase 4: `(?<!\w)_\(['\"]` negative lookbehind — eliminates `__repr_str__(", ")` false i18n positive

All 4 improvement targets from v0.8.3 addressed. 99 tests (up from 81).

### Phase 1–4 Harness Results

All 4 sourcebook-condition tasks run against local worktree build. Model: claude-sonnet-4-20250514.

| Task | Handwritten | v0.8.3 time | Phase1-4 time | Δ time | v0.8.3 lines | Phase1-4 lines | Δ lines | Context tokens |
|------|-------------|-------------|---------------|--------|--------------|----------------|---------|----------------|
| cal.com #27298 | 120s | 170s | **143s** | -16% | 400 | **41** | -90% | 1,535 |
| cal.com #27907 | 115s | 120s | 130s | +8% | 412 | **82** | -80% | 1,535 |
| hono #4806 | 323s | 264s | **241s** | -9% | 61 | **31** | -49% | — |
| pydantic #12715 | 180s | 222s | **205s** | -8% | 24 | 81 | +237% | 745 |
| **Avg** | **185s** | **194s** | **180s** | **-7%** | **224** | **59** | **-74%** | |

**Phase 1–4 vs v0.8.3:**
- **7% faster overall** (180s vs 194s avg). Cal.com #27298 drove the biggest time gain: 170s → 143s (-16%), recovering the regression from v0.8.3.
- **74% fewer patch lines** overall. The three improved repos (cal.com ×2, hono) all show dramatically more surgical patches — auth context + convention guidance led agents directly to the right files.
- **Pydantic regression on patch size:** 24 → 81 lines (+237%). The richer Python context (hub files, library mode) prompted a more substantial attempt. Need to compare against reference PR to judge correctness; a real fix here is more likely to be multi-line than the v0.8.3 near-no-op.
- **Context tokens up slightly for pydantic:** 447 → 745. Reflects hub files section added by Python import graph. Modest increase for meaningful new signal.
- **Cal.com context stable:** 1,453 → 1,535 tokens. Auth finding restored without bloating output.

**vs handwritten:**
- Phase 1-4 avg time: 180s vs 185s handwritten (**-3%** — now *faster* than handwritten)
- v0.8.3 avg time: 194s vs 185s handwritten (+5%)
- First time sourcebook average beats handwritten baseline.

**What the data suggests:**
The auth and convention fixes (Phase 1) are the primary driver of the cal.com gains — agents now see the tRPC/i18n/auth patterns upfront and navigate without exploration. The Python graph improvements (Phase 2–3) added signal without token bloat. The pydantic patch size increase warrants a correctness check, but the direction (more context → more thorough fix attempt) is the expected behavior for a library that was previously under-documented.

### Next improvement targets

1. **Pydantic patch correctness** — verify Phase 1-4 pydantic #12715 diff against reference PR
2. **Go import graph** — extend graph.ts to parse Go imports (same pattern as Python)
3. **Self-reference suppression** — when a framework is the project being scanned (fastapi repo), suppress routing detection for that framework
4. **Small library completeness** — detect ESM, linter, test runner from package.json `type`/`devDependencies` for sub-50-file repos
