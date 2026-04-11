# CLAUDE.md — Gin

High-performance HTTP web framework for Go, using httprouter.

## Key Files

- `gin.go` — Engine struct, core router
- `context.go` — Context (request/response wrapper)
- `routergroup.go` — route group handling
- `tree.go` — radix tree router implementation
- `binding/` — request body binding (JSON, XML, form)

## Commands

- `go test ./...` — run tests
- `go build ./...` — build
- `go vet ./...` — lint

## Conventions

- Standard Go project layout
- Tests use Go's testing package
- Middleware chain pattern via HandlerFunc
- Context carries request state through middleware
- Use Conventional Commits (feat/fix/docs)

## Important

- Performance is critical — Gin is benchmarked against other frameworks
- The radix tree in tree.go is the routing core — changes here affect everything
- Context methods (JSON, String, etc.) write the response
- Binding uses struct tags for validation
- Don't add dependencies — Gin has minimal external deps
