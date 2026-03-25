# Contributing to sourcebook

Thanks for your interest in contributing.

## Quick Start

```bash
git clone https://github.com/maroondlabs/sourcebook.git
cd sourcebook
npm install
npm run dev -- init   # Run against current directory
```

## Project Structure

```
src/
├── cli.ts              # CLI entry (commander)
├── types.ts            # Core types
├── commands/init.ts    # Main init command
├── scanner/            # Analysis engines
│   ├── index.ts        # Orchestrator
│   ├── frameworks.ts   # Framework detection
│   ├── build.ts        # Build command detection
│   ├── structure.ts    # Project layout analysis
│   ├── patterns.ts     # Convention detection
│   ├── git.ts          # Git history forensics
│   └── graph.ts        # Import graph + PageRank
├── generators/
│   └── claude.ts       # CLAUDE.md output
└── utils/output.ts     # File writer
```

## Adding a Framework Pack

Framework packs teach sourcebook about framework-specific conventions. To add one:

1. Add detection logic in `src/scanner/frameworks.ts`
2. Add framework-specific findings (common gotchas, required configs, etc.)
3. Test against a real project using that framework
4. Submit a PR with a description of what the pack detects and why it matters

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation
- `refactor:` — code change that neither fixes a bug nor adds a feature

## Testing

```bash
npm test
```

Tests use fixture repos (small synthetic codebases) in `test/fixtures/`.

## Code Style

- TypeScript, ESM
- No semicolons (prettier default)
- Prefer named exports
- Keep functions small and focused
