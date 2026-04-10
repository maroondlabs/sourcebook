#!/bin/bash
# QA regression test: scan known repos, check for known false positives
# Run after scanner changes to verify fixes and catch regressions
#
# Usage: bash test/qa-repos.sh
# Requires: repos cloned in /tmp/qa-* (run with --clone to set up)

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

check() {
  local repo=$1
  # Support both qa-* and adv-* prefixed repos
  local file="/tmp/qa-$repo/AGENTS.md"
  if [ ! -f "$file" ]; then
    file="/tmp/$repo/AGENTS.md"
  fi
  local desc=$2
  local pattern=$3
  local should_exist=$4  # "yes" or "no"

  if [ ! -f "$file" ]; then
    echo -e "  ${YELLOW}SKIP${NC} $desc — AGENTS.md not found (run with --clone)"
    WARN=$((WARN + 1))
    return
  fi

  local found=$(grep -c "$pattern" "$file" 2>/dev/null || true)

  if [ "$should_exist" = "yes" ] && [ "$found" -gt 0 ]; then
    echo -e "  ${GREEN}PASS${NC} $desc (found)"
    PASS=$((PASS + 1))
  elif [ "$should_exist" = "no" ] && [ "$found" -eq 0 ]; then
    echo -e "  ${GREEN}PASS${NC} $desc (correctly absent)"
    PASS=$((PASS + 1))
  elif [ "$should_exist" = "yes" ] && [ "$found" -eq 0 ]; then
    echo -e "  ${RED}FAIL${NC} $desc — expected but not found"
    FAIL=$((FAIL + 1))
  else
    echo -e "  ${RED}FAIL${NC} $desc — should not be present but found $found times"
    FAIL=$((FAIL + 1))
  fi
}

clone_repos() {
  echo "Cloning QA repos (full history)..."
  repos=(
    "honojs/hono:hono-clean"
    "elysiajs/elysia:elysia"
    "pallets/flask:flask"
    "schemathesis/schemathesis:schemathesis"
    "zizmorcore/zizmor:zizmor"
    "tiangolo/sqlmodel:sqlmodel"
    "gin-gonic/gin:gin"
    "go-co-op/gocron:gocron"
    "t3-oss/create-t3-app:create-t3"
    "voxel51/fiftyone:fiftyone"
  )
  for entry in "${repos[@]}"; do
    IFS=':' read -r repo slug <<< "$entry"
    if [ ! -d "/tmp/qa-$slug" ]; then
      echo "  Cloning $repo..."
      git clone "https://github.com/$repo.git" "/tmp/qa-$slug" 2>/dev/null
    else
      echo "  $slug already cloned"
    fi
  done
  echo ""
}

scan_repos() {
  echo "Scanning all QA repos..."
  for dir in hono-clean elysia flask schemathesis zizmor sqlmodel gin gocron create-t3 fiftyone; do
    if [ -d "/tmp/qa-$dir" ]; then
      echo "  Scanning $dir..."
      cd "/tmp/qa-$dir" && rm -f CLAUDE.md AGENTS.md
      npx tsx /Users/rhagent/Documents/sourcebook/src/cli.ts init 2>/dev/null
    fi
  done
  echo ""
}

# Handle --clone flag
if [ "$1" = "--clone" ]; then
  clone_repos
  scan_repos
fi

# Handle --scan flag
if [ "$1" = "--scan" ]; then
  scan_repos
fi

echo "========================================"
echo "SOURCEBOOK QA REGRESSION TESTS"
echo "========================================"
echo ""

# ─── Hono (TypeScript web framework, library) ───
echo "honojs/hono (TS framework, library):"
check "hono-clean" "Should detect: Hono routes" "Hono routes" "yes"
check "hono-clean" "Should detect: Vitest" "Vitest" "yes"
check "hono-clean" "Should detect: library" "publishable library" "yes"
check "hono-clean" "Should detect: barrel exports" "barrel exports" "yes"
check "hono-clean" "Should NOT detect: Zod" "Zod" "no"
check "hono-clean" "Should NOT detect: FastAPI" "FastAPI" "no"
check "hono-clean" "Should NOT detect: shallow clone" "shallow clone" "no"
echo ""

# ─── Elysia (TypeScript framework for Bun, library) ───
echo "elysiajs/elysia (TS/Bun framework, library):"
check "elysia" "Should detect: library" "publishable library" "yes"
check "elysia" "Should detect: barrel exports" "barrel exports" "yes"
check "elysia" "Should detect: custom error classes" "custom error" "yes"
check "elysia" "Should NOT detect: Zod" "Zod" "no"
check "elysia" "Should NOT detect: FastAPI" "FastAPI" "no"
check "elysia" "Should NOT detect: shallow clone" "shallow clone" "no"
echo ""

# ─── Flask (Python web framework, library) ───
echo "pallets/flask (Python framework, library):"
check "flask" "Should detect: Flask routes" "Flask routes" "yes"
check "flask" "Should detect: pytest" "pytest" "yes"
check "flask" "Should detect: library" "publishable library" "yes"
check "flask" "Should detect: __init__.py barrel" "__init__.py" "yes"
check "flask" "Should NOT detect: FastAPI" "FastAPI" "no"
check "flask" "Should NOT detect: Vitest" "Vitest" "no"
check "flask" "Should NOT detect: shallow clone" "shallow clone" "no"
echo ""

# ─── Schemathesis (API testing tool, NOT a FastAPI app) ───
echo "schemathesis/schemathesis (API testing tool, NOT FastAPI app):"
check "schemathesis" "Should detect: pytest" "pytest" "yes"
check "schemathesis" "Should detect: dataclasses" "dataclass" "yes"
check "schemathesis" "Should detect: library" "publishable library" "yes"
check "schemathesis" "Should NOT detect: FastAPI as stack" "^FastAPI$" "no"
check "schemathesis" "Should NOT detect: 'FastAPI project'" "FastAPI project" "no"
check "schemathesis" "Should NOT detect: shallow clone" "shallow clone" "no"
echo ""

# ─── Zizmor (Rust security tool, NOT a Python project) ───
echo "zizmorcore/zizmor (Rust project, NOT primarily Python):"
check "zizmor" "Should detect: library" "publishable library" "yes"
check "zizmor" "Should NOT detect: pytest as primary test" "Tests use pytest" "no"
check "zizmor" "Should NOT detect: FastAPI" "FastAPI" "no"
check "zizmor" "Should NOT detect: Zod" "Zod" "no"
check "zizmor" "Should NOT detect: shallow clone" "shallow clone" "no"
echo ""

# ─── SQLModel (ORM library, NOT a FastAPI app) ───
echo "tiangolo/sqlmodel (ORM library, NOT FastAPI app):"
check "sqlmodel" "Should detect: SQLAlchemy" "SQLAlchemy" "yes"
check "sqlmodel" "Should detect: Pydantic" "Pydantic" "yes"
check "sqlmodel" "Should detect: pytest" "pytest" "yes"
check "sqlmodel" "Should detect: library" "publishable library" "yes"
check "sqlmodel" "Should NOT detect: 'FastAPI project'" "FastAPI project" "no"
check "sqlmodel" "Should NOT detect: shallow clone" "shallow clone" "no"
echo ""

# ─── Gin (Go web framework) ───
echo "gin-gonic/gin (Go framework):"
check "gin" "Should detect: Gin routes" "Gin routes" "yes"
check "gin" "Should detect: Go testing" "Go testing" "yes"
check "gin" "Should detect: Go module" "Module path" "yes"
check "gin" "Should NOT detect: FastAPI" "FastAPI" "no"
check "gin" "Should NOT detect: Vitest" "Vitest" "no"
check "gin" "Should NOT detect: shallow clone" "shallow clone" "no"
echo ""

# ─── Gocron (Go scheduler library) ───
echo "go-co-op/gocron (Go scheduler, library):"
check "gocron" "Should detect: Go module" "Module path" "yes"
check "gocron" "Should detect: Go testing" "Go testing" "yes"
check "gocron" "Should detect: interfaces" "interface" "yes"
check "gocron" "Should NOT detect: FastAPI" "FastAPI" "no"
check "gocron" "Should NOT detect: Vitest" "Vitest" "no"
check "gocron" "Should NOT detect: shallow clone" "shallow clone" "no"
echo ""

# ─── Create-T3-App (TS starter kit, monorepo) ───
echo "t3-oss/create-t3-app (TS starter, monorepo):"
check "create-t3" "Should detect: tRPC" "tRPC" "yes"
check "create-t3" "Should detect: Zod" "Zod" "yes"
check "create-t3" "Should detect: Prisma" "Prisma" "yes"
check "create-t3" "Should detect: monorepo" "monorepo" "yes"
check "create-t3" "Should detect: Tailwind" "Tailwind" "yes"
check "create-t3" "Should NOT detect: FastAPI" "FastAPI" "no"
check "create-t3" "Should NOT detect: shallow clone" "shallow clone" "no"
echo ""

# ─── FiftyOne (Python ML platform) ───
echo "voxel51/fiftyone (Python ML platform):"
check "fiftyone" "Should detect: pytest" "pytest" "yes"
check "fiftyone" "Should detect: __init__.py barrel" "__init__.py" "yes"
check "fiftyone" "Should detect: generated files" "Generated files" "yes"
check "fiftyone" "Should NOT detect: FastAPI" "FastAPI" "no"
check "fiftyone" "Should NOT detect: shallow clone" "shallow clone" "no"
echo ""

# ═══════════════════════════════════════
# ADVERSARIAL REPOS (stress tests)
# ═══════════════════════════════════════

# ─── esbuild (Go binary with JS wrapper, NOT a web app) ───
echo "evanw/esbuild (Go binary, NOT a web app):"
check "adv-esbuild" "Should detect: Go module" "Module path" "yes"
check "adv-esbuild" "Should detect: Go testing" "Go testing" "yes"
check "adv-esbuild" "Should NOT detect: DRF permissions" "DRF permissions" "no"
check "adv-esbuild" "Should NOT detect: Express" "Express" "no"
check "adv-esbuild" "Should NOT detect: React routes/components" "React Query\|React Router\|UI components" "no"
echo ""

# ─── Biome (Rust linter, has JS/TS/Vue/Svelte test fixtures) ───
echo "biomejs/biome (Rust linter, NOT a web framework):"
check "adv-biome" "Should detect: monorepo" "monorepo" "yes"
check "adv-biome" "Should NOT detect: React routes/components" "React Query\|React Router\|UI components" "no"
check "adv-biome" "Should NOT detect: Vue" "Vue" "no"
check "adv-biome" "Should NOT detect: Svelte" "Svelte" "no"
check "adv-biome" "Should NOT detect: FastAPI" "FastAPI" "no"
echo ""

# ─── SponsorBlock (browser extension, NOT a web app) ───
echo "ajayyy/SponsorBlock (browser extension):"
check "adv-sponsorblock" "Should detect: Jest" "Jest" "yes"
check "adv-sponsorblock" "Should detect: named exports" "named exports" "yes"
check "adv-sponsorblock" "Should NOT detect: Express" "Express" "no"
check "adv-sponsorblock" "Should NOT detect: FastAPI" "FastAPI" "no"
echo ""

# ─── vLLM (ML engine with FastAPI serving, NOT a FastAPI app) ───
echo "vllm-project/vllm (ML engine, NOT FastAPI app):"
check "adv-vllm" "Should detect: library" "publishable library" "yes"
check "adv-vllm" "Should detect: pytest" "pytest" "yes"
check "adv-vllm" "Should detect: dataclasses" "dataclass" "yes"
check "adv-vllm" "Should NOT detect: 'FastAPI project'" "FastAPI project" "no"
echo ""

# ─── Polars (Rust DataFrame with Python bindings) ───
echo "pola-rs/polars (Rust engine with Python bindings):"
check "adv-polars" "Should detect: pytest" "pytest" "yes"
check "adv-polars" "Should detect: __init__.py barrel" "__init__.py" "yes"
check "adv-polars" "Should NOT detect: FastAPI" "FastAPI" "no"
echo ""

# ─── Summary ───
echo "========================================"
echo "RESULTS: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}, ${YELLOW}$WARN skipped${NC}"
echo "========================================"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
