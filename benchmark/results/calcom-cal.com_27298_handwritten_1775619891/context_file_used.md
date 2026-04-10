# CLAUDE.md — Cal.com

Cal.com is an open-source scheduling platform. This is a Turborepo monorepo.

## Stack

- TypeScript, Next.js (App Router), tRPC, Prisma, Tailwind CSS
- Monorepo managed by Turborepo with pnpm workspaces
- Apps in `apps/web/` (main web app), packages in `packages/`

## Key Directories

- `apps/web/` — main Next.js application
- `packages/features/` — feature modules (booking, auth, teams, etc.)
- `packages/ui/` — shared UI components
- `packages/lib/` — shared utilities
- `packages/prisma/` — database schema and migrations
- `packages/trpc/` — tRPC router definitions
- `packages/i18n/` — internationalization, locale files in `locales/`
- `packages/app-store/` — third-party app integrations (Google, Zoom, Stripe, PayPal, etc.)

## Conventions

- Use `useLocale()` hook from `@calcom/lib/hooks/useLocale` for all user-facing strings
- Translation keys go in `packages/i18n/locales/en/common.json`
- Components use `t("key_name")` pattern for translated strings
- Named exports preferred over default exports
- Path aliases: `@calcom/` maps to `packages/`
- App integrations live in `packages/app-store/<app-name>/`

## Commands

- `pnpm dev` — start dev server
- `pnpm build` — build all packages
- `pnpm test` — run tests
- `pnpm lint` — lint all packages

## Important

- Always use the i18n system for user-facing text, never hardcode strings
- The `packages/app-store/` directory contains per-app integration code
- Each app has its own `components/`, `lib/`, and `api/` directories
