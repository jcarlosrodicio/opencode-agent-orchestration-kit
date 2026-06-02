# Init Detection Rules

Reference for `/init` execution. `lead` uses these rules to detect stack,
tests, and conventions.

## Stack Detection

| Signal File | Detected Stack |
| --- | --- |
| `package.json` | Node.js |
| `pnpm-lock.yaml` / `pnpm-workspace.yaml` | pnpm |
| `yarn.lock` | Yarn |
| `package-lock.json` | npm |
| `turbo.json` | Turborepo |
| `nx.json` | Nx |
| `tsconfig.json` | TypeScript |
| `next.config.*` | Next.js |
| `vite.config.*` | Vite |
| `astro.config.*` | Astro |
| `nuxt.config.*` | Nuxt |
| `svelte.config.*` | Svelte/SvelteKit |
| `angular.json` | Angular |
| `go.mod` | Go |
| `Cargo.toml` | Rust |
| `pyproject.toml` | Python |
| `poetry.lock` | Poetry |
| `uv.lock` | uv |
| `requirements.txt` | Python dependencies |
| `manage.py` | Django signal |
| `Gemfile` | Ruby |
| `composer.json` | PHP |
| `pom.xml` / `build.gradle*` | Java/Kotlin |
| `Dockerfile` | Containerization |

## Test Capability Detection

### Node.js

Priority:

1. `vitest.config.*` or `vitest` in dependencies -> Vitest
2. `jest.config.*` or `jest` in dependencies -> Jest
3. `playwright.config.*` or `@playwright/test` -> Playwright
4. `cypress.config.*` or `cypress` in dependencies -> Cypress

Command inference:

1. `package.json` scripts: `test`, `test:unit`, `test:ci`
2. Package-manager-prefixed: `pnpm test`, `npm test`, `yarn test`

### Python

1. `pytest.ini`, `conftest.py`, `[tool.pytest]` -> pytest
2. `tox.ini` -> tox
3. `noxfile.py` -> nox

Command: `pytest` or `python -m pytest`

### Go

- `go.mod` present -> `go test ./...`

### Rust

- `Cargo.toml` -> `cargo test`

### Java/Kotlin

- `pom.xml` -> `mvn test`
- `build.gradle*` -> `gradle test` or `./gradlew test`

## Convention Detection

| Signal | Detected |
| --- | --- |
| `eslint.config.*`, `.eslintrc*` | ESLint |
| `.prettierrc*` | Prettier |
| `biome.json` | Biome |
| `ruff.toml`, `[tool.ruff]` | Ruff |
| `mypy.ini`, `[tool.mypy]` | mypy |
| `pyrightconfig.json` | pyright |
| `.golangci.*` | golangci-lint |
| `rustfmt.toml` | rustfmt |

## Confidence Model

- `high`: explicit config file found with clear signals
- `medium`: inferred from related files but no direct config
- `low`: weak signal, multiple possibilities
- `unknown`: no signal found; record as `unknown`, do not guess

## Precedence

When multiple signals conflict:

1. Explicit tool config wins over implicit dependencies
2. Lock file wins over bare config
3. Package manager scripts win over direct runner invocation
