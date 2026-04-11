# CLAUDE.md — Bubble Tea

TUI framework for Go based on The Elm Architecture.

## Key Files

- `tea.go` — Program, main event loop
- `renderer.go` — terminal rendering engine
- `commands.go` — built-in commands (Quit, Batch, etc.)
- `key.go` — keyboard input handling
- `mouse.go` — mouse event handling

## Commands

- `go test ./...` — run tests

## Conventions

- Elm Architecture: Model, Update, View
- Models implement the Model interface (Init, Update, View)
- Commands are Cmd functions that return messages
- Messages drive state transitions

## Important

- The renderer manages terminal state (alternate screen, cursor, etc.)
- Rendering uses ANSI escape sequences — terminal compatibility matters
- The event loop in tea.go is the core — Init → Update → View cycle
- Don't break the Model interface — it's the public API
