# Launch Video Asset Guide

## Terminal Demo Output (Scene 4)

The full terminal output is clean and impressive. Key moments to capture:

```
sourcebook
Extracting repo truths...

✓ Scanned project structure
  10453 files, 3 frameworks detected
✓ Extracted 22 findings
```

Then the findings scroll, then:

```
✓ Wrote CLAUDE.md
✓ Wrote .cursor/rules/sourcebook.mdc
✓ Wrote .cursorrules (legacy)
✓ Wrote .github/copilot-instructions.md
✓ Wrote AGENTS.md
```

Command to run: `npx sourcebook init`

---

## Best Findings for Video Overlays (Scene 5)

These are the most visually compelling and understandable findings from the cal.com run:

### Finding 1: i18n pattern
```
User-facing strings use t("key") for internationalization.
Add new translation keys in packages/i18n/locales/en/common.json.
```
Evidence: 24 files use t("key")

### Finding 2: Hub file (blast radius)
```
Hub files (most depended on):
packages/trpc/server/types.ts (imported by 183 files)
```
Changes here have the widest blast radius.

### Finding 3: Generated-file trap
```
Generated files detected (14 files).
Do NOT edit these directly — modify the source/schema they are generated from.
```

### Finding 4: Fragile file
```
Files that required many rapid edits (hard to get right):
docs/api-reference/v2/openapi.json (5 edits in one week)
```

### Finding 5: Co-change / circular dependency
```
Circular import chains detected:
bookingScenario.ts → getMockRequestDataForBooking.ts → bookingScenario.ts
```

### Finding 6: Integration directory
```
Third-party integrations live under packages/app-store/
106 integrations found
```

---

## Benchmark Chart Data (Scene 7)

### Progression chart (use this for video)

| Version | Avg Time (cal.com) | Avg Patch Lines |
|---------|-------------------|-----------------|
| Handwritten | 118s | 342 |
| sourcebook v0.3 | 122s | 370 |
| sourcebook v0.4.1 | 128s | 431 |
| sourcebook v0.5 | 125s | 464 |

Visual: bars or line showing sourcebook approaching handwritten on time while exceeding it on patch breadth.

The chart is already built at: `benchmark/charts.html`

---

## On-Screen Text (exact copy)

### Scene 1 (0:00-0:04)
AI can read your code.
It still doesn't know how your project works.

### Scene 2 (0:04-0:08)
Every codebase has hidden rules.

Flash phrases:
- use this hook
- put keys here
- don't edit this file
- these files always change together

### Scene 3 (0:08-0:12)
A senior engineer knows them.
Your AI agent usually doesn't.

### Scene 4 (0:12-0:16)
Sourcebook gives AI that handoff.

### Scene 5 (0:16-0:22)
- useLocale() + t()
- translation keys go here
- hub file: 183 importers
- fragile file
- generated-file trap
- these files co-change

### Scene 6 (0:22-0:26)
Some tools give AI your codebase.
Sourcebook gives it your project knowledge.

### Scene 7 (0:26-0:31)
We benchmarked it.
Then used the results to make it better.

v0.5 is closing the gap with handwritten briefs.

### Scene 8 (0:31-0:36)
sourcebook
AI that understands how your project works
sourcebook.run

---

## Files in this directory

- `calcom-CLAUDE.md` — Generated CLAUDE.md from cal.com (for screenshot)
- `calcom-AGENTS.md` — Generated AGENTS.md (for screenshot)
- `calcom-cursorrules.md` — Generated .cursorrules (for screenshot)
- `calcom-copilot-instructions.md` — Generated copilot-instructions.md (for screenshot)
- `calcom-cursor-mdc.md` — Generated .cursor/rules/sourcebook.mdc (for screenshot)

## Charts

- `benchmark/charts.html` — Interactive charts (open in browser, screenshot for video)

## Site

- `sourcebook.run` — Screenshot the homepage hero for Scene 8

## GitHub

- `github.com/maroondlabs/sourcebook` — Screenshot if repo page looks clean
