# sourcebook

Generate AI context files from your codebase's actual conventions. Not what agents already know — what they keep missing.

```bash
npx sourcebook init
```

One command. Analyzes your codebase. Outputs a `CLAUDE.md` tuned for how your project actually works.

## Why

AI coding agents spend most of their context window just orienting — reading files to build a mental model before doing real work. Developers manually write context files (`CLAUDE.md`, `.cursorrules`, `copilot-instructions.md`), but most are generic and go stale fast.

Research shows auto-generated context that restates obvious information (tech stack, directory structure) actually makes agents [worse by 2-3%](https://arxiv.org/abs/2502.09601). The only context that helps is **non-discoverable information** — things agents can't figure out by reading the code alone.

sourcebook inverts the typical approach: instead of dumping everything, it extracts only what agents keep missing, filtered through a discoverability test.

## What It Finds

- **Import graph + PageRank** — ranks files by structural importance, identifies hub files with the widest blast radius
- **Git history forensics** — reverted commits (literal "don't do this" signals), co-change coupling (invisible dependencies), rapid re-edits (code that was hard to get right)
- **Convention detection** — naming patterns, export style, import organization, barrel exports, path aliases
- **Framework detection** — Next.js, Expo, Supabase, Tailwind, Express, TypeScript configs
- **Context-rot-aware formatting** — critical constraints at the top, reference info in the middle, action prompts at the bottom (optimized for LLM attention patterns)

## Quick Start

```bash
# Generate CLAUDE.md for your project
npx sourcebook init

# Specify output format
npx sourcebook init --format claude    # CLAUDE.md (default)
```

## Example Output

Running `npx sourcebook init` on a real Expo + Supabase project (3,467 files):

```
sourcebook v0.1.0

Scanning project...
  Detected: Expo, Supabase, TypeScript, EAS Build
  Files: 3,467 across 847 directories
  Build: npx expo start | eas build

Analyzing import graph...
  Hub files: ThemeContext.tsx (684 importers), brain-api.ts (42 importers)
  Circular: brain-api.ts ↔ chat.ts
  Orphans: 23 potentially dead files

Mining git history (287 commits)...
  Reverts: 2 found
  Co-change coupling: useTodayBrain.ts ↔ brain-api.ts (89% correlation)
  Rapid edits: profile.tsx (18 edits in one week)
  Active areas: src/ (265 changes in 30 days)

Detecting conventions...
  Barrel exports: 35 index files
  Path aliases: @/ prefix
  Named exports preferred (25:6 ratio)
  Conventional Commits: yes

Generated: CLAUDE.md (15 findings, 1.2K tokens)
Done in 2.8s
```

## How It Works

sourcebook runs four analysis passes, all deterministic and local — no LLM, no API keys, no network calls:

1. **Static analysis** — framework detection, build commands, project structure, environment variables
2. **Import graph** — builds a directed graph of all imports, runs PageRank to find the most structurally important files
3. **Git forensics** — mines commit history for reverts, co-change patterns, churn hotspots, and development velocity
4. **Convention inference** — samples source files to detect naming, import, export, and error handling patterns

Then applies a **discoverability filter**: for every finding, asks "can an agent figure this out by reading the code?" If yes, drops it. Only non-discoverable information makes it to the output.

Output is formatted for **context-rot resistance** — critical constraints go at the top and bottom of the file (where LLMs pay the most attention), lightweight reference info goes in the middle.

## Roadmap

- [ ] `.cursorrules` output format
- [ ] `copilot-instructions.md` output format
- [ ] `sourcebook update` — re-analyze while preserving manual edits
- [ ] `--budget <tokens>` — PageRank-based prioritization within a token limit
- [ ] Framework knowledge packs (community-contributed)
- [ ] Tree-sitter AST parsing for deeper convention detection
- [ ] GitHub Action for CI (auto-update context on merge)
- [ ] `sourcebook serve` — MCP server mode

## Research Foundation

Built on findings from:
- [ETH Zurich AGENTS.md study](https://arxiv.org/abs/2502.09601) — auto-generated obvious context hurts agent performance
- [Karpathy's autoresearch](https://github.com/karpathy/autoresearch) — curated context (`program.md`) is the #1 lever for agent effectiveness
- [Aider's repo-map](https://aider.chat/docs/repomap.html) — PageRank on import graphs for structural importance
- Chroma's context-rot research — LLMs show 30%+ accuracy drops for middle-of-context information

## License

MIT
