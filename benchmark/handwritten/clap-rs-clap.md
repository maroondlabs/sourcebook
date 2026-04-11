# CLAUDE.md — Clap

Command-line argument parser for Rust. Derive and builder APIs.

## Key Directories

- `clap_builder/src/` — core parser (builder API)
- `clap_derive/src/` — derive macro implementation
- `clap_complete/src/` — shell completion generation
- `clap_lex/src/` — low-level argument lexer
- `tests/` — integration tests

## Commands

- `cargo test` — run tests
- `cargo clippy` — lint
- `cargo build` — build

## Conventions

- Workspace with multiple crates (clap_builder, clap_derive, clap_complete, clap_lex)
- Builder pattern for constructing commands/args
- Derive macro generates builder calls from struct annotations
- Tests in both unit (mod tests) and integration (tests/) form

## Important

- clap_builder is the core — clap_derive generates calls into it
- The parser in `clap_builder/src/parser/` handles argument resolution
- Shell completion in clap_complete must handle all shells (bash, zsh, fish, etc.)
- Error messages are part of the API — changes to error output need care
- `ignore_errors` flag changes parser behavior significantly
