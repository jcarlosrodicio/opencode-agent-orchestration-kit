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
- `default_agent: developer`;
- minimum frontmatter in `agents/*.md` and `commands/*.md`;
- local `/feature` contract;
- main docs in `docs/ai/harness/`;
- benchmark references to replay and evidence taxonomy;
- AHE manifests when present.

## Lightweight Doc Gardening

Before closing an AHE iteration:

- keep `AGENTS.md` as an index, not a long manual;
- check that commands and harness docs do not diverge;
- review incomplete runs in `docs/ai/evolution/runs/`;
- verify every manifest has predicted fixes, risk tasks, and component level;
- add `change_evaluation.json` when evaluating a previous change.

Do not make doc gardening mandatory for normal features.
