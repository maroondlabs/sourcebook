#!/bin/bash
# Run 3x repeat runs on top 5 tasks for statistical confidence
# Conditions: sourcebook + handwritten only (the two we're comparing)
# Total: 5 tasks x 2 conditions x 3 runs = 30 runs
#
# Usage: ./run-repeats.sh [--dry-run]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RESULTS_DIR="$SCRIPT_DIR/results"
mkdir -p "$RESULTS_DIR"

# Pin to local build (must match what v0.10 initial runs used)
export SOURCEBOOK_BIN="node $PROJECT_DIR/dist/cli.js"
echo "Using sourcebook: $SOURCEBOOK_BIN"

# Top 5 tasks by SB vs HW speedup (all 4 languages represented)
TASKS=(
  "vercel/next.js 74843"           # TS: -81% (30s vs 161s)
  "charmbracelet/bubbletea 1322"   # GO: -77% (57s vs 252s)
  "clap-rs/clap 6201"              # RS: -65% (106s vs 300s)
  "pydantic/pydantic 12715"        # PY: -33% (197s vs 294s)
  "gin-gonic/gin 4468"             # GO: -32% (81s vs 119s)
)

CONDITIONS=("sourcebook" "handwritten")
RUNS_PER=3

TOTAL_RUNS=$(( ${#TASKS[@]} * ${#CONDITIONS[@]} * RUNS_PER ))
CURRENT=0

echo "=== REPEAT RUNS FOR STATISTICAL CONFIDENCE ==="
echo "Tasks:      ${#TASKS[@]}"
echo "Conditions: ${CONDITIONS[*]}"
echo "Runs each:  $RUNS_PER"
echo "Total runs: $TOTAL_RUNS"
echo "Results:    $RESULTS_DIR"
echo ""

if [[ "${1:-}" == "--dry-run" ]]; then
  echo "[DRY RUN] Would execute:"
  for TASK in "${TASKS[@]}"; do
    REPO=$(echo "$TASK" | awk '{print $1}')
    ISSUE=$(echo "$TASK" | awk '{print $2}')
    for RUN in $(seq 1 $RUNS_PER); do
      for CONDITION in "${CONDITIONS[@]}"; do
        echo "  bash run.sh $REPO $ISSUE $CONDITION  (run $RUN/$RUNS_PER)"
      done
    done
  done
  exit 0
fi

# Interleave conditions to reduce temporal bias
# Run pattern: task1-SB, task1-HW, task1-SB, task1-HW, task1-SB, task1-HW, task2-...
for TASK in "${TASKS[@]}"; do
  REPO=$(echo "$TASK" | awk '{print $1}')
  ISSUE=$(echo "$TASK" | awk '{print $2}')
  REPO_SHORT=$(echo "$REPO" | tr '/' '-')

  echo ""
  echo "============================================"
  echo "TASK: $REPO #$ISSUE"
  echo "============================================"

  for RUN in $(seq 1 $RUNS_PER); do
    for CONDITION in "${CONDITIONS[@]}"; do
      CURRENT=$((CURRENT + 1))
      echo ""
      echo "--- [$CURRENT/$TOTAL_RUNS] $REPO_SHORT #$ISSUE — $CONDITION (run $RUN/$RUNS_PER) ---"

      bash "$SCRIPT_DIR/run.sh" "$REPO" "$ISSUE" "$CONDITION" 2>&1 \
        | tee "$RESULTS_DIR/log_repeat_${REPO_SHORT}_${ISSUE}_${CONDITION}_r${RUN}.txt" || {
        echo "FAILED: $REPO #$ISSUE ($CONDITION, run $RUN)"
      }

      echo ""
      echo "Completed $CURRENT/$TOTAL_RUNS"
    done
  done
done

echo ""
echo "=== Repeat runs complete ==="
echo "Results in: $RESULTS_DIR"
echo ""
echo "Analyze with: python3 $SCRIPT_DIR/analyze-repeats.py"
