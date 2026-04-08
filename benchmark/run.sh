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
cat > "$RUN_DIR/environment.json" << EOF
{
  "model": "$CLAUDE_MODEL",
  "max_turns": $MAX_TURNS,
  "harness_version": "0.2.0",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

# Step 1: Fetch issue and find the PR that fixed it
echo "[1/7] Fetching issue and PR info..."
gh issue view "$ISSUE" --repo "$REPO" --json title,body > "$RUN_DIR/issue.json"
ISSUE_TITLE=$(python3 -c "import sys,json; print(json.load(sys.stdin)['title'])" < "$RUN_DIR/issue.json")
ISSUE_BODY=$(python3 -c "import sys,json; print(json.load(sys.stdin)['body'][:2000])" < "$RUN_DIR/issue.json")

# Find the merged PR and its base commit (the state BEFORE the fix)
PR_JSON=$(gh pr list --repo "$REPO" --state merged --search "$ISSUE in:title" --json number,mergeCommit,headRefOid,baseRefOid,title --limit 5)
echo "$PR_JSON" > "$RUN_DIR/pr_info.json"

# Extract the base commit SHA (state before the fix was applied)
BASE_SHA=$(python3 -c "
import sys, json
prs = json.load(sys.stdin)
if prs:
    # Use baseRefOid if available, otherwise mergeCommit parent
    pr = prs[0]
    sha = pr.get('baseRefOid', '') or pr.get('mergeCommit', {}).get('oid', '')
    print(sha)
else:
    print('')
" < "$RUN_DIR/pr_info.json")

echo "Issue: $ISSUE_TITLE"
echo "Base SHA: ${BASE_SHA:0:12}..."

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
  gh repo clone "$REPO" "$WORK_DIR/$REPO_SHORT" -- --depth 500 --single-branch 2>/dev/null
  cd "$WORK_DIR/$REPO_SHORT"
fi

if [ -n "$BASE_SHA" ]; then
  git fetch --depth 500 origin "$BASE_SHA" 2>/dev/null || true
  git checkout "$BASE_SHA" -q 2>/dev/null || {
    echo "Warning: Could not checkout $BASE_SHA. Using HEAD."
  }
fi

# Record the exact commit we're working from
CURRENT_SHA=$(git rev-parse HEAD)
echo "{\"sha\": \"$CURRENT_SHA\", \"base_sha\": \"$BASE_SHA\"}" > "$RUN_DIR/repo_state.json"

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

# Step 7: Quality scoring
echo "[7/7] Scoring quality..."

# Score: did the agent produce any meaningful changes?
PRODUCED_PATCH="false"
if [ "$PATCH_LINES" -gt 0 ]; then
  PRODUCED_PATCH="true"
fi

# Write full summary
cat > "$RUN_DIR/summary.json" << SUMEOF
{
  "repo": "$REPO",
  "issue": $ISSUE,
  "issue_title": $(python3 -c "import json; print(json.dumps('$ISSUE_TITLE'))"),
  "condition": "$CONDITION",
  "run_id": "$RUN_ID",
  "model": "$CLAUDE_MODEL",
  "repo_sha": "$CURRENT_SHA",
  "agent_time_ms": $AGENT_MS,
  "patch_lines": $PATCH_LINES,
  "files_changed": $FILES_CHANGED,
  "input_tokens": $TOTAL_INPUT_TOKENS,
  "output_tokens": $TOTAL_OUTPUT_TOKENS,
  "tool_calls": $TOOL_CALLS,
  "turns": $TURNS,
  "produced_patch": $PRODUCED_PATCH,
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
SUMEOF

echo ""
echo "=== Run complete ==="
echo "Condition:     $CONDITION"
echo "Time:          $(( AGENT_MS / 1000 ))s"
echo "Input tokens:  $TOTAL_INPUT_TOKENS"
echo "Output tokens: $TOTAL_OUTPUT_TOKENS"
echo "Tool calls:    $TOOL_CALLS"
echo "Turns:         $TURNS"
echo "Files changed: $FILES_CHANGED"
echo "Patch lines:   $PATCH_LINES"
echo "Results:       $RUN_DIR"
