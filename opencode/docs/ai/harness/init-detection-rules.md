# Init Detection Rules

Reference for `/init` execution. `lead` uses these rules to detect stack, tests, and conventions.

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
| `requirements.txt` | Python deps |
| `manage.py` | Django signal |
| `Gemfile` | Ruby |
| `composer.json` | PHP |
| `pom.xml` / `build.gradle*` | Java/Kotlin |
| `Dockerfile` | Containerization |

## Test Capability Detection

### Node.js
Priority:
1. `vitest.config.*` or `vitest` in deps → Vitest
2. `jest.config.*` or `jest` in deps → Jest
3. `playwright.config.*` or `@playwright/test` → Playwright
4. `cypress.config.*` or `cypress` in deps → Cypress

Command inference:
1. `package.json` scripts: `test`, `test:unit`, `test:ci`
2. Package-manager-prefixed: `pnpm test`, `npm test`, `yarn test`

### Python
1. `pytest.ini`, `conftest.py`, `[tool.pytest]` → pytest
2. `tox.ini` → tox
3. `noxfile.py` → nox

Command: `pytest` or `python -m pytest`

### Go
- `go.mod` present → `go test ./...`

### Rust
- `Cargo.toml` → `cargo test`

### Java/Kotlin
- `pom.xml` → `mvn test`
- `build.gradle*` → `gradle test` or `./gradlew test`

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
- `unknown`: no signal found — record as `unknown`, do not guess

## Precedence

When multiple signals conflict:
1. Explicit tool config wins over implicit deps
2. Lock file wins over bare config
3. Package manager scripts win over direct runner invocation

## Project Capability Snapshot

The script `scripts/project-capability-snapshot.mjs` generates a snapshot of the project that the `lead` agent uses before resolving skills.

### Usage

```bash
node scripts/project-capability-snapshot.mjs --dir /path/to/repo
```

Options:
- `--dir <path>` — Repository root to analyze (default: cwd)
- `--output <path>` — Write JSON to file instead of stdout

### Output

JSON with `stacks_detected`, `domains_detected`, `surfaces_detected`, each with `id`, `confidence`, and `evidence`.

```json
{
  "schema_version": 1,
  "repo_root": "/abs/path",
  "stacks_detected": [{ "id": "node", "confidence": "high", "evidence": ["package.json"] }],
  "domains_detected": [{ "id": "orchestration", "confidence": "high", "evidence": ["agents/*.md"] }],
  "surfaces_detected": [{ "id": "harness", "confidence": "high", "evidence": ["AGENTS.md"] }],
  "unknowns": [],
  "generated_by": "lead prefilter",
  "generated_at": "ISO-8601"
}
```

### Module API

The script is also importable as an ES module:

```js
import { generateSnapshot, detectStacks, detectDomains, detectSurfaces } from "./scripts/project-capability-snapshot.mjs";
const snapshot = generateSnapshot("/path/to/repo");
```

### Integration with Skill Resolution

The snapshot is used as input for the prefilter in the Skill Resolution Upgrade (Phase C) to filter skills by compatible stack and domain. The `lead` consults the snapshot before delegating work to select 0-3 relevant skills per handoff.

### Detection rules

**Stacks** — signal files from this document (package.json → node, tsconfig.json → typescript, etc.)

**Domains** — directory/file patterns:
- `agents/*.md`, `docs/ai/harness/**`, `skills/**/SKILL.md` → orchestration (high)
- `docs/decisions/**`, `docs/adr/**` → documentation (high)
- `**/*.test.*`, `**/*.spec.*` → testing (high)
- `docs/ai/specs/**` → specification (high)
- `docs/ai/evolution/**` → evolution (high)
- `**/*security*`, `**/*auth*` → security (medium)
- `**/routes/**`, `**/api/**` → api-design (medium)
- `**/components/**`, `**/pages/**` → ui-ux (medium)

**Surfaces** — purpose detection:
- `AGENTS.md` + `docs/ai/harness/**` → harness (high)
- `skills/**/SKILL.md` → skills-catalog (high)
- `scripts/**` → automation (medium)
- `apps/` or `packages/` → monorepo (medium)

### Confidence model

- `high`: explicit signal file or multiple convergent signals
- `medium`: single indirect signal
- `low`: weak inference (not included in output by default)
- `unknown`: no evidence; recorded in `unknowns` array
