#!/usr/bin/env python3
"""sourcebook benchmark analyzer — accuracy-first.

Primary metric: file accuracy (recall, precision, F1).
Secondary metrics: variance, time, failure rate.

Usage:
    python3 analyze.py [results_dir] [--since YYYY-MM-DD] [--condition sourcebook,handwritten]
"""

import json
import math
import os
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Optional, List


# ── Data loading ──────────────────────────────────────────────────────────────

def load_results(results_dir: str, since: Optional[str] = None) -> List[dict]:
    """Load all summary.json files, fixing known issues."""
    results = []
    for entry in Path(results_dir).iterdir():
        if not entry.is_dir():
            continue
        summary = entry / "summary.json"
        if not summary.exists():
            continue
        try:
            text = summary.read_text()
            # Fix known broken JSON: empty issue_title
            text = re.sub(r'"issue_title":\s*,', '"issue_title": "",', text)
            data = json.loads(text)
            if "error" in data:
                continue
            if since and data.get("timestamp", "")[:10] < since:
                continue
            results.append(data)
        except (json.JSONDecodeError, KeyError):
            continue
    return results


# ── Stats helpers ─────────────────────────────────────────────────────────────

def mean(values: List[float]) -> float:
    return sum(values) / len(values) if values else 0.0

def stddev(values: List[float]) -> float:
    if len(values) < 2:
        return 0.0
    m = mean(values)
    return math.sqrt(sum((x - m) ** 2 for x in values) / (len(values) - 1))

def ci95(values: List[float]) -> float:
    n = len(values)
    if n < 2:
        return 0.0
    t_vals = {2: 12.706, 3: 4.303, 4: 3.182, 5: 2.776, 6: 2.571}
    t = t_vals.get(n, 1.96)
    return t * stddev(values) / math.sqrt(n)


# ── Main analysis ─────────────────────────────────────────────────────────────

def analyze(results_dir: str, since: Optional[str] = None,
            conditions: Optional[List[str]] = None):
    results = load_results(results_dir, since=since)
    if not results:
        print(f"No results found in {results_dir}" +
              (f" since {since}" if since else ""))
        return

    if conditions is None:
        conditions = ["none", "handwritten", "sourcebook"]

    # Group by (repo, issue, condition)
    groups = defaultdict(list)
    for r in results:
        key = (r["repo"], r["issue"], r["condition"])
        groups[key].append(r)

    # Unique tasks
    tasks = sorted(set((r["repo"], r["issue"]) for r in results))

    # ── 1. ACCURACY REPORT ────────────────────────────────────────────────

    print("=" * 76)
    print("  ACCURACY REPORT — File Overlap with Reference PR")
    print("=" * 76)
    print()
    print("  Primary metric: did the agent edit the right files?")
    print("  Recall = right files touched / right files in reference PR")
    print("  Precision = right files touched / all files agent touched")
    print()

    # Per-condition aggregate accuracy
    cond_recalls = defaultdict(list)
    cond_precisions = defaultdict(list)
    cond_f1s = defaultdict(list)
    cond_failures = defaultdict(int)  # produced_patch = false
    cond_zeros = defaultdict(int)     # recall = 0

    for (repo, issue, cond), runs in groups.items():
        if cond not in conditions:
            continue
        for r in runs:
            recall = r.get("recall", r.get("file_overlap_ratio", None))
            precision = r.get("precision", None)
            f1 = r.get("f1", None)

            # Coerce types
            def to_float(v):
                if v is None:
                    return None
                if isinstance(v, str):
                    return float(v) if v.strip() else None
                return float(v)

            recall = to_float(recall)
            precision = to_float(precision)
            f1 = to_float(f1)

            # Skip runs with no overlap data (task didn't have reference files)
            if recall is None:
                continue

            cond_recalls[cond].append(recall)
            if precision is not None:
                cond_precisions[cond].append(precision)
            if f1 is not None:
                cond_f1s[cond].append(f1)

            if not r.get("produced_patch", True):
                cond_failures[cond] += 1
            if recall == 0:
                cond_zeros[cond] += 1

    # Summary table
    print(f"  {'Condition':<14} {'N':>4} {'Recall':>8} {'Precision':>10} {'F1':>6}"
          f" {'Perfect':>8} {'Zero':>6} {'No Patch':>9}")
    print("  " + "-" * 68)

    for cond in conditions:
        recalls = cond_recalls.get(cond, [])
        if not recalls:
            continue
        precisions = cond_precisions.get(cond, [])
        f1s = cond_f1s.get(cond, [])
        perfect = sum(1 for r in recalls if r >= 1.0)
        zeros = cond_zeros.get(cond, 0)
        failures = cond_failures.get(cond, 0)
        n = len(recalls)

        print(f"  {cond:<14} {n:>4} {mean(recalls):>7.0%}"
              f" {mean(precisions):>9.0%} {mean(f1s):>6.0%}"
              f" {perfect:>7}/{n} {zeros:>5}/{n} {failures:>8}/{n}")

    # ── 2. DIVERGENCE POINTS ──────────────────────────────────────────────

    print()
    print("  DIVERGENCE POINTS — where conditions disagree on file accuracy")
    print("  " + "-" * 68)

    divergences = []
    for repo, issue in tasks:
        task_recalls = {}
        for cond in conditions:
            runs = groups.get((repo, issue, cond), [])
            if runs:
                recalls = []
                for r in runs:
                    v = r.get("recall", r.get("file_overlap_ratio", None))
                    if v is not None:
                        recalls.append(float(v) if isinstance(v, (int, float, str)) and str(v).strip() else 0)
                if recalls:
                    task_recalls[cond] = mean(recalls)

        if len(task_recalls) < 2:
            continue
        vals = list(task_recalls.values())
        if max(vals) - min(vals) > 0.01:  # non-trivial divergence
            repo_short = repo.split("/")[-1]
            parts = []
            for cond in conditions:
                if cond in task_recalls:
                    parts.append(f"{cond}={task_recalls[cond]:.0%}")
            divergences.append((repo_short, issue, parts, task_recalls))
            print(f"  {repo_short} #{issue}: {', '.join(parts)}")

    if not divergences:
        print("  (all conditions agree on file accuracy)")

    # ── 3. VARIANCE REPORT ────────────────────────────────────────────────

    print()
    print("=" * 76)
    print("  VARIANCE REPORT — Completion Time Consistency")
    print("=" * 76)
    print()

    # Only show tasks with repeat runs
    repeat_tasks = []
    for repo, issue in tasks:
        for cond in conditions:
            runs = groups.get((repo, issue, cond), [])
            if len(runs) >= 2:
                repeat_tasks.append((repo, issue))
                break

    if not repeat_tasks:
        print("  No repeat-run data found. Run benchmark/run-repeats.sh for variance data.")
    else:
        for repo, issue in sorted(set(repeat_tasks)):
            repo_short = repo.split("/")[-1]
            print(f"  {repo_short} #{issue}")
            print(f"  {'Condition':<14} {'N':>3} {'Mean':>7} {'StdDev':>8} {'Range':>14}")

            sb_sd = hw_sd = None
            for cond in conditions:
                runs = groups.get((repo, issue, cond), [])
                if not runs:
                    continue
                times = [r["agent_time_ms"] / 1000 for r in runs]
                m = mean(times)
                sd = stddev(times)
                range_str = f"{min(times):.0f}-{max(times):.0f}s" if len(times) > 1 else f"{times[0]:.0f}s"
                sd_str = f"{sd:.0f}s" if sd > 0 else "-"

                if cond == "sourcebook":
                    sb_sd = sd
                elif cond == "handwritten":
                    hw_sd = sd

                print(f"  {cond:<14} {len(times):>3} {m:>6.0f}s {sd_str:>8} {range_str:>14}")

            if sb_sd is not None and hw_sd is not None and hw_sd > 0:
                reduction = ((hw_sd - sb_sd) / hw_sd) * 100
                print(f"  Variance reduction: {reduction:+.0f}% ({'tighter' if reduction > 0 else 'wider'})")
            print()

    # ── 4. FAILURE MODES ──────────────────────────────────────────────────

    print("=" * 76)
    print("  FAILURE MODES")
    print("=" * 76)
    print()

    failure_stories = []
    for (repo, issue, cond), runs in groups.items():
        if cond not in conditions:
            continue
        for r in runs:
            recall = r.get("recall", r.get("file_overlap_ratio", None))
            if recall is None:
                continue  # no reference data — can't score
            if isinstance(recall, str):
                recall = float(recall) if recall.strip() else 0
            else:
                recall = float(recall)
            patch = r.get("patch_lines", 0)
            if isinstance(patch, str):
                patch = int(patch.strip()) if patch.strip() else 0

            if patch == 0 or recall == 0:
                repo_short = repo.split("/")[-1]
                mode = "NO PATCH" if patch == 0 else "WRONG FILES"
                failure_stories.append((repo_short, issue, cond, mode,
                                       r.get("agent_time_ms", 0) / 1000,
                                       r.get("turns", 0)))

    if failure_stories:
        print(f"  {'Task':<25} {'Condition':<14} {'Mode':<13} {'Time':>6} {'Turns':>6}")
        print("  " + "-" * 68)
        for repo_short, issue, cond, mode, time, turns in sorted(failure_stories):
            print(f"  {repo_short} #{issue:<8} {cond:<14} {mode:<13} {time:>5.0f}s {turns:>5}")
    else:
        print("  No failures detected.")

    # ── 5. SCORECARD ──────────────────────────────────────────────────────

    print()
    print("=" * 76)
    print("  SCORECARD — sourcebook vs handwritten")
    print("=" * 76)
    print()

    sb_recalls = cond_recalls.get("sourcebook", [])
    hw_recalls = cond_recalls.get("handwritten", [])
    sb_prec = cond_precisions.get("sourcebook", [])
    hw_prec = cond_precisions.get("handwritten", [])

    if sb_recalls and hw_recalls:
        print(f"  Metric              sourcebook     handwritten")
        print(f"  " + "-" * 48)
        print(f"  Avg recall          {mean(sb_recalls):>8.0%}        {mean(hw_recalls):>8.0%}")
        print(f"  Avg precision       {mean(sb_prec):>8.0%}        {mean(hw_prec):>8.0%}")
        print(f"  Perfect accuracy    {sum(1 for r in sb_recalls if r >= 1.0):>5}/{len(sb_recalls)}"
              f"         {sum(1 for r in hw_recalls if r >= 1.0):>5}/{len(hw_recalls)}")
        print(f"  Zero accuracy       {sum(1 for r in sb_recalls if r == 0):>5}/{len(sb_recalls)}"
              f"         {sum(1 for r in hw_recalls if r == 0):>5}/{len(hw_recalls)}")
        print(f"  No patch produced   {cond_failures.get('sourcebook', 0):>5}/{len(sb_recalls)}"
              f"         {cond_failures.get('handwritten', 0):>5}/{len(hw_recalls)}")

        # Per-task accuracy wins
        sb_wins = hw_wins = ties = 0
        for repo, issue in tasks:
            sb_runs = groups.get((repo, issue, "sourcebook"), [])
            hw_runs = groups.get((repo, issue, "handwritten"), [])
            if not sb_runs or not hw_runs:
                continue

            def get_recalls(runs):
                vals = []
                for r in runs:
                    v = r.get("recall", r.get("file_overlap_ratio", None))
                    if v is not None:
                        vals.append(float(v) if isinstance(v, (int, float)) else
                                    (float(v) if isinstance(v, str) and v.strip() else 0))
                return vals

            sb_vals = get_recalls(sb_runs)
            hw_vals = get_recalls(hw_runs)
            if not sb_vals or not hw_vals:
                continue
            sb_r = mean(sb_vals)
            hw_r = mean(hw_vals)
            if sb_r > hw_r + 0.01:
                sb_wins += 1
            elif hw_r > sb_r + 0.01:
                hw_wins += 1
            else:
                ties += 1

        total = sb_wins + hw_wins + ties
        print()
        print(f"  Accuracy wins:      {sb_wins}/{total}"
              f"            {hw_wins}/{total}")
        print(f"  Ties:               {ties}/{total}")

    print()
    print("=" * 76)


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    since = None
    conds = None
    positional = []
    i = 1
    while i < len(sys.argv):
        if sys.argv[i] == "--since" and i + 1 < len(sys.argv):
            since = sys.argv[i + 1]
            i += 2
        elif sys.argv[i] == "--condition" and i + 1 < len(sys.argv):
            conds = sys.argv[i + 1].split(",")
            i += 2
        else:
            positional.append(sys.argv[i])
            i += 1

    results_dir = positional[0] if positional else os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "results")

    analyze(results_dir, since=since, conditions=conds)
