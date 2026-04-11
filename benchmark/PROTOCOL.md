# sourcebook Benchmark Protocol v2

## Goal

Measure whether sourcebook-generated context files improve AI coding agent performance on real bug-fix tasks, compared to no context, handwritten context, and repomix dumps.

## Design

**Paired within-task comparison.** Each task runs under all 4 conditions on the same repo SHA. Differences are attributable to the context condition, not the task or codebase state.

### Conditions

| ID | Context file | Description |
|----|-------------|-------------|
| `none` | No CLAUDE.md | Baseline -- agent explores on its own |
| `handwritten` | Human-written CLAUDE.md | ~300-400 tokens of expert notes per repo |
| `repomix` | repomix-output.txt as CLAUDE.md | Full code dump (competitor baseline) |
| `sourcebook` | sourcebook init --format claude | Auto-generated structural context |

### Metrics (per run)

| Metric | Source | Why it matters |
|--------|--------|----------------|
| Time (wall clock) | Harness timer | Speed of task completion |
| Turns | Agent output JSON | Navigation efficiency |
| Patch lines | git diff | Patch size (surgical = fewer lines) |
| Files changed | git diff --name-only | Scope accuracy |
| Produced patch | Boolean | Did the agent give up? |
| Input tokens | Agent metrics | Cost proxy |
| Context tokens | wc -c / 4 | Context overhead |

**Primary metric:** Time. Secondary: produced_patch (binary success), then patch lines as a precision signal.

### Repos (3 repos, 3 stacks)

| Repo | Type | Language | Why |
|------|------|----------|-----|
| calcom/cal.com | Monorepo app | TypeScript | Convention-heavy, i18n tasks, large |
| pydantic/pydantic | Library | Python | Deep module graph, no JS tooling |
| honojs/hono | Library | TypeScript | Small surface, structural bugs |

### Tasks (27 total)

10 cal.com issues, 10 pydantic issues, 7 hono issues. All sourced from merged PRs with known fixes. See `run-all.sh` for full list.

**Selection criteria:** Issue has a merged PR. PR changes fewer than 20 files. Issue body describes the bug (not just a title). Mix of difficulty: some are string changes, some are architectural.

## Execution

### Prerequisites

- macOS with `claude` CLI, `gh` CLI, `python3`, `node`/`npx`
- GitHub token with repo read access
- ~50GB disk for cloned repos at `/tmp/sourcebook-bench`
- API budget: ~27 tasks x 4 conditions x ~20K tokens avg = ~2.2M tokens (~$7-10 at Sonnet pricing)

### Run order

```bash
# Full run (27 tasks x 4 conditions = 108 runs, ~6-8 hours)
cd benchmark && ./run-all.sh

# Quick validation (5 tasks x 4 conditions = 20 runs, ~1.5 hours)
cd benchmark && ./run-all.sh --quick
```

Each run: clones repo, checks out pre-fix SHA, applies context condition, runs `claude --print` with frozen prompt, captures diff and metrics.

### Bias controls

1. **Identical prompt** across all conditions (task_prompt.txt is condition-independent)
2. **Frozen model** (claude-sonnet-4-20250514 pinned in harness)
3. **Same repo SHA** per task across all 4 conditions
4. **Deterministic ordering** (none -> handwritten -> repomix -> sourcebook per task)
5. **No cherry-picking** -- all tasks run, all results reported, failed runs noted
6. **Context files saved** to results dir for reproducibility audit

### Known limitations

- Single run per condition (no variance estimate). Mitigated by N=27 tasks.
- Deterministic run order may introduce cache warming effects. Acceptable for v1.
- Patch quality is measured by size, not correctness. Correctness scoring (test pass, lint, reference PR overlap) is a planned v2 addition.
- Shallow clones (--depth 500) occasionally fail to reach the pre-fix commit.

## Analysis

```bash
python3 benchmark/analyze.py benchmark/results
```

Produces per-condition aggregates (avg tokens, time, patch lines) and per-task comparison table with savings percentages.

### Statistical approach

With 27 tasks and 4 conditions, use paired Wilcoxon signed-rank test (non-parametric, no normality assumption) comparing sourcebook vs each other condition on time and patch lines. Report median differences and p-values. N=27 gives 80% power to detect a ~20% effect size at alpha=0.05.

### Reporting thresholds

- **Claim "faster":** sourcebook median time < baseline median time, p < 0.05
- **Claim "more surgical":** sourcebook median patch lines < baseline, p < 0.05
- **Claim "higher completion":** sourcebook produced_patch rate > baseline (Fisher exact test)
- **Honest caveat required:** single-run variance, no correctness scoring yet

## Output

Results directory: `benchmark/results/`. Each run produces `summary.json`, `agent_patch.diff`, `context_file_used.md`, and full agent logs. Machine-readable aggregate: `benchmark_summary.json`.
