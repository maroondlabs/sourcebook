# CLAUDE.md — Pydantic

Pydantic is a Python data validation library using type annotations.

## Stack

- Python 3.8+, Rust (pydantic-core via PyO3)
- pydantic-core handles validation/serialization in Rust
- Tests use pytest

## Key Directories

- `pydantic/` — main Python package
- `pydantic/_internal/` — internal implementation (validators, schema generation)
- `pydantic/v1/` — legacy v1 compatibility layer
- `tests/` — pytest test suite
- `pydantic-core/` — Rust core (separate repo, vendored)

## Conventions

- Type annotations on all public functions
- Docstrings use Google style
- Use `__all__` exports in `__init__.py` files
- Schema generation goes through `_internal/_generate_schema.py`
- Validators use the `core_schema` system from pydantic-core

## Commands

- `make install` — install dev dependencies
- `make test` — run tests
- `make lint` — run linting
- `pytest tests/test_specific.py -k "test_name"` — run specific test

## Important

- The `_internal/` directory is private API — don't expose its types publicly
- pydantic-core is the Rust validation engine; Python code orchestrates schema building
- v1 compatibility exists but new features should only target v2
- `BaseModel`, `TypeAdapter`, and `validate_call` are the main entry points
