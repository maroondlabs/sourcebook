# CLAUDE.md — Chi

Lightweight HTTP router for Go. Composable, idiomatic, stdlib-compatible.

## Key Files

- `mux.go` — main router (Mux struct)
- `tree.go` — radix tree implementation
- `context.go` — route context (URL params)
- `middleware/` — standard middleware collection

## Commands

- `go test ./...` — run tests
- `go vet ./...` — lint

## Conventions

- Standard Go patterns, stdlib net/http compatible
- Middleware uses the `func(http.Handler) http.Handler` pattern
- Routes are registered on Mux, which implements http.Handler
- URL parameters extracted via chi.URLParam(r, "key")

## Important

- Chi is stdlib-compatible — it works with any net/http middleware
- Subrouters (Mount/Route/Group) create nested Mux trees
- The radix tree handles route matching and parameter extraction
- Keep it lightweight — minimal allocations, no reflection
