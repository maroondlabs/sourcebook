# sourcebook Launch Video — Final Shot List

## Scene 5 Shots (the money section — 0:16-0:22)

Each shot is 1 second. Zoom into real sourcebook output.

### Shot 1: i18n Pattern
- **Source:** calcom-CLAUDE.md, Conventions section
- **Line:** `User-facing strings use t("key") for internationalization`
- **Overlay:** `use t("key")`
- **Framing:** Zoom to fill screen, green highlight on `t("key")`
- **Screenshot:** findings-display.html#finding-i18n

### Shot 2: File Placement
- **Source:** calcom-CLAUDE.md, Conventions section
- **Line:** `Add new translation keys in packages/i18n/locales/en/common.json`
- **Overlay:** `keys go here`
- **Framing:** Slight pan down from Shot 1, highlight the file path in green

### Shot 3: Hub File
- **Source:** calcom-CLAUDE.md, Constraints section
- **Line:** `packages/trpc/server/types.ts (imported by 183 files)`
- **Overlay:** `hub file (183 imports)`
- **Framing:** Center the file path, make "183" large/green
- **Screenshot:** findings-display.html#finding-hub

### Shot 4: Generated File Trap
- **Source:** calcom-CLAUDE.md, Constraints section
- **Line:** `Generated files detected... Do NOT edit these directly`
- **Overlay:** `don't edit generated files`
- **Framing:** Red accent border, zoom on "Do NOT edit"
- **Screenshot:** findings-display.html#finding-generated

### Shot 5: Circular Dependency
- **Source:** calcom-CLAUDE.md, Constraints section
- **Line:** `bookingScenario.ts → getMockRequestDataForBooking.ts → bookingScenario.ts`
- **Overlay:** `avoid this cycle`
- **Framing:** Red accent, show the circular arrow pattern
- **Screenshot:** findings-display.html#finding-circular

### Shot 6 (bonus): Co-change Coupling
- **Source:** findings-display.html#finding-cochange
- **Line:** `auth/provider.ts ↔ middleware/session.ts (88% correlation)`
- **Overlay:** `hidden dependency`
- **Framing:** Green border, emphasize "No import relationship. Invisible coupling."

---

## Scene 4 Shots (terminal — 0:12-0:16)

### Shot 1: Command
- **Visual:** Clean terminal, dark background
- **Line:** `$ npx sourcebook init --format all`
- **Screenshot:** findings-display.html#terminal

### Shot 2: Output flash
- **Visual:** Quick flash of scan results
- **Lines:** `10,453 files, 3 frameworks detected` → `Extracted 22 findings`

### Shot 3: Generated files
- **Visual:** DONE badge + file list
- **Line:** `Wrote CLAUDE.md, .cursorrules, AGENTS.md, copilot-instructions.md`
- **Overlay:** `3.1 seconds`

---

## Scene 7 Shots (benchmark — 0:26-0:31)

### Chart Shot
- **Source:** screenshots/chart-progression.png
- **Visual:** v0.3 → v0.4.1 → v0.5 bars approaching handwritten
- **Overlay:** `closing the gap with handwritten briefs`
- **Framing:** Full chart, zoom slightly into the v0.5 bar

---

## Scene 6 Shots (market contrast — 0:22-0:26)

### Split Screen
- **LEFT:** Dense repo tree / code wall (Seedance generated OR fake code dump)
- **RIGHT:** Real CLAUDE.md snippet — the clean, structured constraints section
- **Overlay:** `Some tools give AI your codebase. Sourcebook gives it your project knowledge.`

---

## Bonus Moment (insert anywhere in Scene 5)

- **Line from output:** `"the best context comes from human + machine together"`
- **Overlay:** `human + machine together`
- **Tone:** Philosophical, quiet moment. Let it breathe.

---

## Files on Disk

```
demo-assets/
├── SHOT_LIST.md                 ← you are here
├── VIDEO_ASSETS.md              ← storyboard + on-screen text
├── findings-display.html        ← styled findings (open at localhost to screenshot)
├── calcom-CLAUDE.md             ← real CLAUDE.md output
├── calcom-AGENTS.md             ← real AGENTS.md output
├── calcom-cursorrules.md        ← real .cursorrules output
├── calcom-copilot-instructions.md
├── calcom-cursor-mdc.md
└── screenshots/
    ├── chart-scatter.png        ← time vs patch (all conditions)
    ├── chart-progression.png    ← v0.3→v0.5 vs handwritten
    └── chart-per-task.png       ← 4 panels, one per task
```

## Capture Style Rules
- Zoomed in (mobile readable)
- No tiny text
- Smooth scroll (not jerky)
- Dark mode
- High contrast
- Cursor visible but not distracting

## Motion Guidelines
- Slow zoom in on findings
- Slight pan across lines
- Fade in highlights / box outlines
- No hard cuts only
- No static screenshots
- No flashy effects
