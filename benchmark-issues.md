# Benchmark Issues for Context File Evaluation

Curated set of real, closed GitHub issues with merged PRs. Each task is scoped to test whether AI coding agents perform better with codebase context files.

---

## Repo 1: calcom/cal.com (TypeScript monorepo, ~10K files)

### CAL-1: PayPal Setup i18n — hardcoded strings
- **Issue:** #27907 — PayPal Setup component contains untranslated strings
- **PR:** #27908
- **Lines changed:** +65/-42 (2 files)
- **Task:** Replace hardcoded English strings in PayPal setup UI with translation keys using the project's i18n system.
- **Why good benchmark:** Requires understanding cal.com's i18n conventions (which translation file to use, key naming patterns, how `useLocale`/`t()` works). Context about the translation system and file structure directly helps.

### CAL-2: OAuth flow breaks on sign-up
- **Issue:** #27298 — Fix OAuth flow if sign up is required
- **PR:** #27307
- **Lines changed:** +101/-32 (2 files)
- **Task:** Fix the OAuth consent flow so users who need to sign up aren't kicked out of the OAuth redirect chain.
- **Why good benchmark:** Requires understanding the auth flow across multiple files, session handling patterns, and how cal.com's OAuth integration works. Deep dependency knowledge needed.

### CAL-3: Hours-to-days conversion bug
- **Issue:** #27963 — Incorrect logic in hours_days duration conversion
- **PR:** #27964
- **Lines changed:** +86/-1 (2 files)
- **Task:** Fix the `convertToNewDurationType` function that incorrectly converts hours to days (logic error in the conversion math).
- **Why good benchmark:** Requires locating the right utility file in the monorepo, understanding the duration type system, and adding tests. Context about `packages/lib/` conventions helps.

### CAL-4: API booking limits validation error
- **Issue:** #27988 — PATCH event type fails with "Booking limits must be in ascending order"
- **PR:** #28035
- **Lines changed:** +31/-3 (2 files)
- **Task:** Fix the interval limits transformer that leaks a `disabled` key into the booking limits validation, causing spurious errors on the V2 API.
- **Why good benchmark:** Requires understanding the data transformation pipeline between API input and internal validation. Tests knowledge of the transformer pattern used across the codebase.

### CAL-5: Localhost URL after booking confirmation
- **Issue:** #20358 — localhost URL after booking confirmation
- **PR:** #28144
- **Lines changed:** +52/-43 (4 files)
- **Task:** Fix redirect URLs that use localhost instead of WEBAPP_URL after booking confirmation via email links when behind a proxy.
- **Why good benchmark:** Requires understanding cal.com's environment variable system (`WEBAPP_URL`), the booking confirmation flow across multiple files, and how URLs are constructed throughout the app.

### CAL-6: "Use a different email" button missing on verify-email page
- **Issue:** #28393 — Can't correct wrong email after signup redirect
- **PR:** #28398
- **Lines changed:** +21/-11 (2 files)
- **Task:** Add a "Use a different email" button to the verify-email page so users can go back and fix a typo.
- **Why good benchmark:** Requires understanding the signup flow, page routing conventions, and UI component patterns (button styles, link behavior).

### CAL-7: Phone booking display label
- **Issue:** #13010 — Change phone bookings display from "Organizer Phone Number" to "Phone Call"
- **PR:** #27636
- **Lines changed:** +9/-9 (6 files)
- **Task:** Replace the confusing "Organizer Phone Number" label with "Phone Call" across 6 files in the booking display UI.
- **Why good benchmark:** Small change but touches 6 files — tests whether the agent can find all occurrences. Requires understanding the booking type system and where location-type labels are rendered.

### CAL-8: Image accessibility — add alt text
- **Issue:** #28468 — Add descriptive alt text to images
- **PR:** #28469
- **Lines changed:** +9/-5 (6 files)
- **Task:** Replace empty `alt=""` attributes with descriptive text across the app installation wizard and 2FA modals.
- **Why good benchmark:** Touches 6 files across different features. Tests ability to find all relevant images and write contextually appropriate alt text that matches the surrounding UI.

### CAL-9: Keycloak OIDC flow fix
- **Issue:** #22238 — SSO with Keycloak fails after authentication
- **PR:** #27716
- **Lines changed:** +5/-7 (1 file)
- **Task:** Fix the OIDC route to accept the `iss` parameter that Keycloak includes in auth responses (per RFC 9207), instead of only extracting `code` and `state`.
- **Why good benchmark:** Small, precise fix but requires understanding the OIDC authentication flow and what parameters are expected. Context about auth patterns is essential.

### CAL-10: JSON string name prefill handling
- **Issue:** #28034 — Handle JSON string name field from URL prefill
- **PR:** #28039
- **Lines changed:** +134/-2 (2 files)
- **Task:** Make the booking form correctly parse a JSON string `name` parameter from URL prefill when using the `firstAndLastName` variant (e.g., `name={"firstName":"John","lastName":"Doe"}`).
- **Why good benchmark:** Requires understanding the booking form's field variant system, the URL prefill pipeline, and preprocessing conventions. Has an existing skipped test that defines expected behavior.

---

## Repo 2: pydantic/pydantic (Python, well-structured validation library)

### PYD-1: ImportString error message improvement
- **Issue:** #12715 — Improve ImportString error when internal imports fail
- **PR:** #12740
- **Lines changed:** +38/-14 (3 files)
- **Task:** When `ImportString` validation catches an `ImportError` from an internal dependency (not the user's import path), the error message incorrectly blames the user's input. Fix the error handling logic to distinguish the source.
- **Why good benchmark:** Requires understanding pydantic's validator architecture and error propagation patterns. Tests knowledge of the type system internals.

### PYD-2: exclude_if fields in JSON Schema
- **Issue:** #12424 — Fields with exclude_if should not be required in serialization JSON schema
- **PR:** #12430
- **Lines changed:** +78/-19 (2 files)
- **Task:** Make fields with `exclude_if` not appear as required in the serialization-mode JSON schema.
- **Why good benchmark:** Requires understanding the JSON schema generation pipeline, serialization modes, and how field metadata flows through the system.

### PYD-3: model_rebuild not detecting needed rebuilds
- **Issue:** #12061 — model_rebuild incorrectly determines rebuild not required
- **PR:** #11759
- **Lines changed:** +62/-29 (3 files)
- **Task:** Fix `model_rebuild` so it correctly detects when a forward reference still needs resolution (parent class with forward ref to child class).
- **Why good benchmark:** Deep pydantic internals — requires understanding the model completion lifecycle, forward reference resolution, and the rebuild detection logic.

### PYD-4: Recursive generic models crash
- **Issue:** #11748 — RootModel with Generics with self-referencing fails to compile
- **PR:** #11775
- **Lines changed:** +35/-0 (2 files)
- **Task:** Fix `AttributeError` when using self-referencing generic `RootModel` (regression from v2.10 to v2.11).
- **Why good benchmark:** Tests understanding of pydantic's generic type resolution and RootModel internals. Requires finding the right spot in the compilation pipeline.

### PYD-5: Dataclass pickle with slots + validate_assignment
- **Issue:** #11768 — Missing attribute on dataclass copy with slots=True and validate_assignment=True
- **PR:** #11769
- **Lines changed:** +49/-12 (3 files)
- **Task:** Fix `copy()` failing on pydantic dataclasses that use both `slots=True` and `validate_assignment=True`.
- **Why good benchmark:** Requires understanding the interaction between Python's `__slots__`, pydantic's validation assignment hook, and the copy protocol. Multiple interacting systems.

### PYD-6: URL serialization loses type
- **Issue:** #11248 — AnyUrl cast to str when model_dump
- **PR:** #11330
- **Lines changed:** +26/-6 (2 files)
- **Task:** Fix `AnyUrl` fields being returned as plain `str` instead of `AnyUrl` objects when calling `model_dump()`.
- **Why good benchmark:** Requires understanding pydantic's serialization pipeline and how URL types are handled differently from other types.

### PYD-7: PydanticUserError on empty model_config
- **Issue:** #10411 — Error raised when model_config has type annotation and is empty
- **PR:** #10412
- **Lines changed:** +8/-1 (2 files)
- **Task:** Fix edge case where annotating `model_config: ConfigDict` without assigning a value raises a `PydanticUserError`.
- **Why good benchmark:** Small fix but requires understanding how pydantic processes model class attributes during metaclass creation.

### PYD-8: Computed field enum serialization
- **Issue:** #9394 — Serializing computed fields returning enums fails
- **PR:** #10200
- **Lines changed:** +22/-0 (2 files)
- **Task:** Fix `KeyError` when serializing a computed field that returns an enum value with a custom serializer.
- **Why good benchmark:** Requires understanding computed fields, enum handling, and the serializer dispatch mechanism.

### PYD-9: Mypy plugin false positives for from_orm
- **Issue:** #9936 — from_attributes config check gives false positives for v1 BaseModel
- **PR:** #9938
- **Lines changed:** +45/-0 (3 files)
- **Task:** Fix the pydantic mypy plugin so it doesn't emit false positives when checking `from_orm()` on v1-style models with `@deprecated`.
- **Why good benchmark:** Requires understanding pydantic's mypy plugin architecture, v1/v2 compatibility layer, and how method hooks work.

### PYD-10: Sequence ignoring discriminator
- **Issue:** #9872 — Union discrimination ignored in Sequence validation
- **PR:** #9980
- **Lines changed:** +88/-2 (2 files)
- **Task:** Fix discriminated union validation being ignored when the union is inside a `Sequence` type annotation.
- **Why good benchmark:** Requires understanding pydantic's discriminator system, sequence schema generation, and how schemas compose.

---

## Repo 3: honojs/hono (TypeScript, web framework)

### HONO-1: parseBody breaks subsequent body reads
- **Issue:** #4806 — parseBody() breaks subsequent text()/json() calls with TypeError
- **PR:** #4807
- **Lines changed:** +44/-2 (2 files)
- **Task:** Remove `parseBody` from the body cache to prevent `TypeError` when calling `text()` or `json()` after `parseBody()` on the same request.
- **Why good benchmark:** Requires understanding Hono's request body caching system and how `parseBody` interacts with the underlying `formData` cache.

### HONO-2: Fragment identifiers break route parsing in Service Workers
- **Issue:** #4440 — Fragment identifiers cause incorrect route parameter parsing
- **PR:** #4627
- **Lines changed:** +59/-4 (2 files)
- **Task:** Modify `getPath()` to strip fragment identifiers (`#`) from URLs, fixing incorrect route parameter parsing in Service Worker contexts.
- **Why good benchmark:** Requires understanding the URL parsing pipeline, how `getPath()` is used across routers, and Service Worker-specific URL behavior.

### HONO-3: Nested Suspense cancellation crash
- **Issue:** #4769 — ERR_INVALID_STATE when canceling during nested Suspense
- **PR:** #4770
- **Lines changed:** +117/-3 (2 files)
- **Task:** Fix "Invalid state: Controller is already closed" error when a request is canceled during nested Suspense rendering in the JSX streaming pipeline.
- **Why good benchmark:** Requires deep understanding of Hono's JSX streaming architecture, the Suspense implementation, and ReadableStream lifecycle management.

### HONO-4: RPC client serializes undefined as string in FormData
- **Issue:** #4731 — Inconsistent undefined handling between query params and form data
- **PR:** #4732
- **Lines changed:** +39/-0 (2 files)
- **Task:** Make the RPC client skip `undefined` values in form data serialization (like it already does for query parameters) instead of serializing them as the literal string `"undefined"`.
- **Why good benchmark:** Requires understanding the RPC client's serialization logic and the existing pattern for query parameter handling that should be mirrored.

### HONO-5: Empty array crashes JSX/DOM render
- **Issue:** #4727 — render() throws TypeError given JSX with empty arrays
- **PR:** #4729
- **Lines changed:** +20/-0 (2 files)
- **Task:** Fix `TypeError: Cannot read properties of undefined` when rendering JSX that includes an empty array (e.g., `{[].map(...)}`) followed by a non-empty array.
- **Why good benchmark:** Requires understanding Hono's JSX/DOM `build()` function, how children arrays are processed, and the virtual DOM diffing logic.

### HONO-6: useRequestContext lost with await + html helper
- **Issue:** #4582 — useRequestContext not working when using await and html helper together
- **PR:** #4662
- **Lines changed:** +44/-2 (2 files)
- **Task:** Fix context being popped synchronously in `finally` block while async components are still rendering, causing `useContext` to return undefined in child components.
- **Why good benchmark:** Requires understanding Hono's async component lifecycle, the context stack, and how the `html` template helper interacts with the rendering pipeline.

### HONO-7: Linear router incorrect path matching
- **Issue:** (described in PR) — `/book-now` incorrectly matches `/book/:slug`
- **PR:** #4567
- **Lines changed:** +9/-1 (2 files)
- **Task:** Fix the LinearRouter so that `/book-now` doesn't incorrectly match a `/book/:slug` route pattern.
- **Why good benchmark:** Small fix but requires understanding Hono's router matching algorithm and the difference between LinearRouter, RegExpRouter, and TrieRouter.

### HONO-8: Locale code truncation for language detection
- **Issue:** #4294 — LanguageDetector middleware doesn't parse locale codes
- **PR:** #4717
- **Lines changed:** +93/-2 (2 files)
- **Task:** Add RFC 4647 Lookup-based progressive truncation to `normalizeLanguage` so locale codes like `ja-JP` match `ja` when only the base language is in `supportedLanguages`.
- **Why good benchmark:** Requires understanding the language middleware architecture and RFC 4647 algorithm. Tests ability to extend existing middleware with standards-compliant behavior.

### HONO-9: Bearer auth case-insensitive scheme
- **Issue:** (described in PR) — Auth-scheme matching is case-sensitive but RFC says it shouldn't be
- **PR:** #4659
- **Lines changed:** +22/-1 (2 files)
- **Task:** Make the bearer auth middleware's scheme comparison case-insensitive per the HTTP spec.
- **Why good benchmark:** Small but requires reading the middleware source, understanding the regex-based parsing, and knowing to follow RFC conventions.

### HONO-10: JWT memory leak from options mutation
- **Issue:** (described in PR) — JWT middleware mutates options object causing memory leak
- **PR:** #4759
- **Lines changed:** +64/-7 (2 files)
- **Task:** Fix the JWT middleware leaking memory by mutating and accumulating keys in the shared options object across requests.
- **Why good benchmark:** Requires understanding middleware lifecycle in Hono — that options objects are shared across requests and must not be mutated. Tests understanding of the middleware closure pattern.

---

## Summary Statistics

| Repo | Issues | Avg files changed | Avg lines changed | Has linked issue |
|------|--------|-------------------|-------------------|------------------|
| cal.com | 10 | 3.0 | 55 | 9/10 |
| pydantic | 10 | 2.4 | 47 | 10/10 |
| hono | 10 | 2.1 | 51 | 6/10 |
| **Total** | **30** | **2.5** | **51** | **25/30** |

## Selection Criteria Met

All 30 issues:
- Are closed with a merged PR (ground truth exists)
- Involve code changes (not config/infra)
- Range from 5-134 lines changed (not trivial, not massive)
- Touch 1-10 files
- Require understanding codebase conventions, file relationships, or project structure
- Are NOT pure algorithmic tasks or config-only changes
