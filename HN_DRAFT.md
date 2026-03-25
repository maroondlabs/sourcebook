# Show HN Draft

## Title Options (pick one)

**1. Mechanism-forward (recommended for HN)**
> Show HN: sourcebook – Generate CLAUDE.md from import graph PageRank and git forensics

**2. Problem-forward (broadest reach)**
> Show HN: sourcebook – Auto-generated AI context files that don't make agents worse

**3. Output-forward (most concrete)**
> Show HN: sourcebook – Generate CLAUDE.md, .cursorrules, and copilot-instructions from codebase analysis

**4. Inversion angle**
> Show HN: sourcebook – CLI that generates AI context files by filtering out what AI already knows

---

## Link

https://github.com/maroondlabs/sourcebook

---

## Maker Comment

Built this because I kept manually maintaining CLAUDE.md files that went stale the moment I merged a new feature. Every automated alternative I tried either dumped the directory tree (which agents already know) or restated the tech stack (which agents already know).

The tool that finally unblocked me was aider's repo-map — it uses PageRank on the import graph to find structurally important files. I added git forensics on top: reverted commits are literal "don't do this again" signals, co-change coupling exposes invisible dependencies, rapid re-edit churn tells you which code was hard to get right. None of that is in the code — it's only in the history.

The filter that makes it actually useful: before writing any finding to the output, sourcebook asks "can an agent figure this out by reading the files?" If yes, it's dropped. This is grounded in a 2025 ETH Zurich study (arxiv 2502.09601) that found auto-generated obvious context degrades agent performance by 2-3%. The only context that helps is what agents keep missing.

No API keys. No LLM in the pipeline. Everything is deterministic and runs locally. One command:

    npx sourcebook init

Outputs CLAUDE.md, .cursorrules, or copilot-instructions.md depending on your editor. Tested on cal.com (10K files — found circular deps, a file imported by 183 others, and 1.9K dead code candidates in ~3 seconds).

Curious whether the discoverability filter holds up on codebases I haven't tested. Would love edge cases — especially monorepos and legacy Python.

---

## Posting Strategy

- **When:** Sunday 11:00-16:00 UTC (highest breakout rate per Myriade data) OR Tuesday 8:30-10:00 ET (conventional wisdom)
- **Be in comments for 6+ hours** answering questions
- **Have ready answers for:**
  - "Why not just use Repomix?" → Different job. Repomix packs your codebase for LLM consumption. sourcebook generates persistent instruction files about implicit rules. Like comparing a zip file to a style guide.
  - "Why not just use Claude Code's /init?" → /init output is generic and goes stale. sourcebook does actual code analysis — import graphs, git history, convention detection.
  - "Does this use AI?" → No. Everything is deterministic. No API keys, no network calls. Optional --ai flag planned but core analysis is pure static analysis + git.
  - "What about Python/Go/Rust?" → TypeScript/JavaScript first. Python and Go are on the roadmap. The graph and git analysis already work on any language; the convention detection is what needs per-language support.
  - "How is this different from ContextPilot?" → ContextPilot detects your stack and generates generic rules. sourcebook does deep analysis — PageRank on imports, git forensics, convention inference from code patterns.

## Notes

- Do NOT re-pitch the product in replies. Answer the question, share a detail, move on.
- Acknowledge limitations honestly. "That's a fair point" > "actually you're wrong"
- If someone finds a bug, thank them and fix it live. HN loves seeing responsiveness.
