# CLAUDE.md

## About This Project
Acme is a B2B scheduling platform built with Next.js, TypeScript, and
Supabase. We use Tailwind CSS for styling and Prisma for database access.
The project is organized as a monorepo using Turborepo.

## Tech Stack
- Next.js 15 (App Router)
- TypeScript 5.4
- Supabase (auth + database)
- Prisma ORM
- Tailwind CSS
- tRPC for API layer
- Turborepo monorepo

## Project Structure
```
apps/
  web/          — main web application
  dashboard/    — admin dashboard
  docs/         — documentation site
packages/
  ui/           — shared component library
  db/           — Prisma schema and client
  auth/         — authentication utilities
  email/        — email templates
  config/       — shared tsconfig, eslint
```

## Development
```bash
npm install
npm run dev        # starts all apps
npm run build      # builds everything
npm run test       # runs vitest
npm run lint       # eslint + prettier
```

## Code Conventions
- Use TypeScript strict mode
- Use named exports
- Components go in `components/` directory
- Keep files small and focused
- Write tests for business logic

## Database
- Prisma schema is in `packages/db/prisma/schema.prisma`
- Run `npx prisma migrate dev` for migrations
- Seed data: `npx prisma db seed`

## Environment Variables
Copy `.env.example` to `.env.local` and fill in the values.
