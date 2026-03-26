#!/bin/bash
# Run the full benchmark suite across all conditions
# Usage: ./run-all.sh [--quick]
# --quick: Run only 5 tasks instead of all 30

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RESULTS_DIR="$SCRIPT_DIR/results"
mkdir -p "$RESULTS_DIR"

# Task definitions: repo issue_number
TASKS_CAL=(
  "calcom/cal.com 27907"   # CAL-1: i18n
  "calcom/cal.com 27298"   # CAL-2: OAuth flow
  "calcom/cal.com 27963"   # CAL-3: Duration conversion
  "calcom/cal.com 27988"   # CAL-4: Booking limits
  "calcom/cal.com 20358"   # CAL-5: Localhost URL
  "calcom/cal.com 28393"   # CAL-6: Verify email button
  "calcom/cal.com 13010"   # CAL-7: Phone label
  "calcom/cal.com 28468"   # CAL-8: Alt text
  "calcom/cal.com 22238"   # CAL-9: Keycloak OIDC
  "calcom/cal.com 28034"   # CAL-10: JSON name prefill
)

TASKS_PYDANTIC=(
  "pydantic/pydantic 12715"  # PYD-1: JSON schema
  "pydantic/pydantic 12424"  # PYD-2: Model rebuild
  "pydantic/pydantic 12061"  # PYD-3: Generic resolution
  "pydantic/pydantic 11748"  # PYD-4: Serialization
  "pydantic/pydantic 11768"  # PYD-5: mypy plugin
  "pydantic/pydantic 11248"  # PYD-6: Discriminated union
  "pydantic/pydantic 10411"  # PYD-7: Validator override
  "pydantic/pydantic 9394"   # PYD-8: Custom types
  "pydantic/pydantic 9936"   # PYD-9: Field validation
  "pydantic/pydantic 9872"   # PYD-10: Computed fields
)

TASKS_HONO=(
  "honojs/hono 4806"  # HON-1: Request body caching
  "honojs/hono 4440"  # HON-2: URL parsing
  "honojs/hono 4769"  # HON-3: JSX streaming
  "honojs/hono 4731"  # HON-4: RPC serialization
  "honojs/hono 4727"  # HON-5: Router matching
  "honojs/hono 4582"  # HON-6: Middleware lifecycle
  "honojs/hono 4294"  # HON-7: Language detection
)

CONDITIONS=("none" "handwritten" "repomix" "sourcebook")

# Quick mode: only first 5 tasks
if [[ "${1:-}" == "--quick" ]]; then
  echo "=== QUICK MODE: 5 tasks ==="
  ALL_TASKS=(
    "${TASKS_CAL[0]}"
    "${TASKS_CAL[1]}"
    "${TASKS_PYDANTIC[0]}"
    "${TASKS_PYDANTIC[1]}"
    "${TASKS_HONO[0]}"
  )
else
  echo "=== FULL BENCHMARK: 27 tasks ==="
  ALL_TASKS=("${TASKS_CAL[@]}" "${TASKS_PYDANTIC[@]}" "${TASKS_HONO[@]}")
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
