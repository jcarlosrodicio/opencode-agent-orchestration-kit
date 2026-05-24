# Checks and Doc Gardening

## Local Check

From the OpenCode config root, run:

```bash
node scripts/check-harness.mjs
```

From this public repository, run:

```bash
npm run check
```

The harness check validates:

- `opencode.json`;
- `default_agent: lead`;
- `AGENTS.md` as a short index pointing to `docs/ai/harness/` and
  `docs/ai/evolution/`;
- minimum frontmatter in `agents/*.md` and `commands/*.md`;
- documentation coverage for every `agents/*.md` file in
  `docs/ai/harness/agents.md`;
- documentation coverage for every `commands/*.md` file in
  `docs/ai/harness/commands.md`;
- local `/feature` contract;
- local `/plan` contract;
- local `/evolve` contract;
- minimum consistency between agent contracts and prompts in `agents/*.md`;
- local `/scope` and `/design` contracts;
- main docs in `docs/ai/harness/`;
- benchmark references to replay and evidence taxonomy;
- AHE run lifecycle under `docs/ai/evolution/runs/`;
- AHE manifests when present.
- local paths referenced by `change_manifest.json` and
  `change_evaluation.json`.

## AHE Run Lifecycle

- A run with `evaluation.md` but no `analysis/overview.md` and no
  `change_manifest.json` is a valid evaluator -> debugger intermediate state.
  The check must not reject it as a completed run.
- Once `change_manifest.json` exists, the run has entered proposal or apply
  phase: the check requires `analysis/overview.md`, validates the manifest, and
  requires `change_evaluation.json` so shape or closure errors are not hidden.

## Lightweight Doc Gardening

Before closing an AHE iteration:

- keep `AGENTS.md` as an index, not a long manual;
- check that commands and harness docs do not diverge;
- review incomplete runs in `docs/ai/evolution/runs/`;
- verify every manifest has predicted fixes, risk tasks, and component level;
- add `change_evaluation.json` when evaluating a previous change.

## Mechanical Doc Gardening

The local check turns the cheapest maintenance rules into mechanical checks:

- `AGENTS.md` must stay a short map, not a long manual;
- new agents and commands must appear in the harness docs;
- manifests and evaluations must not point to missing local artifacts.

Do not make doc gardening mandatory for normal features.
