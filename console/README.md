# OpenCode Orchestration Console

Frontend-first MVP for the OpenCode Orchestration Kit console.

## Run locally

From the repository root:

```bash
npm install --prefix console
npm run console:dev
```

Or from this directory:

```bash
npm install
npm run dev
```

`direct` and `/feature` launches use the local OpenCode CLI with:

```bash
OPENCODE_CONFIG_DIR=<repo>/opencode
```

Run state is stored locally under `console/.data/runs/` and is ignored by git. Other workflows remain mock-backed in this slice.

## Validate

```bash
npm run console:check
npm run console:build
npm --prefix console test
```
