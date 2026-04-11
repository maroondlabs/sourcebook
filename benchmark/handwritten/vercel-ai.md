# CLAUDE.md — Vercel AI SDK

TypeScript SDK for building AI-powered apps. Provides a unified API across LLM providers.

## Key Directories

- `packages/ai/` — core SDK (streams, tools, embeddings)
- `packages/provider/` — base provider interface
- `packages/openai/`, `packages/anthropic/`, etc. — provider implementations
- `packages/react/`, `packages/svelte/`, `packages/vue/` — framework hooks
- `examples/` — example apps (reference only, don't modify)

## Commands

- `pnpm install` — install dependencies (monorepo, uses pnpm workspaces)
- `pnpm build` — build all packages
- `pnpm test` — run tests (vitest)
- `pnpm lint` — eslint

## Conventions

- Monorepo with turborepo
- Each provider package follows the same interface from `@ai-sdk/provider`
- Streaming uses ReadableStream and async iterables
- Tests use vitest, co-located with source files
- Use `pnpm changeset` for version management

## Important

- Provider packages must implement the `LanguageModel` interface
- Core streaming logic lives in `packages/ai/core/`
- The `useChat` and `useCompletion` hooks are the main React entry points
- Don't break the provider interface — it's the public API contract
