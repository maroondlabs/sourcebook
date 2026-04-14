<p align="center">
  <img src="logo.png" alt="sourcebook" width="120" />
</p>

# sourcebook

**Catches the files your AI agent forgot to change.**

A safety layer for code changes. sourcebook analyzes git diffs for completeness — flags files that should've been modified but weren't. Rules-based structural detection plus AI-powered semantic analysis. Zero false positives on clean diffs.

```bash
npx sourcebook init          # sets up Claude Code hooks + generates CLAUDE.md
npx sourcebook check         # check your current diff for missing files
npx sourcebook scan-history  # see what you've been missing
```

## What It Catches

Your AI agent changed the handler. Did it update the test? The sibling module? The config that references the old value?

sourcebook checks your diff against the repo's actual structure:

- **Missing test files** — source file changed, test file didn't
- **Sibling modules** — files that import or are imported by what you changed
- **Co-change companions** — files that historically change together in git commits
- **Hub file blast radius** — you touched something with 50+ dependents

With `--ai`: cross-module semantic relationships, field renames that need migrations, stale validation logic.

## Key Stats

| Metric | Result |
|--------|--------|
| Completeness gate | 100% accurate (30/30 diffs) |
| False positive rate | 0% on clean diffs |
| Test file detection | 73% |
| Sibling detection | 71% |
| AI analysis cost | ~$0.012/run |

## Four Surfaces

### 1. CLI

Run it on any diff. No setup required.

```bash
npx sourcebook check              # check staged/unstaged changes
npx sourcebook check --ai         # add AI semantic analysis (requires ANTHROPIC_API_KEY)
npx sourcebook check --quiet      # exit code only (for CI/scripts)
npx sourcebook check --branch main  # compare vs a branch
```

### 2. Claude Code Hooks

One command wires up pre-commit hooks. Agent edits a file, sourcebook checks the diff, agent sees what's missing — all before the commit lands.

```bash
npx sourcebook init   # generates CLAUDE.md + installs hooks
```

### 3. MCP Server

Published on the official MCP registry. Agents can query repo structure, blast radius, conventions, and co-change data on demand.

```bash
npx sourcebook serve
```

Add to your MCP client:

```json
{
  "mcpServers": {
    "sourcebook": {
      "command": "npx",
      "args": ["-y", "sourcebook", "serve", "--dir", "/path/to/your/project"]
    }
  }
}
```

### 4. GitHub App (coming soon)

Automated completeness checks on every pull request. [Join the waitlist](https://sourcebook.run/teams).

## Commands

| Command | Description |
|---------|-------------|
| `sourcebook check` | Analyze current diff for completeness |
| `sourcebook check --ai` | Add AI-powered semantic analysis (requires ANTHROPIC_API_KEY) |
| `sourcebook check --quiet` | Exit code only — 1 if findings, 0 if clean |
| `sourcebook check --json` | Structured JSON output |
| `sourcebook check --branch main` | Compare HEAD against a branch |
| `sourcebook check --threshold 0.9` | Custom co-change coupling threshold (0-1) |
| `sourcebook init` | Set up Claude Code hooks + generate CLAUDE.md/AGENTS.md |
| `sourcebook scan-history` | Retrospective scan of recent commits |
| `sourcebook hooks` | Install or check Claude Code hooks |
| `sourcebook truth` | Generate a Repo Truth Map (2.5D visualization) |
| `sourcebook serve` | Start MCP server |
| `sourcebook update` | Re-analyze while preserving manual edits |
| `sourcebook diff` | Show what would change (exit code 1 if changes found) |
| `sourcebook watch` | Auto-regenerate context files on source changes |
| `sourcebook ask <query>` | Query codebase knowledge in natural language |

## How It Works

### Layer A — Rules-based (no LLM, <1 second)

1. **Co-change analysis** — mines git history for files that change together. If you touched `auth.ts` and it changes with `session.ts` in 88% of commits, sourcebook flags `session.ts`.
2. **Test file detection** — maps source files to test files via naming conventions and co-change history.
3. **Import graph** — builds a dependency graph and checks whether files that import (or are imported by) your changed files also need updates.
4. **Hub detection** — flags when you've modified a file with high fan-in (many dependents). These changes have blast radius.

### Layer B — AI-powered (~$0.012/run)

Sends the diff plus dependency context to Claude Sonnet. Catches semantic relationships Layer A can't see — field renames that need migrations, validation logic that assumes old schemas, cross-module dependencies with no import link.

Every AI suggestion requires a dependency citation. Hallucinated file paths are filtered out. The completeness gate ensures zero false positives: if the diff is actually complete, Layer B stays silent.

## Configuration

```bash
# Required for --ai flag only
export ANTHROPIC_API_KEY=sk-ant-...
```

No other configuration needed. sourcebook reads your repo's git history and file structure directly.

## Language Support

| Language | Import Graph | Git Analysis | Convention Detection |
|----------|:---:|:---:|:---:|
| TypeScript / JavaScript | Full | Full | Full |
| Python | Full | Full | Full |
| Go | Full | Full | Full |
| Rust | Full | Full | Partial |

## Research

Built on real benchmarks, not vibes:

- [Check validation results](https://sourcebook.run/research/check-validation) — methodology and accuracy data
- [Benchmark: 19 tasks, 10 repos, 4 languages](https://sourcebook.run/blog/19-tasks-10-repos-4-languages) — controlled agent performance testing
- [Why auto-generated context makes agents worse](https://sourcebook.run/blog/why-auto-generated-context-makes-agents-worse) — the ETH Zurich finding that shaped our approach

## License

BSL-1.1 — source-available, free to use, cannot be offered as a hosted service. Converts to MIT on 2030-03-25. See [LICENSE](./LICENSE) for details.

---

[sourcebook.run](https://sourcebook.run) · [GitHub](https://github.com/maroondlabs/sourcebook) · [npm](https://www.npmjs.com/package/sourcebook) · [@maroond_](https://x.com/maroond_)
