#!/bin/bash
# sourcebook benchmark harness
# Tests whether AI agents perform better with sourcebook-generated context
#
# Usage: ./run.sh <repo> <issue-number> <condition>
# Conditions: none | handwritten | repomix | sourcebook
#
# Example: ./run.sh calcom/cal.com 27907 sourcebook

set -euo pipefail

REPO="$1"
ISSUE="$2"
CONDITION="$3"
RESULTS_DIR="$(cd "$(dirname "$0")" && pwd)/results"
WORK_DIR="/tmp/sourcebook-bench"

# Frozen environment settings
CLAUDE_MODEL="claude-sonnet-4-20250514"
MAX_TURNS=50

# Repo short name
REPO_SHORT=$(echo "$REPO" | tr '/' '-')
RUN_ID="${REPO_SHORT}_${ISSUE}_${CONDITION}_$(date +%s)"
RUN_DIR="${RESULTS_DIR}/${RUN_ID}"

mkdir -p "$RUN_DIR"

echo "=== sourcebook benchmark ==="
echo "Repo:      $REPO"
echo "Issue:     #$ISSUE"
echo "Condition: $CONDITION"
echo "Model:     $CLAUDE_MODEL"
echo "Run ID:    $RUN_ID"
echo ""

# Record frozen settings
SB_VERSION=$(${SOURCEBOOK_BIN:-npx --yes sourcebook} --version 2>/dev/null || echo "unknown")
cat > "$RUN_DIR/environment.json" << EOF
{
  "model": "$CLAUDE_MODEL",
  "max_turns": $MAX_TURNS,
  "harness_version": "0.2.1",
  "sourcebook_version": "$SB_VERSION",
  "sourcebook_bin": "${SOURCEBOOK_BIN:-npx --yes sourcebook}",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

# Step 1: Fetch issue and find the PR that fixed it
echo "[1/7] Fetching issue and PR info..."
gh issue view "$ISSUE" --repo "$REPO" --json title,body > "$RUN_DIR/issue.json"
ISSUE_TITLE=$(python3 -c "import sys,json; print(json.load(sys.stdin)['title'])" < "$RUN_DIR/issue.json")
ISSUE_BODY=$(python3 -c "import sys,json; print(json.load(sys.stdin)['body'][:2000])" < "$RUN_DIR/issue.json")

# Find the merged PR and its base commit (the state BEFORE the fix)
# Search both by issue number in title AND by linked issues
PR_JSON=$(gh pr list --repo "$REPO" --state merged --search "$ISSUE" --json number,mergeCommit,headRefOid,baseRefOid,title --limit 5)
echo "$PR_JSON" > "$RUN_DIR/pr_info.json"

# Extract the base commit SHA (state before the fix was applied)
# Also get the merge commit SHA so we can validate the checkout
read BASE_SHA MERGE_SHA PR_NUMBER <<< $(python3 -c "
import sys, json
prs = json.load(sys.stdin)
if prs:
    pr = prs[0]
    base = pr.get('baseRefOid', '') or ''
    merge = pr.get('mergeCommit', {}).get('oid', '') if pr.get('mergeCommit') else ''
    print(f'{base} {merge} {pr[\"number\"]}')
else:
    print(' '  ' ')
" < "$RUN_DIR/pr_info.json")

echo "Issue: $ISSUE_TITLE"
echo "Fix PR: #$PR_NUMBER"
echo "Base SHA: ${BASE_SHA:0:12}..."
echo "Merge SHA: ${MERGE_SHA:0:12}..."

if [ -z "$BASE_SHA" ]; then
  echo "ERROR: Could not find a merged PR for issue #$ISSUE. Skipping."
  echo "{\"error\": \"no_pr_found\"}" > "$RUN_DIR/summary.json"
  exit 1
fi

# Step 2: Clone (or reuse) and checkout to the state BEFORE the fix
echo "[2/7] Setting up $REPO at pre-fix state..."
mkdir -p "$WORK_DIR"

if [ -d "$WORK_DIR/$REPO_SHORT/.git" ]; then
  echo "Reusing existing clone at $WORK_DIR/$REPO_SHORT"
  cd "$WORK_DIR/$REPO_SHORT"
  git checkout main -q 2>/dev/null || git checkout master -q 2>/dev/null || true
  git clean -fd -q 2>/dev/null || true
  git checkout -- . 2>/dev/null || true
else
  echo "Cloning $REPO (this may take a minute for large repos)..."
  gh repo clone "$REPO" "$WORK_DIR/$REPO_SHORT" -- --single-branch 2>/dev/null
  cd "$WORK_DIR/$REPO_SHORT"
fi

# Fetch the specific commit we need — unshallow if necessary
if ! git cat-file -e "$BASE_SHA" 2>/dev/null; then
  echo "Fetching base commit (may need to unshallow)..."
  git fetch origin "$BASE_SHA" 2>/dev/null || {
    echo "Deepening clone to reach base commit..."
    git fetch --unshallow origin 2>/dev/null || git fetch --depth 5000 origin 2>/dev/null || true
    git fetch origin "$BASE_SHA" 2>/dev/null || true
  }
fi

if ! git checkout "$BASE_SHA" -q 2>/dev/null; then
  echo "ERROR: Could not checkout base SHA $BASE_SHA. This task is invalid."
  echo "{\"error\": \"checkout_failed\", \"base_sha\": \"$BASE_SHA\"}" > "$RUN_DIR/summary.json"
  exit 1
fi

# Validate: confirm the fix PR's merge commit is NOT an ancestor of our checkout
# (i.e., the bug should still be present)
CURRENT_SHA=$(git rev-parse HEAD)
if [ -n "$MERGE_SHA" ] && git cat-file -e "$MERGE_SHA" 2>/dev/null; then
  if git merge-base --is-ancestor "$MERGE_SHA" "$CURRENT_SHA" 2>/dev/null; then
    echo "ERROR: Merge commit $MERGE_SHA is an ancestor of checkout — fix is already applied!"
    echo "{\"error\": \"fix_already_applied\", \"sha\": \"$CURRENT_SHA\", \"merge_sha\": \"$MERGE_SHA\"}" > "$RUN_DIR/summary.json"
    exit 1
  fi
  echo "Validated: checkout is at pre-fix state."
else
  echo "Warning: Could not validate pre-fix state (merge commit not available)."
fi

echo "{\"sha\": \"$CURRENT_SHA\", \"base_sha\": \"$BASE_SHA\", \"merge_sha\": \"$MERGE_SHA\", \"pr_number\": \"$PR_NUMBER\"}" > "$RUN_DIR/repo_state.json"

# Step 3: Apply context condition
echo "[3/7] Applying context condition: $CONDITION..."

# Remove any existing context files first
rm -f CLAUDE.md .cursorrules .github/copilot-instructions.md AGENTS.md

case "$CONDITION" in
  none)
    echo "No context file applied."
    echo "{\"tokens\": 0, \"ms\": 0}" > "$RUN_DIR/context_stats.json"
    ;;
  handwritten)
    # Use a reasonable handwritten CLAUDE.md — the kind a good developer would write
    HANDWRITTEN_PATH="$(dirname "$0")/handwritten/${REPO_SHORT}.md"
    if [ -f "$HANDWRITTEN_PATH" ]; then
      cp "$HANDWRITTEN_PATH" CLAUDE.md
      HW_CHARS=$(wc -c < CLAUDE.md)
      HW_TOKENS=$(( HW_CHARS / 4 ))
      echo "Handwritten: ${HW_TOKENS} tokens"
      echo "{\"tokens\": $HW_TOKENS, \"ms\": 0}" > "$RUN_DIR/context_stats.json"
    else
      echo "WARNING: No handwritten CLAUDE.md for $REPO_SHORT at $HANDWRITTEN_PATH"
      echo "Falling back to no context."
      echo "{\"tokens\": 0, \"ms\": 0, \"fallback\": true}" > "$RUN_DIR/context_stats.json"
    fi
    ;;
  repomix)
    echo "Generating Repomix context..."
    REPOMIX_START=$(date +%s%N)
    npx --yes repomix 2>/dev/null || true
    REPOMIX_END=$(date +%s%N)
    REPOMIX_MS=$(( (REPOMIX_END - REPOMIX_START) / 1000000 ))

    if [ -f "repomix-output.txt" ]; then
      REPOMIX_CHARS=$(wc -c < repomix-output.txt)
      REPOMIX_TOKENS=$(( REPOMIX_CHARS / 4 ))
      echo "Repomix: ${REPOMIX_TOKENS} tokens, ${REPOMIX_MS}ms"
      echo "{\"tokens\": $REPOMIX_TOKENS, \"ms\": $REPOMIX_MS}" > "$RUN_DIR/context_stats.json"
      # Copy as CLAUDE.md so the agent reads it
      cp repomix-output.txt CLAUDE.md
    else
      echo "{\"tokens\": 0, \"ms\": $REPOMIX_MS, \"error\": true}" > "$RUN_DIR/context_stats.json"
    fi
    ;;
  sourcebook)
    echo "Generating sourcebook context..."
    SB_START=$(date +%s%N)
    ${SOURCEBOOK_BIN:-npx --yes sourcebook} init --format claude 2>/dev/null || true
    SB_END=$(date +%s%N)
    SB_MS=$(( (SB_END - SB_START) / 1000000 ))

    if [ -f "CLAUDE.md" ]; then
      SB_CHARS=$(wc -c < CLAUDE.md)
      SB_TOKENS=$(( SB_CHARS / 4 ))
      echo "sourcebook: ${SB_TOKENS} tokens, ${SB_MS}ms"
      echo "{\"tokens\": $SB_TOKENS, \"ms\": $SB_MS}" > "$RUN_DIR/context_stats.json"
    else
      echo "{\"tokens\": 0, \"ms\": $SB_MS, \"error\": true}" > "$RUN_DIR/context_stats.json"
    fi
    ;;
  *)
    echo "Unknown condition: $CONDITION"
    exit 1
    ;;
esac

# Save the context file that was used
if [ -f "CLAUDE.md" ]; then
  cp CLAUDE.md "$RUN_DIR/context_file_used.md"
fi

# Step 4: Create the task prompt (identical across all conditions)
echo "[4/7] Creating task prompt..."
TASK_PROMPT="You are working on the $REPO repository.

## Task
Fix the following issue:

**${ISSUE_TITLE}**

${ISSUE_BODY}

## Instructions
- Read the codebase to understand the problem
- Make the minimal changes needed to fix the issue
- Follow the existing code conventions and patterns
- Do not add unnecessary changes
- Create or modify tests if the fix warrants it

When you are done, stop. Do not run tests unless you are confident they exist and will work."

echo "$TASK_PROMPT" > "$RUN_DIR/task_prompt.txt"

# Step 5: Run the agent with frozen settings
echo "[5/7] Running agent..."
AGENT_START=$(date +%s%N)

# Run Claude Code non-interactively
# --model pins the model, --max-turns caps iterations
# Unset CLAUDECODE to allow running from within another session
unset CLAUDECODE 2>/dev/null || true
claude --print --output-format json \
  --model "$CLAUDE_MODEL" \
  --max-turns "$MAX_TURNS" \
  --allowedTools "Edit,Write,Read,Glob,Grep,Bash" \
  --permission-mode bypassPermissions \
  "$TASK_PROMPT" 2>"$RUN_DIR/agent_stderr.log" \
  | tee "$RUN_DIR/agent_output.json" || true

AGENT_END=$(date +%s%N)
AGENT_MS=$(( (AGENT_END - AGENT_START) / 1000000 ))

# Step 6: Capture the agent's changes
echo "[6/7] Capturing results..."

# Get the diff of everything the agent changed
git diff HEAD > "$RUN_DIR/agent_patch.diff" 2>/dev/null || true
git diff HEAD --stat > "$RUN_DIR/agent_patch_stat.txt" 2>/dev/null || true
PATCH_LINES=$(wc -l < "$RUN_DIR/agent_patch.diff" 2>/dev/null || echo "0")
FILES_CHANGED=$(git diff HEAD --name-only 2>/dev/null | wc -l || echo "0")

# List which files the agent touched
git diff HEAD --name-only > "$RUN_DIR/files_changed.txt" 2>/dev/null || true

# Parse agent output for token usage and tool call counts
METRICS_FILE="$RUN_DIR/agent_output.json"
python3 << PYEOF > "$RUN_DIR/agent_metrics.json"
import sys, json

input_tokens = 0
output_tokens = 0
cache_read = 0
cache_create = 0
tool_calls = 0
turns = 0
errors = 0
cost_usd = 0.0
permission_denials = 0

try:
    with open("${METRICS_FILE}") as f:
        content = f.read().strip()
        d = json.loads(content)
        if isinstance(d, dict):
            # Single result object format
            if 'modelUsage' in d:
                for model, usage in d['modelUsage'].items():
                    input_tokens += usage.get('inputTokens', 0)
                    output_tokens += usage.get('outputTokens', 0)
                    cache_read += usage.get('cacheReadInputTokens', 0)
                    cache_create += usage.get('cacheCreationInputTokens', 0)
            cost_usd = d.get('total_cost_usd', 0.0)
            turns = d.get('num_turns', 0)
            permission_denials = len(d.get('permission_denials', []))
except (FileNotFoundError, json.JSONDecodeError):
    pass

print(json.dumps({
    "input_tokens": input_tokens,
    "output_tokens": output_tokens,
    "cache_read_tokens": cache_read,
    "cache_create_tokens": cache_create,
    "total_tokens": input_tokens + output_tokens + cache_read + cache_create,
    "tool_calls": tool_calls,
    "turns": turns,
    "errors": errors,
    "cost_usd": round(cost_usd, 4),
    "permission_denials": permission_denials
}))
PYEOF

# Extract token counts for summary
TOTAL_INPUT_TOKENS=$(python3 -c "import json; print(json.load(open('$RUN_DIR/agent_metrics.json'))['input_tokens'])" 2>/dev/null || echo "0")
TOTAL_OUTPUT_TOKENS=$(python3 -c "import json; print(json.load(open('$RUN_DIR/agent_metrics.json'))['output_tokens'])" 2>/dev/null || echo "0")
TOOL_CALLS=$(python3 -c "import json; print(json.load(open('$RUN_DIR/agent_metrics.json'))['tool_calls'])" 2>/dev/null || echo "0")
TURNS=$(python3 -c "import json; print(json.load(open('$RUN_DIR/agent_metrics.json'))['turns'])" 2>/dev/null || echo "0")

# Step 7: Accuracy scoring
echo "[7/7] Scoring accuracy..."

# Score: did the agent produce any meaningful changes?
PRODUCED_PATCH="false"
if [ "$PATCH_LINES" -gt 0 ]; then
  PRODUCED_PATCH="true"
fi

# Accuracy: compare changed files against reference PR
# Metrics: recall (did agent touch the right files?), precision (did it avoid wrong files?)
if [ -n "$PR_NUMBER" ]; then
  gh pr view "$PR_NUMBER" --repo "$REPO" --json files 2>/dev/null > "$RUN_DIR/pr_files.json" || true
fi

RUN_DIR="$RUN_DIR" python3 << 'SCORE_EOF' > "$RUN_DIR/accuracy.json"
import json, os

run_dir = os.environ.get("RUN_DIR", "")
pr_files_path = os.path.join(run_dir, "pr_files.json")
agent_files_path = os.path.join(run_dir, "files_changed.txt")

def is_test_file(f):
    parts = f.lower().split("/")
    name = parts[-1] if parts else ""
    return ("test" in name or "_test." in name or ".test." in name or
            "test/" in f.lower() or "tests/" in f.lower() or
            "__tests__/" in f.lower() or "spec/" in f.lower())

def is_context_file(f):
    name = f.split("/")[-1] if f else ""
    return name in ("CLAUDE.md", "AGENTS.md", ".cursorrules",
                     "copilot-instructions.md", ".github/copilot-instructions.md")

# Load reference PR files
ref_all = []
try:
    with open(pr_files_path) as f:
        data = json.load(f)
        ref_all = [fi["path"] for fi in data.get("files", [])]
except (FileNotFoundError, json.JSONDecodeError, KeyError):
    pass

# Load agent files
agent_all = []
try:
    with open(agent_files_path) as f:
        agent_all = [line.strip() for line in f if line.strip()]
except FileNotFoundError:
    pass

# Filter to source files only (exclude tests and context files)
ref_source = sorted(set(f for f in ref_all if not is_test_file(f)))
agent_source = sorted(set(f for f in agent_all if not is_test_file(f) and not is_context_file(f)))

# Save reference files
ref_path = os.path.join(run_dir, "reference_files.txt")
with open(ref_path, "w") as f:
    f.write("\n".join(ref_all) + "\n" if ref_all else "")

# Compute accuracy metrics
ref_set = set(ref_source)
agent_set = set(agent_source)

overlap = ref_set & agent_set
agent_extra = agent_set - ref_set

recall = len(overlap) / len(ref_set) if ref_set else 0.0
precision = len(overlap) / len(agent_set) if agent_set else 0.0
f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

result = {
    "ref_source_files": sorted(ref_set),
    "agent_source_files": sorted(agent_set),
    "overlap_files": sorted(overlap),
    "agent_extra_files": sorted(agent_extra),
    "ref_source_count": len(ref_set),
    "agent_source_count": len(agent_set),
    "overlap_count": len(overlap),
    "recall": round(recall, 4),
    "precision": round(precision, 4),
    "f1": round(f1, 4),
    "produced_patch": len(agent_all) > 0
}

print(json.dumps(result, indent=2))
SCORE_EOF

# Extract metrics for summary
RECALL=$(python3 -c "import json; print(json.load(open('$RUN_DIR/accuracy.json'))['recall'])" 2>/dev/null || echo "0")
PRECISION=$(python3 -c "import json; print(json.load(open('$RUN_DIR/accuracy.json'))['precision'])" 2>/dev/null || echo "0")
F1=$(python3 -c "import json; print(json.load(open('$RUN_DIR/accuracy.json'))['f1'])" 2>/dev/null || echo "0")
FILE_OVERLAP=$(python3 -c "import json; print(json.load(open('$RUN_DIR/accuracy.json'))['overlap_count'])" 2>/dev/null || echo "0")
FILE_OVERLAP_RATIO="$RECALL"

echo "Recall:    $RECALL (did agent touch the right files?)"
echo "Precision: $PRECISION (did agent avoid wrong files?)"
echo "F1:        $F1"

# Write full summary (python handles all JSON escaping)
ISSUE_JSON_PATH="$RUN_DIR/issue.json" \
ACCURACY_JSON_PATH="$RUN_DIR/accuracy.json" \
S_REPO="$REPO" S_ISSUE="$ISSUE" S_CONDITION="$CONDITION" \
S_RUN_ID="$RUN_ID" S_MODEL="$CLAUDE_MODEL" S_SHA="$CURRENT_SHA" \
S_TIME_MS="$AGENT_MS" S_PATCH="$PATCH_LINES" S_FILES="$FILES_CHANGED" \
S_INPUT="$TOTAL_INPUT_TOKENS" S_OUTPUT="$TOTAL_OUTPUT_TOKENS" \
S_TOOLS="$TOOL_CALLS" S_TURNS="$TURNS" S_PR="${PR_NUMBER:-0}" \
python3 << 'SUMEOF' > "$RUN_DIR/summary.json"
import json, os
from datetime import datetime, timezone

# Load issue title safely from JSON
title = ""
try:
    with open(os.environ["ISSUE_JSON_PATH"]) as f:
        title = json.load(f).get("title", "")
except: pass

# Load accuracy metrics
acc = {}
try:
    with open(os.environ["ACCURACY_JSON_PATH"]) as f:
        acc = json.load(f)
except: pass

e = os.environ
summary = {
    "repo": e["S_REPO"],
    "issue": int(e["S_ISSUE"]),
    "issue_title": title,
    "condition": e["S_CONDITION"],
    "run_id": e["S_RUN_ID"],
    "model": e["S_MODEL"],
    "repo_sha": e["S_SHA"],
    "agent_time_ms": int(e["S_TIME_MS"]),
    "patch_lines": int(e["S_PATCH"].strip()),
    "files_changed": int(e["S_FILES"].strip()),
    "input_tokens": int(e["S_INPUT"]),
    "output_tokens": int(e["S_OUTPUT"]),
    "tool_calls": int(e["S_TOOLS"]),
    "turns": int(e["S_TURNS"]),
    "produced_patch": acc.get("produced_patch", False),
    "pr_number": int(e["S_PR"]),
    "file_overlap": acc.get("overlap_count", 0),
    "file_overlap_ratio": acc.get("recall", 0),
    "recall": acc.get("recall", 0),
    "precision": acc.get("precision", 0),
    "f1": acc.get("f1", 0),
    "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
}
print(json.dumps(summary, indent=2))
SUMEOF

echo ""
echo "=== Run complete ==="
echo "Condition:     $CONDITION"
echo "Time:          $(( AGENT_MS / 1000 ))s"
echo "Accuracy:      recall=$RECALL  precision=$PRECISION  f1=$F1"
echo "Turns:         $TURNS"
echo "Files changed: $FILES_CHANGED"
echo "Patch lines:   $PATCH_LINES"
echo "Results:       $RUN_DIR"
