#!/usr/bin/env python3
"""Analyze repeat benchmark runs for statistical confidence.

Reads summary.json files from benchmark/results/ and computes
mean, stddev, and 95% confidence intervals for each task/condition pair.

Usage: python3 analyze-repeats.py [results_dir]
"""

import json
import os
import sys
import math
from collections import defaultdict
from pathlib import Path
from typing import Optional, List, Dict

def load_results(results_dir: str, since: Optional[str] = None) -> List[dict]:
    """Load all summary.json files from results directory.

    Args:
        since: ISO date string (e.g. '2026-04-11') to filter runs after this date.
               If None, loads all results.
    """
    results = []
    for entry in Path(results_dir).iterdir():
        if not entry.is_dir():
            continue
        summary = entry / "summary.json"
        if summary.exists():
            try:
                with open(summary) as f:
                    data = json.load(f)
                if "error" not in data:
                    # Filter by date if requested
                    if since and "timestamp" in data:
                        if data["timestamp"][:10] < since:
                            continue
                    results.append(data)
            except (json.JSONDecodeError, KeyError):
                continue
    return results


def mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0


def stddev(values: list[float]) -> float:
    if len(values) < 2:
        return 0
    m = mean(values)
    return math.sqrt(sum((x - m) ** 2 for x in values) / (len(values) - 1))


def ci95(values: list[float]) -> float:
    """95% confidence interval (t-distribution approximation for small N)."""
    n = len(values)
    if n < 2:
        return 0
    # t-values for 95% CI: n=2→12.71, n=3→4.30, n=4→3.18, n=5→2.78
    t_vals = {2: 12.706, 3: 4.303, 4: 3.182, 5: 2.776, 6: 2.571}
    t = t_vals.get(n, 1.96)  # fallback to z for large N
    return t * stddev(values) / math.sqrt(n)


def analyze(results_dir: str, since: Optional[str] = None):
    results = load_results(results_dir, since=since)
    if not results:
        print(f"No results found in {results_dir}")
        return

    # Group by (repo, issue, condition)
    groups = defaultdict(list)
    for r in results:
        key = (r["repo"], r["issue"], r["condition"])
        groups[key].append(r)

    # Identify tasks with repeat runs (3+ runs for any condition)
    task_keys = set()
    for (repo, issue, cond), runs in groups.items():
        if len(runs) >= 2:  # at least 2 runs = repeat data
            task_keys.add((repo, issue))

    if not task_keys:
        print("No tasks with repeat runs found. Need 2+ runs per condition.")
        print(f"\nAll tasks found ({len(groups)} groups):")
        for (repo, issue, cond), runs in sorted(groups.items()):
            times = [r["agent_time_ms"] / 1000 for r in runs]
            print(f"  {repo} #{issue} [{cond}]: {len(runs)} runs — {[f'{t:.0f}s' for t in times]}")
        return

    # Print repeat-run analysis
    print("=" * 80)
    print("REPEAT RUN ANALYSIS — Statistical Confidence")
    print("=" * 80)

    conditions_of_interest = ["sourcebook", "handwritten", "none"]

    for repo, issue in sorted(task_keys):
        print(f"\n{'─' * 70}")
        print(f"  {repo} #{issue}")
        print(f"{'─' * 70}")
        print(f"  {'Condition':<14} {'N':>3} {'Mean':>7} {'StdDev':>8} {'95% CI':>10} {'Range':>14}")

        cond_means = {}
        for cond in conditions_of_interest:
            key = (repo, issue, cond)
            runs = groups.get(key, [])
            if not runs:
                continue

            times = [r["agent_time_ms"] / 1000 for r in runs]
            m = mean(times)
            sd = stddev(times)
            ci = ci95(times)
            cond_means[cond] = (m, ci, len(times))

            range_str = f"{min(times):.0f}–{max(times):.0f}s" if len(times) > 1 else f"{times[0]:.0f}s"
            ci_str = f"±{ci:.0f}s" if ci > 0 else "—"
            sd_str = f"{sd:.0f}s" if sd > 0 else "—"

            print(f"  {cond:<14} {len(times):>3} {m:>6.0f}s {sd_str:>8} {ci_str:>10} {range_str:>14}")

        # Compute SB vs HW comparison if both exist
        if "sourcebook" in cond_means and "handwritten" in cond_means:
            sb_mean, sb_ci, sb_n = cond_means["sourcebook"]
            hw_mean, hw_ci, hw_n = cond_means["handwritten"]
            delta_pct = ((sb_mean - hw_mean) / hw_mean) * 100
            # Combined CI for difference
            combined_ci = math.sqrt(sb_ci**2 + hw_ci**2) if sb_ci and hw_ci else 0
            delta_ci_pct = (combined_ci / hw_mean) * 100 if hw_mean else 0

            print(f"\n  SB vs HW: {delta_pct:+.0f}% ({sb_mean:.0f}s vs {hw_mean:.0f}s)")
            if combined_ci > 0:
                low = delta_pct - delta_ci_pct
                high = delta_pct + delta_ci_pct
                sig = "YES" if (low > 0 or high < 0) else "NO"
                print(f"  95% CI:   [{low:+.0f}%, {high:+.0f}%]  Significant: {sig}")

    # Summary table
    print(f"\n{'=' * 80}")
    print("SUMMARY TABLE (for blog/landing page)")
    print(f"{'=' * 80}")
    print(f"\n| Task | Lang | SB mean | HW mean | Δ | 95% CI | Sig? |")
    print(f"|------|------|---------|---------|---|--------|------|")

    lang_map = {
        "vercel/next.js": "TS", "charmbracelet/bubbletea": "GO",
        "clap-rs/clap": "RS", "pydantic/pydantic": "PY",
        "gin-gonic/gin": "GO", "calcom/cal.com": "TS",
        "honojs/hono": "TS", "fastapi/fastapi": "PY",
        "vercel/ai": "TS", "drizzle-team/drizzle-orm": "TS",
        "go-chi/chi": "GO",
    }

    total_sb_wins = 0
    total_significant = 0
    total_tasks = 0

    for repo, issue in sorted(task_keys):
        sb_runs = groups.get((repo, issue, "sourcebook"), [])
        hw_runs = groups.get((repo, issue, "handwritten"), [])
        if not sb_runs or not hw_runs:
            continue

        total_tasks += 1
        sb_times = [r["agent_time_ms"] / 1000 for r in sb_runs]
        hw_times = [r["agent_time_ms"] / 1000 for r in hw_runs]

        sb_m = mean(sb_times)
        hw_m = mean(hw_times)
        sb_c = ci95(sb_times)
        hw_c = ci95(hw_times)

        delta = ((sb_m - hw_m) / hw_m) * 100
        combined = math.sqrt(sb_c**2 + hw_c**2) if sb_c and hw_c else 0
        delta_ci = (combined / hw_m) * 100 if hw_m else 0

        if delta < 0:
            total_sb_wins += 1

        sig = ""
        if combined > 0:
            low = delta - delta_ci
            high = delta + delta_ci
            sig = "Yes" if (low > 0 or high < 0) else "No"
            if sig == "Yes":
                total_significant += 1
            ci_str = f"[{low:+.0f}%, {high:+.0f}%]"
        else:
            ci_str = "—"

        lang = lang_map.get(repo, "??")
        print(f"| {repo} #{issue} | {lang} | {sb_m:.0f}s | {hw_m:.0f}s | {delta:+.0f}% | {ci_str} | {sig} |")

    if total_tasks:
        print(f"\nWin rate: {total_sb_wins}/{total_tasks} ({total_sb_wins/total_tasks*100:.0f}%)")
        print(f"Statistically significant: {total_significant}/{total_tasks}")


if __name__ == "__main__":
    # Parse args: positional results_dir, --since YYYY-MM-DD
    since = None
    positional = []
    i = 1
    while i < len(sys.argv):
        if sys.argv[i] == "--since" and i + 1 < len(sys.argv):
            since = sys.argv[i + 1]
            i += 2
        else:
            positional.append(sys.argv[i])
            i += 1
    results_dir = positional[0] if positional else os.path.join(os.path.dirname(__file__), "results")
    analyze(results_dir, since=since)
