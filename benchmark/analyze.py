#!/usr/bin/env python3
"""Analyze sourcebook benchmark results and produce a summary report."""

import json
import os
import sys
from pathlib import Path
from collections import defaultdict

def load_results(results_dir):
    """Load all summary.json files from results subdirectories."""
    results = []
    for run_dir in sorted(Path(results_dir).iterdir()):
        summary_path = run_dir / "summary.json"
        if summary_path.exists():
            with open(summary_path) as f:
                try:
                    data = json.load(f)
                    # Load context stats if available
                    ctx_path = run_dir / "context_stats.json"
                    if ctx_path.exists():
                        with open(ctx_path) as cf:
                            data["context_stats"] = json.load(cf)
                    results.append(data)
                except json.JSONDecodeError:
                    print(f"Warning: invalid JSON in {summary_path}")
    return results

def analyze(results):
    """Compute aggregate metrics per condition."""
    by_condition = defaultdict(list)
    by_task = defaultdict(dict)

    for r in results:
        condition = r["condition"]
        task_key = f"{r['repo']}#{r['issue']}"
        by_condition[condition].append(r)
        by_task[task_key][condition] = r

    print("=" * 70)
    print("SOURCEBOOK BENCHMARK RESULTS")
    print("=" * 70)
    print()

    # Per-condition aggregates
    print("## Aggregate Metrics by Condition")
    print()
    print(f"{'Condition':<15} {'Tasks':>6} {'Avg Tokens':>12} {'Avg Time(s)':>12} {'Avg Patch':>10} {'Context Tokens':>15}")
    print("-" * 70)

    for condition in ["none", "repomix", "sourcebook"]:
        runs = by_condition.get(condition, [])
        if not runs:
            continue

        n = len(runs)
        avg_tokens = sum(r.get("input_tokens", 0) + r.get("output_tokens", 0) for r in runs) / n
        avg_time = sum(r.get("agent_time_ms", 0) for r in runs) / n / 1000
        avg_patch = sum(r.get("patch_lines", 0) for r in runs) / n

        ctx_tokens = []
        for r in runs:
            if "context_stats" in r:
                ctx_tokens.append(r["context_stats"].get("tokens", 0))

        avg_ctx = sum(ctx_tokens) / len(ctx_tokens) if ctx_tokens else 0

        print(f"{condition:<15} {n:>6} {avg_tokens:>12,.0f} {avg_time:>12.1f} {avg_patch:>10.0f} {avg_ctx:>15,.0f}")

    print()

    # Per-task comparison
    print("## Per-Task Comparison")
    print()
    print(f"{'Task':<35} {'none tokens':>12} {'repomix':>12} {'sourcebook':>12} {'SB savings':>12}")
    print("-" * 83)

    total_none = 0
    total_repomix = 0
    total_sb = 0
    paired_count = 0

    for task_key in sorted(by_task.keys()):
        conditions = by_task[task_key]

        none_tokens = conditions.get("none", {}).get("input_tokens", 0) + conditions.get("none", {}).get("output_tokens", 0)
        repomix_tokens = conditions.get("repomix", {}).get("input_tokens", 0) + conditions.get("repomix", {}).get("output_tokens", 0)
        sb_tokens = conditions.get("sourcebook", {}).get("input_tokens", 0) + conditions.get("sourcebook", {}).get("output_tokens", 0)

        savings = ""
        if none_tokens > 0 and sb_tokens > 0:
            pct = ((none_tokens - sb_tokens) / none_tokens) * 100
            savings = f"{pct:+.1f}%"
            total_none += none_tokens
            total_sb += sb_tokens
            total_repomix += repomix_tokens
            paired_count += 1

        # Truncate task key for display
        display_key = task_key[:33] + ".." if len(task_key) > 35 else task_key

        print(f"{display_key:<35} {none_tokens:>12,} {repomix_tokens:>12,} {sb_tokens:>12,} {savings:>12}")

    if paired_count > 0:
        print("-" * 83)
        overall_savings = ((total_none - total_sb) / total_none) * 100 if total_none > 0 else 0
        print(f"{'TOTAL':<35} {total_none:>12,} {total_repomix:>12,} {total_sb:>12,} {overall_savings:>+11.1f}%")

    print()

    # Context file size comparison
    print("## Context File Size Comparison")
    print()
    repomix_ctx = [r["context_stats"]["tokens"] for r in by_condition.get("repomix", []) if "context_stats" in r]
    sb_ctx = [r["context_stats"]["tokens"] for r in by_condition.get("sourcebook", []) if "context_stats" in r]

    if repomix_ctx and sb_ctx:
        avg_repomix = sum(repomix_ctx) / len(repomix_ctx)
        avg_sb = sum(sb_ctx) / len(sb_ctx)
        ratio = avg_repomix / avg_sb if avg_sb > 0 else 0
        print(f"Average Repomix context:    {avg_repomix:>12,.0f} tokens")
        print(f"Average sourcebook context: {avg_sb:>12,.0f} tokens")
        print(f"Ratio:                      {ratio:>12,.0f}x smaller")

    print()
    print("=" * 70)

    # Write machine-readable summary
    summary = {
        "total_tasks": len(by_task),
        "conditions": {},
        "paired_comparisons": paired_count,
    }
    for condition in ["none", "repomix", "sourcebook"]:
        runs = by_condition.get(condition, [])
        if runs:
            n = len(runs)
            summary["conditions"][condition] = {
                "n": n,
                "avg_total_tokens": sum(r.get("input_tokens", 0) + r.get("output_tokens", 0) for r in runs) / n,
                "avg_time_ms": sum(r.get("agent_time_ms", 0) for r in runs) / n,
                "avg_patch_lines": sum(r.get("patch_lines", 0) for r in runs) / n,
            }

    summary_path = Path(results_dir) / "benchmark_summary.json"
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"\nMachine-readable summary: {summary_path}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python analyze.py <results_dir>")
        sys.exit(1)

    results_dir = sys.argv[1]
    results = load_results(results_dir)

    if not results:
        print(f"No results found in {results_dir}")
        print("Run the benchmark first: ./run-all.sh")
        sys.exit(1)

    analyze(results)
