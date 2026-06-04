---
title: "Skill Resolution"
status: active
---

# Skill Resolution

Two-stage deterministic skill resolution: prefilter + ranking + shortlist output with explanations.

## Overview

The skill resolver reduces the full skill catalog to a ranked shortlist of 3-8 candidates for a given agent, phase, and task context. The `lead` agent then selects 0-3 final skills from this shortlist.

The resolver does **not** load SKILL.md files or execute skills — it only produces the shortlist.

## Resolution flow

```
target_agent + task_phase + task_domains
        │
        ▼
┌─────────────────────┐
│  Stage A: Prefilter  │
│  (deterministic)     │
│                      │
│  1. filterByAgent    │
│  2. filterByPhase    │
│  3. filterByDomains  │
│  4. filterByStacks   │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Stage B: Ranking    │
│  (explainable)       │
│                      │
│  Score + reasons     │
│  Sort by score desc  │
│  Limit to 8 max     │
└─────────┬───────────┘
          │
          ▼
   skill_shortlist
   (candidates + reasons
    + omitted_summary
    + recommendation)
```

## Prefilter rules (Stage A)

Filtering is applied in order. Each stage removes skills that don't match:

1. **Agent filter**: `skill.allowed_agents` must contain `target_agent`.
   - If `allowed_agents` is missing → include (fallback to all agents).
   - If `allowed_agents` is empty array → exclude (no agents allowed).

2. **Phase filter**: `skill.phase` must equal `task_phase`, OR be `meta`/`operate` (pass-through).
   - If `task_phase` is `"unknown"` → skip phase filtering entirely.
   - If `skill.phase` is missing/`"unknown"` → don't exclude.

3. **Domain filter**: At least one of:
   - `skill.domains` ∩ `task_domains`
   - `skill.domains` ∩ `domains_detected` (from snapshot)
   - Keyword match in `skill.description` vs combined domains
   - If no domains info available → don't filter.

4. **Stack filter**: `skill.stacks` contains `"any"` OR intersects with `stacks_detected`.
   - If no snapshot stacks → don't filter.

## Ranking rules (Stage B)

Each candidate receives an explainable score:

| Factor | Points |
|--------|--------|
| Phase match exact | +3 |
| Domain match (per domain, max +6) | +2 each |
| Stack match | +1 |
| Status: active | +1 |
| Status: experimental | -1 |

Candidates are sorted by score descending, then alphabetically. Maximum 8 candidates.

Confidence is derived from score:
- **high**: score ≥ 6
- **medium**: score ≥ 3
- **low**: score < 3

## Shortlist output format

```
=== Skill Shortlist ===
Target Agent: developer
Task Phase: build
Snapshot: /path/to/project_capability_snapshot.json

--- Candidates (5) ---

1. security-and-hardening (confidence: high)
   Load: skills/security-and-hardening/SKILL.md
   Reasons:
     - "matches target_agent=developer"
     - "matches phase=build"
     - "matches domains=security"
     - "stack compatible: any"
     - "status: active"

--- Omitted Summary ---
  filtered_by_agent: 8
  filtered_by_phase: 12
  filtered_by_domain: 6
  filtered_by_stack: 2

--- Recommendation ---
  suggested_final_selection: 3
  guidance: "Select top 3 from 5 candidates. Prioritize high-confidence matches."
```

## CLI usage

```bash
# Basic usage
node scripts/skill-resolver.mjs --agent developer --phase build

# With domain hints
node scripts/skill-resolver.mjs --agent developer --phase build --domains testing,security

# With custom registry and snapshot
node scripts/skill-resolver.mjs --agent reviewer --phase review \
  --registry /path/to/registry.json \
  --snapshot /path/to/snapshot.json

# Help
node scripts/skill-resolver.mjs --help
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--agent <name>` | Target agent (required) | — |
| `--phase <phase>` | Task phase | `unknown` |
| `--domains <list>` | Comma-separated domain hints | — |
| `--registry <path>` | Path to `skill_registry.json` | `docs/ai/harness/skill_registry.json` |
| `--snapshot <path>` | Path to capability snapshot | auto-detected |

## Module usage

The resolver can be imported as an ES module:

```js
import {
  loadRegistry,
  loadSnapshot,
  filterByAgent,
  filterByPhase,
  filterByDomains,
  filterByStacks,
  rankCandidates,
  generateShortlist,
  formatShortlist,
} from "./scripts/skill-resolver.mjs";

const registry = loadRegistry("docs/ai/harness/skill_registry.json");
const snapshot = loadSnapshot("docs/ai/harness/project_capability_snapshot.json");

const shortlist = generateShortlist({
  targetAgent: "developer",
  taskPhase: "build",
  taskDomains: ["testing"],
  registry,
  snapshot,
});

console.log(formatShortlist(shortlist));
```

## Integration with lead agent

The `lead` agent uses the resolver before delegating non-trivial work:

1. Generate or consult a project capability snapshot.
2. Run the resolver with the target agent and inferred task phase.
3. Review the shortlist and select 0-3 final skills.
4. Include the selected skills in the handoff block.

The resolver output is advisory — the `lead` makes the final decision.

## Fallback behavior

- **No `skill_registry.json`**: Fall back to `skill_registry.md` or `<available_skills>` global list.
- **No snapshot**: Resolver works with empty domains/stacks; domain and stack filters are skipped.
- **No metadata on skills**: Missing `phase`/`domains`/`stacks` degrades gracefully — skills are not excluded for missing metadata.
- **0 matches**: Empty candidates list + guidance to review task description or use manual selection.

## Business rules

- Never return more than 8 candidates.
- `deprecated` skills are always excluded.
- `meta` skills pass through phase filtering (included when relevant).
- `operate` skills pass through phase filtering but are filtered by stack if stack doesn't match.
- `operate` skills are not suggested for normal app tasks unless the harness stack is detected.
