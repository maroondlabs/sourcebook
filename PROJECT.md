# sourcebook

**Extract the conventions, constraints, and architectural truths your AI coding agents keep missing.**

sourcebook is a CLI that analyzes a codebase and generates context files (CLAUDE.md, .cursorrules, copilot-instructions) containing only non-discoverable information -- things agents can't figure out by reading the code alone.

## Why This Exists

AI coding agents (Claude Code, Cursor, Copilot) spend 76% of their tokens just orienting -- reading files to build a mental model before doing any real work. Developers manually write context files, but most are generic and go stale within days.

The ETH Zurich study (Feb 2026) proved that auto-generated context files containing obvious information (tech stack, directory structure) actually make agents **worse** by 2-3%. The only context that helps is **non-discoverable information** -- conventions, constraints, and architectural truths agents can't infer from code alone.

sourcebook inverts the typical approach: instead of dumping everything, it extracts ONLY what agents keep missing, filtered through a discoverability test, and formatted for how LLMs actually process information.

## How It Works

```
npx sourcebook init
```

One command. Analyzes the codebase across four dimensions:

### 1. Static Code Analysis
- Framework detection (Next.js, Expo, Supabase, Tailwind, Express, TypeScript)
- Convention inference (naming patterns, export style, import organization, barrel exports)
- Environment variable mapping (public vs. private, documented vs. undocumented)
- Build/test/lint command detection
- Project structure classification (feature-based, layer-based, monorepo)

### 2. Import Graph + PageRank
- Builds a directed graph of all import relationships
- Runs PageRank to rank files by structural importance
- Identifies hub files (highest fan-in -- most depended upon)
- Detects circular dependencies
- Finds orphan files (potential dead code)

### 3. Git History Forensics
- **Reverted commits** -- literal "don't do this" signals from past attempts that failed
- **Co-change coupling** -- files that always change together across directories (invisible dependencies no import graph reveals)
- **Rapid re-edits** -- files edited 5+ times in a week (code that was hard to get right)
- **Active development areas** -- where changes are concentrated in the last 30 days
- **Commit message patterns** -- detects Conventional Commits usage and common scopes

### 4. Context-Rot-Aware Output
Based on Chroma Research (2026) showing LLMs have 30%+ accuracy drops for information in the middle of long contexts:
- **Critical constraints** (hidden deps, fragile code, circular deps) go at the **top**
- Lightweight reference info (stack, structure) goes in the **middle**
- **Action prompts** ("what to add manually") go at the **bottom**

This matches the U-shaped attention curve: LLMs retain the beginning and end of context best.

## Architecture

```
sourcebook/                     2,044 lines of TypeScript
├── src/
│   ├── cli.ts                  CLI entry point (commander)
│   ├── types.ts                Core types (Finding, ProjectScan)
│   ├── commands/
│   │   └── init.ts             Main init command orchestration
│   ├── scanner/
│   │   ├── index.ts            Scanner orchestrator (runs all analyzers)
│   │   ├── frameworks.ts       Framework detection (Next.js, Expo, Supabase, Tailwind, TS)
│   │   ├── build.ts            Build/test command detection from package.json/Makefile
│   │   ├── structure.ts        Project layout analysis (monorepo, feature-based, co-located tests)
│   │   ├── patterns.ts         Code pattern detection (barrel exports, imports, env vars, errors, exports)
│   │   ├── git.ts              Git history forensics (reverts, co-change, churn, commit patterns)
│   │   └── graph.ts            Import graph builder + PageRank + cycle detection
│   ├── generators/
│   │   └── claude.ts           CLAUDE.md generator with context-rot-aware formatting
│   └── utils/
│       └── output.ts           File writer
├── package.json
└── tsconfig.json
```

### Data Flow

```
Codebase
  │
  ├─→ File Scanner (glob) ──→ file list, language detection
  │
  ├─→ Framework Detector ──→ Next.js, Expo, Supabase, etc. + framework-specific findings
  │     reads: all package.json files (root + workspace packages)
  │
  ├─→ Build Detector ──→ dev/build/test/lint commands
  │     reads: package.json scripts, Makefile, pyproject.toml
  │
  ├─→ Structure Analyzer ──→ layout pattern, entry points, directory map
  │     reads: directory tree, file patterns
  │
  ├─→ Pattern Detector ──→ conventions (naming, imports, exports, env, errors)
  │     reads: 50 sampled source files (prioritizes entry points + configs)
  │
  ├─→ Git Analyzer ──→ reverts, co-change coupling, churn, active areas, commit patterns
  │     reads: git log (last 6-12 months, up to 300 commits)
  │
  └─→ Graph Analyzer ──→ PageRank scores, hub files, cycles, orphans
        reads: all source file imports, builds directed graph
  │
  ▼
ProjectScan (unified scan result)
  │
  ▼
CLAUDE.md Generator
  │  applies: discoverability filter (drop obvious facts)
  │  applies: criticality ranking (critical → top, supplementary → middle)
  │  applies: context-rot-aware layout (U-shaped attention curve)
  │
  ▼
CLAUDE.md (output file)
```

### Key Design Decisions

**No LLM dependency for core analysis.** Everything is deterministic, fast, and free. No API keys needed. An optional `--ai` flag for natural language polish is planned but not required.

**Regex-based import extraction, not full AST.** For graph building, regex on import/export/require statements is sufficient and 10x faster than full Tree-sitter parsing. Tree-sitter is planned for deeper convention analysis (naming patterns by AST context).

**File sampling for pattern detection.** Instead of reading every file, we sample 50 files prioritizing entry points and configs. This keeps analysis fast (sub-second on most projects) while capturing dominant patterns.

**Monorepo awareness.** Framework detection reads ALL package.json files in the project, not just the root. This catches dependencies in workspace packages.

## Test Results

Tested on 4 real maroond projects of varying size and stack:

### crowned (Expo + Supabase, 3,467 files)
**15 findings:**
- Critical: ThemeContext.tsx imported by 684 files (highest blast radius), circular dep in brain-api.ts ↔ chat.ts, hidden coupling between useTodayBrain.ts and brain-api.ts
- Conventions: barrel exports (35 index files), path aliases (@/), named exports (25:6 ratio), EAS Build required
- History: profile.tsx had 18 rapid edits in one week, src/ had 265 changes in 30 days, Conventional Commits detected

### ReportCraft (Vite + Express monorepo, 163 files)
**8 findings:**
- Critical: auth.ts middleware imported by 11 files, reportBlueprint.ts by 10
- Structure: monorepo detected, co-located tests
- History: frontend/ dominates with 99 changes, App.tsx had 5 rapid edits
- 15 dead code candidates identified

### marooondAI (Vite + React, 116 files)
**7 findings:**
- Hidden dependency: App.tsx ↔ tailwind.config.js always change together
- Tailwind custom color tokens detected
- FloatingNav.tsx is the hub component (5 importers)
- Named export preference (37:10 ratio)

### morningof (Next.js + Supabase, 281 files)
**8 findings:**
- Strong path alias preference (45 alias vs 6 relative imports)
- 18 env vars mapped (public NEXT_PUBLIC_* vs private)
- Core modules: types/index.ts (10 importers), timeline.ts (8)
- Active: .claude/ had 96 changes, dashboard/ had 56

### Performance
- crowned (3,467 files): ~3 seconds
- ReportCraft (163 files): <1 second
- marooondAI (116 files): <1 second
- morningof (281 files): ~1 second

## What Makes This Different

### vs. Repomix (22K stars)
Repomix packs entire repos into one file. No intelligence about what matters. Massive token waste. sourcebook extracts ONLY non-discoverable truths.

### vs. ContextPilot
Detects frameworks by checking package.json dependency names. No code analysis, no git history, no graph analysis. 0 GitHub stars.

### vs. Rulegen
Interview-based -- asks the developer questions. No automated analysis. Good philosophy ("Claude can read your code, it can't read your mind") but requires manual effort every time.

### vs. codebrief
File concatenation tool. No convention detection, no git analysis, no graph analysis.

### The combination no one else does:
1. **Behavioral forensics** -- extracting implicit knowledge from how code evolved (git history)
2. **Graph-based importance ranking** -- PageRank on the import graph
3. **Discoverability filtering** -- dropping what agents already know
4. **Context-rot-aware formatting** -- structured for how LLMs actually process information

## Roadmap

### v0.3 (next)
- `.cursorrules` and `copilot-instructions.md` output generators
- Tree-sitter AST parsing for deeper naming convention detection
- `sourcebook update` command (re-analyze, preserve manual edits)
- `--budget <tokens>` enforcement with PageRank-based prioritization

### v0.4
- Framework knowledge packs (community-contributed)
- `sourcebook diff` -- show what changed since last generation
- GitHub Action for CI (keep context files fresh on every push)
- Anti-pattern generation from reverted commits

### v0.5
- `sourcebook serve` -- MCP server mode for queryable context
- Decision shadow capture (reconstruct WHY from commit patterns)
- Load-bearing code detection (high fan-in + low churn + departed author)
- Drift detection (alert when context diverges from code)

### v1.0
- Hosted dashboard (context quality scores, team conventions)
- Pack marketplace (community + premium framework packs)
- Self-evaluating context (measure and improve context quality over time)

## Stack

- TypeScript (ESM)
- commander (CLI)
- glob (file scanning)
- chalk (terminal output)
- git (via child_process for history analysis)
- No external dependencies for graph analysis (custom PageRank implementation)

## Revenue Model

| Tier | Price | Features |
|------|-------|----------|
| Free | $0 | CLI, all generators, community packs |
| Pro | $12/mo | Private repos, `update` (preserves edits), priority packs |
| Team | $29/mo/seat | Shared conventions, org-wide packs, dashboard, CI |

## Research Foundation

This project is built on findings from:
- **ETH Zurich AGENTS.md study** (Feb 2026) -- auto-generated obvious context hurts agent performance
- **Karpathy's autoresearch** -- program.md (curated context) is the #1 lever for agent effectiveness
- **Aider's repo-map** -- PageRank on import graphs for structural importance ranking
- **Chroma's Context Rot research** (2026) -- LLMs show 30%+ accuracy drops for middle-of-context information
- **SWE-Pruner** (Jan 2026) -- 23-54% token reduction while maintaining accuracy via relevance scoring
- **Codified Context paper** (Feb 2026) -- hot/cold memory architecture for agent context
