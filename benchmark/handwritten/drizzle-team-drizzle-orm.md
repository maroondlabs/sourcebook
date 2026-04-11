# CLAUDE.md — Drizzle ORM

TypeScript ORM with SQL-like query builder. Supports PostgreSQL, MySQL, SQLite.

## Key Directories

- `drizzle-orm/src/` — core ORM source
- `drizzle-orm/src/pg-core/` — PostgreSQL dialect
- `drizzle-orm/src/mysql-core/` — MySQL dialect
- `drizzle-orm/src/sqlite-core/` — SQLite dialect
- `drizzle-kit/` — CLI migration tool
- `integration-tests/` — dialect-specific integration tests

## Commands

- `pnpm install` — install (monorepo)
- `pnpm build` — build
- `pnpm test` — run tests (vitest)

## Conventions

- Monorepo with pnpm workspaces
- Each database dialect follows the same pattern (table, column, query builder)
- Type inference is critical — query results must be fully typed
- Tests use vitest

## Important

- Type-level query building is core to Drizzle — type changes have wide impact
- Each dialect has its own column types, but shares the query builder interface
- `drizzle-orm/src/sql/` contains the SQL template literal system — the foundation
- Integration tests require actual database connections
