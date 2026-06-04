# Skill Metadata Schema v2

> Generated as part of the Skill Resolution Upgrade — Phase A.
> This document defines the frontmatter contract for `SKILL.md` files.

## Purpose

Structured metadata enables deterministic prefiltering of skills before the `lead` agent makes its final selection. The schema is intentionally short: most fields are enums with small taxonomies, and every field has a safe fallback when absent.

## Frontmatter fields

### Required fields

| Field | Type | Description |
| --- | --- | --- |
| `name` | `string` | Unique identifier. Must match the directory name. |
| `description` | `string` | Human-readable trigger condition. Used as fallback when structured metadata is missing. |

### New fields — required for new skills

| Field | Type | Default when missing | Description |
| --- | --- | --- | --- |
| `phase` | `enum(phase)` | `"unknown"` | Primary lifecycle phase where this skill applies. |
| `domains` | `string[]` | `[]` | Taxonomy of problem domains the skill covers. |
| `stacks` | `string[]` | `["any"]` | Technology stacks the skill is relevant to. `["any"]` means stack-agnostic. |
| `allowed_agents` | `string[]` | all 7 agents | Agent IDs permitted to load this skill. |

### Optional fields

| Field | Type | Default when missing | Description |
| --- | --- | --- | --- |
| `surfaces` | `string[]` | `[]` | Work surfaces the skill targets (e.g., `repo-analysis`, `handoff-design`). |
| `skill_source` | `enum(source)` | `"built-in"` | Where the skill was installed from. |
| `origin` | `string \| null` | `null` | External source reference (e.g., `addyosmani/agent-skills`). |
| `status` | `enum(status)` | `"active"` | Lifecycle status of the skill itself. |

## Enums

### `phase`

Primary lifecycle phase. A skill has one primary phase; additional facets are expressed in `domains`.

| Value | Meaning |
| --- | --- |
| `meta` | Discovery, skill selection, orchestration helpers |
| `define` | API design, interface contracts, schema definition |
| `plan` | Scoping, specification, task breakdown |
| `build` | Implementation, coding, construction |
| `verify` | Testing, validation, quality gates |
| `review` | Code review, security review, architectural review |
| `ship` | Release, deployment, sync, publishing |
| `operate` | Runtime, monitoring, harness evolution, loops |

### `domains`

Problem domain taxonomy. Extensible; start with these 19.

| Value | Typical skills |
| --- | --- |
| `orchestration` | context-engineering, using-agent-skills |
| `context-management` | context-engineering, iterative-retrieval |
| `research` | source-driven-development |
| `specification` | specifier-related skills |
| `testing` | test-driven-development |
| `debugging` | debugging-and-error-recovery |
| `security` | security-and-hardening |
| `performance` | performance-optimization |
| `api-design` | api-and-interface-design |
| `ui-ux` | open-design, impeccable |
| `documentation` | documentation-and-adrs |
| `release` | opencode-public-sync |
| `evaluation` | verification-loop |
| `evolution` | evolver, harness changes |
| `data` | database, serialization |
| `backend` | server-side logic |
| `frontend` | client-side logic |
| `mobile` | Flutter, React Native |
| `review` | code-review-and-quality, doubt-driven-development |

### `stacks`

Technology stack taxonomy. `any` means stack-agnostic.

| Value | Meaning |
| --- | --- |
| `any` | Applies regardless of stack |
| `typescript` | TypeScript-specific patterns |
| `javascript` | JavaScript (vanilla or runtime-specific) |
| `node` | Node.js runtime |
| `react` | React ecosystem |
| `nextjs` | Next.js framework |
| `python` | Python ecosystem |
| `go` | Go ecosystem |
| `rust` | Rust ecosystem |
| `flutter` | Flutter/Dart |
| `react-native` | React Native / Expo |
| `supabase` | Supabase platform |
| `vercel` | Vercel platform |
| `postgres` | PostgreSQL database |
| `open-design` | Open Design workbench |
| `harness` | OpenCode harness itself |

### `allowed_agents`

Agent IDs from the harness agent matrix.

| Value | Role |
| --- | --- |
| `developer` | Implementation and validation |
| `researcher` | Discovery, risk analysis, API research |
| `designer` | UX/UI, visual design, Open Design |
| `specifier` | Specs, tasks, acceptance criteria |
| `reviewer` | Diff review, security, regression |
| `scoper` | Research-to-spec without implementation |
| `lead` | Orchestration, routing, coordination |

### `status`

| Value | Meaning |
| --- | --- |
| `active` | Stable, recommended for use |
| `experimental` | In development, may change |
| `deprecated` | Scheduled for removal, do not suggest |

### `skill_source`

| Value | Meaning |
| --- | --- |
| `built-in` | Ships with the OpenCode harness |
| `user-installed` | Installed to `~/.agents/skills/` |
| `external` | Referenced from an external source |

## Backward compatibility rules

1. **Missing `phase`**: Resolver uses `"unknown"` and does not exclude the skill on phase mismatch.
2. **Missing `domains`**: Resolver falls back to keyword matching against `description`.
3. **Missing `stacks`**: Resolver assumes `["any"]` — the skill is stack-agnostic.
4. **Missing `allowed_agents`**: All 7 agents are permitted (current behavior).
5. **Missing `status`**: Assumed `"active"`.
6. **Missing `surfaces`**: Empty array; no surface-based filtering.
7. **Old skills with only `name` + `description`**: Continue to work exactly as before. The registry generator produces valid output with fallback values.

## Example: complete skill frontmatter

```yaml
---
name: test-driven-development
description: Drives development with tests. Use when implementing any logic, fixing any bug, or changing any behavior.
phase: verify
domains:
  - testing
  - debugging
stacks:
  - any
allowed_agents:
  - developer
  - reviewer
  - specifier
  - lead
surfaces:
  - code-implementation
  - bug-fix
skill_source: built-in
origin: null
status: active
---
```

## Example: legacy skill (no new metadata)

```yaml
---
name: my-legacy-skill
description: Does something useful.
---
```

The registry generator will output:

```json
{
  "name": "my-legacy-skill",
  "source": "built-in",
  "phase": "unknown",
  "domains": [],
  "stacks": ["any"],
  "allowed_agents": ["developer","researcher","designer","specifier","reviewer","scoper","lead"],
  "surfaces": [],
  "status": "active",
  "description": "Does something useful.",
  "load_path": "skills/my-legacy-skill/SKILL.md",
  "origin": null
}
```

## Schema version

This document describes `schema_version: 2` of the skill metadata system. The version is recorded in `skill_registry.json` and may be incremented when the schema changes incompatibly.
