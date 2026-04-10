# CLAUDE.md — Hono

Hono is a small, fast web framework for the Edge. Works on Cloudflare Workers, Deno, Bun, Node.js.

## Stack

- TypeScript, zero dependencies in core
- Multi-runtime support (Cloudflare Workers, Deno, Bun, Node.js, AWS Lambda)
- Tests use vitest

## Key Directories

- `src/` — core framework code
- `src/router/` — routing implementations (RegExpRouter, TrieRouter, SmartRouter)
- `src/middleware/` — built-in middleware (cors, jwt, logger, etc.)
- `src/adapter/` — runtime-specific adapters
- `src/jsx/` — JSX runtime
- `src/client/` — RPC client (`hc`)
- `src/helper/` — helper utilities
- `deno_dist/` — auto-generated Deno distribution

## Conventions

- Named exports, no default exports
- Generic type parameters for request/response typing
- Middleware follows `MiddlewareHandler` type signature
- Router implementations share the `Router` interface
- Tests are co-located: `src/router/reg-exp-router/router.test.ts`

## Commands

- `yarn install` — install deps
- `yarn test` — run vitest
- `yarn build` — build all distributions
- `yarn lint:fix` — fix linting

## Important

- The framework must stay zero-dependency in core
- Performance is critical — benchmark before changing hot paths
- `Context` (`c`) object is the primary API surface
- Multiple router implementations exist for different tradeoffs
