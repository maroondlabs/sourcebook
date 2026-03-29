# Reddit Post — r/programming

**Title:** I built a CLI that extracts the repo conventions AI coding agents keep missing

**Body:**

I've been using Claude Code and Cursor on real projects and noticed agents spend most of their time orienting — reading files to understand conventions they can never fully infer from code.

Tools like Repomix give the AI your whole codebase (millions of tokens). But the ETH Zurich study found that dumping obvious information actually makes agents worse.

So I built sourcebook. It analyzes your repo and generates context files (CLAUDE.md, .cursorrules, copilot-instructions.md, AGENTS.md) containing ONLY what agents can't figure out by reading code:

- Hub files ranked by import graph PageRank
- Git forensics (reverted commits, co-change coupling, fragile files)
- Conventions (naming, exports, imports, barrel files)
- Dominant patterns (how the project actually does i18n, auth, validation, data fetching)

One command: `npx sourcebook init`

No API keys, no LLM, runs locally in under 3 seconds.

We benchmarked it against handwritten developer briefs on real GitHub issues. sourcebook is approaching handwritten-quality context — automatically.

GitHub: https://github.com/maroondlabs/sourcebook
Site: https://sourcebook.run

Interested in feedback, especially from anyone using AI coding tools on large codebases.
