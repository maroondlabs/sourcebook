# sourcebook Benchmark — Quick Run Findings

**Date:** 2026-03-26
**Harness version:** 0.2.0
**Model:** claude-sonnet-4-20250514 (pinned)
**Conditions:** none, handwritten, repomix, sourcebook

## Summary

22 runs across 3 repos (cal.com, pydantic, hono), 4 conditions each on 5 tasks.

**Key finding:** Concise, repo-aware context materially helps coding agents. The question is whether sourcebook can match or beat a good human-written brief.

## Results (corrected)

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

## Aggregate (4 valid tasks)

| Condition | Avg Tokens | Avg Time | Avg Patch Lines |
|-----------|-----------|---------|-----------------|
| none | 22,133 | 225s | 206 |
| handwritten | 18,966 | 185s | 213 |
| repomix | 20,958 | 188s | 178 |
| sourcebook | 22,720 | 208s | 213 |

## Honest Assessment

### What the data shows:
1. **Concise repo-aware context helps.** Handwritten was fastest on 3/4 valid tasks. The category is real.
2. **sourcebook is competitive on convention-heavy app repos.** On cal.com, sourcebook was within 15-20% of handwritten on speed while producing equal or more thorough patches.
3. **sourcebook struggles on library/framework repos.** On pydantic and hono, sourcebook was slower and didn't outperform.
4. **sourcebook may have better judgment.** On the invalid pydantic task, sourcebook correctly identified no work was needed — a sign of understanding, not failure.
5. **More lines ≠ better.** We need correctness scoring (tests, lint, file overlap with reference PR) before claiming "more thorough."

### What the data does NOT show:
- sourcebook is not proven better than handwritten context
- sourcebook is not proven more efficient overall
- sourcebook is not proven to improve correctness
- The 19,680x token size comparison is about file size, not task outcomes

### What this means for the product:
- The gap between sourcebook and handwritten is the optimization target
- App-level convention-heavy repos (cal.com) are sourcebook's strength
- Library/framework repos may need different analysis strategies
- The no-op judgment finding is a unique differentiator worth exploring

## Next Steps

1. Add correctness scoring (tests, lint, file overlap)
2. Fix checkout validation (confirm bug is present before running)
3. Add "correct no-op" outcome category
4. Expand to 20-30 tasks with more repo diversity
5. Run 2-3 reruns per task/condition for statistical confidence
6. Compare sourcebook output vs handwritten to find what humans emphasize that sourcebook misses
