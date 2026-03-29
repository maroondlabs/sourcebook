---
description: Project conventions and constraints extracted by sourcebook
alwaysApply: true
---

## Commands

- Dev: `turbo run dev --filter="@calcom/web"`
- Build: `turbo run build --filter=@calcom/web...`
- Test: `TZ=UTC vitest run`
- Lint: `turbo lint`

## Constraints

- Tests are co-located with source files (*.test.ts next to *.ts). Keep this pattern -- don't create a separate test/ directory.
- Generated files detected (vitest-mocks/tailwind.generated.css, packages/app-store/video.adapters.generated.ts, packages/app-store/redirect-apps.generated.ts, packages/app-store/payment.services.generated.ts, packages/app-store/crm.apps.generated.ts, ...). Do NOT edit these directly — modify the source/schema they are generated from.
- Uses Conventional Commits (feat/fix/docs/etc). Common scopes: i18n, e2e, calendar, form-builder, unified-cal. Follow this pattern for new commits.
- Hub files (most depended on): packages/trpc/server/types.ts (imported by 183 files); apps/web/playwright/lib/fixtures.ts (imported by 86 files); packages/platform/atoms/lib/http.ts (imported by 72 files); packages/features/di/di.ts (imported by 60 files); packages/app-store/_utils/getAppKeysFromSlug.ts (imported by 53 files). Changes here have the widest blast radius.
- Circular import chains detected: bookingScenario.ts → getMockRequestDataForBooking.ts → bookingScenario.ts; create-event-type.input.ts → CantHaveRecurrenceAndBookerActiveBookingsLimit.ts → create-event-type.input.ts; handleMarkNoShow.ts → handleSendingAttendeeNoShowDataToApps.ts → handleMarkNoShow.ts. Avoid adding to these cycles.

## Stack

Next.js, Tailwind CSS, TypeScript

## Core Modules

- `packages/features/webhooks/lib/dto/types.ts`
- `packages/features/webhooks/lib/interface/IWebhookRepository.ts`
- `packages/trpc/server/types.ts`
- `packages/platform/atoms/lib/http.ts`
- `packages/app-store/_utils/getAppKeysFromSlug.ts`

## Conventions

- This is a monorepo. Changes may affect multiple packages. Check workspace dependencies before modifying shared code.
- Project uses barrel exports (index.ts files that re-export). Import from the directory, not from deep paths.
- Environment variables are documented in .env.example. Copy it to .env.local before running the project.
- Project strongly prefers named exports over default exports. Use `export function` / `export const`, not `export default`.
- User-facing strings use t("key") for internationalization. Add new translation keys in packages/i18n/locales/en/common.json.
- Use Zod schemas for validation. This is the project's standard validation approach.
- Data fetching uses React Query (useQuery/useMutation). Follow this pattern for new data operations.
- Tests use Chai/expect. Test utilities in: packages/testing/src/lib/fixtures/fixtures.ts.
- Auth uses auth hooks (useAuth/useSession/useUser). Auth logic lives in packages/trpc/server/routers/viewer/apiKeys/_auth-middleware.ts.
- Styling uses Tailwind CSS utility classes.
- Database access uses Prisma. Schema/models defined in packages/prisma/schema.prisma.
- Third-party integrations live under packages/app-store/ (zoomvideo, zohocrm, zohocalendar, zoho-bigin, zapier, wordpress, ...). Each integration has its own directory with components, lib, and API code.

## Additional Context

- 4 env vars detected. Public (browser-exposed): NEXT_PUBLIC_WEBAPP_URL. Private (server-only): CI, PLAYWRIGHT_HEADLESS, PWDEBUG.
- UI components live in: packages/ui, packages/ui/components, packages/trpc/components. Add new components here.
- Most active areas in the last 30 days: packages/ (6412 changes), apps/ (3432 changes), docs/ (320 changes), .yarn/ (240 changes), agents/ (105 changes). Expect ongoing changes here.
- Files that required many rapid edits (hard to get right): docs/api-reference/v2/openapi.json (5 edits in one week)
