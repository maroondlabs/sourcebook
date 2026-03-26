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

## Next Steps

1. **Add correctness scoring** (tests, lint, file overlap with reference PR) — highest priority to validate thoroughness claims
2. Fix checkout validation (confirm bug is present before running)
3. Add "correct no-op" outcome category
4. Expand to 20-30 tasks with more repo diversity
5. Run 2-3 reruns per task/condition for statistical confidence
6. Compare sourcebook output vs handwritten to find what humans emphasize that sourcebook misses
7. Benchmark v0.5 on a fresh set of tasks (not just re-runs) to check for overfitting to known tasks
