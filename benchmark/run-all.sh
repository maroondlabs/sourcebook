#!/bin/bash
# Run the full benchmark suite across all conditions
# Usage: ./run-all.sh [--quick]
# --quick: Run only 5 tasks instead of all 30

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RESULTS_DIR="$SCRIPT_DIR/results"
mkdir -p "$RESULTS_DIR"

# Task definitions: repo issue_number
# Diverse task set: 5 TypeScript, 4 Python, 4 Go, 2 Rust

TASKS_TS=(
  "calcom/cal.com 27907"         # TS-1: PayPal i18n strings
  "calcom/cal.com 27298"         # TS-2: OAuth flow sign-up
  "honojs/hono 4806"             # TS-3: parseBody breaks text()/json()
  "vercel/ai 13988"              # TS-4: config/string fix
  "vercel/ai 13354"              # TS-5: logic error
  "vercel/ai 13839"              # TS-6: perf regression
  "vercel/next.js 74843"         # TS-7: encoding bug
  "drizzle-team/drizzle-orm 4421"  # TS-8: type error
)

TASKS_PY=(
  "pydantic/pydantic 12715"     # PY-1: ImportString validation
  "pydantic/pydantic 13051"     # PY-2: model equality with runtime extra
  "fastapi/fastapi 14454"       # PY-3: logic error
  "fastapi/fastapi 14508"       # PY-4: regression
  "fastapi/fastapi 14483"       # PY-5: regression
)

TASKS_GO=(
  "gin-gonic/gin 2959"          # GO-1: panic on invalid HTTP method
  "gin-gonic/gin 4468"          # GO-2: ClientIP X-Forwarded-For
  "go-chi/chi 954"              # GO-3: Mux.Find nested routes (PR-only, no issue)
  "charmbracelet/bubbletea 1322"  # GO-4: last line rendering bug
)

TASKS_RS=(
  "clap-rs/clap 6201"           # RS-1: symlink path completions
  "clap-rs/clap 6275"           # RS-2: --help with ignore_errors
)

CONDITIONS=("none" "handwritten" "repomix" "sourcebook")

# Quick mode: 1 task per language (4 tasks x 4 conditions = 16 runs)
if [[ "${1:-}" == "--quick" ]]; then
  echo "=== QUICK MODE: 4 tasks ==="
  ALL_TASKS=(
    "${TASKS_TS[0]}"
    "${TASKS_PY[0]}"
    "${TASKS_GO[1]}"
    "${TASKS_RS[1]}"
  )
# Medium mode: core tasks (8 tasks x 4 conditions = 32 runs)
elif [[ "${1:-}" == "--medium" ]]; then
  echo "=== MEDIUM MODE: 8 tasks ==="
  ALL_TASKS=(
    "${TASKS_TS[0]}"
    "${TASKS_TS[2]}"
    "${TASKS_PY[0]}"
    "${TASKS_PY[2]}"
    "${TASKS_GO[0]}"
    "${TASKS_GO[1]}"
    "${TASKS_RS[0]}"
    "${TASKS_RS[1]}"
  )
else
  echo "=== FULL BENCHMARK: 19 tasks ==="
  ALL_TASKS=("${TASKS_TS[@]}" "${TASKS_PY[@]}" "${TASKS_GO[@]}" "${TASKS_RS[@]}")
fi

TOTAL_TASKS=${#ALL_TASKS[@]}
TOTAL_RUNS=$(( TOTAL_TASKS * ${#CONDITIONS[@]} ))
CURRENT_RUN=0

echo "Tasks: $TOTAL_TASKS"
echo "Conditions: ${CONDITIONS[*]}"
echo "Total runs: $TOTAL_RUNS"
echo "Results dir: $RESULTS_DIR"
echo ""

# Run each task under each condition
for TASK in "${ALL_TASKS[@]}"; do
  REPO=$(echo "$TASK" | awk '{print $1}')
  ISSUE=$(echo "$TASK" | awk '{print $2}')

  for CONDITION in "${CONDITIONS[@]}"; do
    CURRENT_RUN=$((CURRENT_RUN + 1))
    echo ""
    echo "=========================================="
    echo "[$CURRENT_RUN/$TOTAL_RUNS] $REPO #$ISSUE — $CONDITION"
    echo "=========================================="

    bash "$SCRIPT_DIR/run.sh" "$REPO" "$ISSUE" "$CONDITION" 2>&1 | tee "$RESULTS_DIR/log_${REPO//\//-}_${ISSUE}_${CONDITION}.txt" || {
      echo "FAILED: $REPO #$ISSUE ($CONDITION)"
      echo "{\"repo\": \"$REPO\", \"issue\": $ISSUE, \"condition\": \"$CONDITION\", \"error\": true}" > "$RESULTS_DIR/failed_${REPO//\//-}_${ISSUE}_${CONDITION}.json"
    }
  done
done

echo ""
echo "=== Benchmark complete ==="
echo "Results in: $RESULTS_DIR"

# Generate summary table
echo ""
echo "Generating summary..."
python3 "$SCRIPT_DIR/analyze.py" "$RESULTS_DIR"
