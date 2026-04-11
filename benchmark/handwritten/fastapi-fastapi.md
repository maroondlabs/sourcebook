# CLAUDE.md — FastAPI

Python web framework for building APIs. Built on Starlette and Pydantic.

## Key Directories

- `fastapi/` — main package
- `fastapi/routing.py` — route handling, core of the framework
- `fastapi/dependencies/` — dependency injection system
- `fastapi/security/` — auth helpers (OAuth2, API keys)
- `tests/` — pytest test suite
- `docs_src/` — code examples used in documentation

## Commands

- `pip install -e ".[all,dev]"` — install dev dependencies
- `pytest` — run tests
- `bash scripts/lint.sh` — run linting

## Conventions

- Type annotations everywhere — Pydantic models for request/response
- Dependency injection via `Depends()` is the core pattern
- Tests use pytest with httpx.AsyncClient
- docs_src/ examples must match documentation — they're tested

## Important

- FastAPI inherits from Starlette — many features are Starlette features
- Pydantic v2 is the current validation layer (pydantic-core in Rust)
- The dependency injection system is the most complex part
- `fastapi/routing.py` and `fastapi/applications.py` are the hub files
- Don't break backward compatibility — deprecate first
