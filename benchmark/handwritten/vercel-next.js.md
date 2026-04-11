# CLAUDE.md — Next.js

React framework for production. Server-side rendering, static generation, file-system routing.

## Key Directories

- `packages/next/` — core framework source
- `packages/next/src/server/` — server runtime
- `packages/next/src/client/` — client runtime
- `packages/next/src/build/` — build pipeline (webpack/turbopack)
- `test/` — integration and unit tests
- `turbopack/` — Rust-based bundler

## Commands

- `pnpm install` — install (monorepo)
- `pnpm build` — build next.js
- `pnpm test` — run test suite
- `pnpm testheadless` — run integration tests

## Conventions

- Monorepo with turborepo
- Tests use jest (unit) and playwright (e2e)
- Server and client code are strictly separated
- App Router (app/) vs Pages Router (pages/) are distinct codepaths
- Use existing patterns from similar features when adding new ones

## Important

- `packages/next/src/shared/lib/` contains code shared between server and client
- Middleware runs at the edge — limited Node.js APIs
- The build pipeline has webpack and turbopack paths — changes may need both
- Error handling differs between dev and production modes
