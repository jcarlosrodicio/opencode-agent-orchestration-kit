# Slice 1.4 Compatibility Matrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish and mechanically enforce an evidence-backed compatibility contract for Node.js, OpenCode, the plugin SDK, operating systems, and optional integrations.

**Architecture:** A small root `compatibility.json` is the canonical machine-readable contract. A dependency-free Node.js checker validates that package manifests, documentation, blocking CI, the isolated OpenCode boundary smoke, and the separate latest canary agree with that contract. Blocking jobs prove the supported Node/OpenCode boundaries; a scheduled/manual workflow observes moving upstream `latest` without changing release readiness.

**Tech Stack:** Node.js 22/24 ESM, `node:test`, Bash, npm, OpenCode CLI, GitHub Actions YAML, Markdown, JSON.

---

## Approved inputs and boundaries

- Design spec: `docs/superpowers/specs/2026-07-21-compatibility-matrix-design.md`.
- Public repository only; run every relative command from its root.
- The active private OpenCode config remains read-only and out of scope.
- Current public base before implementation: `713f712`, four commits ahead of
  `origin/master` including the prerequisite advisory fix and approved spec.
- Do not update the canonical kit version, OpenCode SDK pins, OpenTUI pins,
  Superpowers reference, Docker pins, or remaining low-severity advisories.
- Do not push, tag, create a GitHub Release, or publish npm during this plan.
- The normal public leak scan remains mandatory before every handoff.

## File responsibility map

| File | Responsibility |
|---|---|
| `compatibility.json` | Canonical Node/OpenCode/SDK compatibility values only |
| `scripts/check-compatibility.mjs` | Pure, offline consistency validator for committed compatibility surfaces |
| `scripts/check-compatibility.test.mjs` | Fixture-based schema, drift, workflow, docs, and smoke-wrapper regression tests |
| `scripts/opencode-compat-smoke.sh` | Credential-free isolated runtime smoke for one requested OpenCode version |
| `scripts/check.sh` | Fast entrypoint; requires and invokes the compatibility checker |
| `package.json` | Root Node engine contract and compatibility check script |
| `opencode/package.json` | Installed harness Node engine and exact SDK/OpenTUI pins |
| `opencode/package-lock.json` | Deterministic root-package engine metadata; no dependency-version changes |
| `docs/compatibility.md` | Complete human compatibility/status/evidence contract |
| `README.md` | Short user-facing summary and link to the full matrix |
| `docs/installation.md` | Versioned Node prerequisite and pointer to compatibility policy |
| `.github/workflows/check.yml` | Blocking OS/Node matrix and blocking OpenCode boundary job |
| `.github/workflows/compatibility-canary.yml` | Scheduled/manual Node 26 + OpenCode latest observation only |

## Task 1: Add canonical compatibility data and schema validation

**Files:**

- Create: `compatibility.json`
- Create: `scripts/check-compatibility.mjs`
- Create: `scripts/check-compatibility.test.mjs`
- Modify: `scripts/check.sh:9-76`
- Modify: `package.json:7-18`

- [ ] **Step 1: Write the failing schema tests**

Create `scripts/check-compatibility.test.mjs` with a temporary-repository
fixture and the first three tests:

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { checkCompatibility } from "./check-compatibility.mjs";

const VALID_COMPATIBILITY = {
  schema_version: 1,
  node: {
    engines: "^22.9.0 || ^24.0.0",
    blocking_majors: [22, 24],
    canary_major: 26,
  },
  opencode: {
    supported_range: ">=1.14.41 <2.0.0",
    minimum_tested: "1.14.41",
    stable_tested: "1.18.4",
    canary: "latest",
  },
  sdk: {
    opencode_plugin: "1.14.41",
    opentui_core: "0.2.5",
    opentui_solid: "0.2.5",
  },
};

function writeJson(root, relative, value) {
  const full = path.join(root, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, `${JSON.stringify(value, null, 2)}\n`);
}

function makeFixture(t, compatibility = VALID_COMPATIBILITY) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oak-compat-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeJson(root, "compatibility.json", compatibility);
  return root;
}

test("valid canonical compatibility schema is accepted", (t) => {
  const root = makeFixture(t);
  assert.equal(checkCompatibility(root, { surfaces: false }).schema_version, 1);
});

test("unknown compatibility schema versions are rejected", (t) => {
  const root = makeFixture(t, { ...VALID_COMPATIBILITY, schema_version: 2 });
  assert.throws(
    () => checkCompatibility(root, { surfaces: false }),
    /schema_version must be 1/,
  );
});

test("non-canonical OpenCode boundaries are rejected", (t) => {
  const root = makeFixture(t, {
    ...VALID_COMPATIBILITY,
    opencode: { ...VALID_COMPATIBILITY.opencode, minimum_tested: "v1.14.41" },
  });
  assert.throws(
    () => checkCompatibility(root, { surfaces: false }),
    /minimum_tested must use MAJOR.MINOR.PATCH/,
  );
});
```

The `surfaces: false` option is test-only API for validating the canonical
object before the dependent files exist. It must never weaken the default CLI.

- [ ] **Step 2: Run the test and verify the intended red state**

Run:

```bash
node --test scripts/check-compatibility.test.mjs
```

Expected: FAIL because `scripts/check-compatibility.mjs` does not exist.

- [ ] **Step 3: Add the canonical JSON file**

Create `compatibility.json` with exactly:

```json
{
  "schema_version": 1,
  "node": {
    "engines": "^22.9.0 || ^24.0.0",
    "blocking_majors": [22, 24],
    "canary_major": 26
  },
  "opencode": {
    "supported_range": ">=1.14.41 <2.0.0",
    "minimum_tested": "1.14.41",
    "stable_tested": "1.18.4",
    "canary": "latest"
  },
  "sdk": {
    "opencode_plugin": "1.14.41",
    "opentui_core": "0.2.5",
    "opentui_solid": "0.2.5"
  }
}
```

- [ ] **Step 4: Implement minimal safe schema parsing**

Create `scripts/check-compatibility.mjs`. Use `parseStableVersion` and
`compareStableVersions` from `scripts/version.mjs`; do not add a semver
dependency.

```js
#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compareStableVersions, parseStableVersion } from "./version.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.dirname(path.dirname(SCRIPT_PATH));
const EXACT_KEYS = {
  root: ["schema_version", "node", "opencode", "sdk"],
  node: ["engines", "blocking_majors", "canary_major"],
  opencode: ["supported_range", "minimum_tested", "stable_tested", "canary"],
  sdk: ["opencode_plugin", "opentui_core", "opentui_solid"],
};

function invalid(message) {
  const error = new Error(message);
  error.code = "INVALID_COMPATIBILITY";
  return error;
}

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw invalid(`${label} keys must be exactly: ${wanted.join(", ")}`);
  }
}

function readRegularText(root, relative, fsOps = fs) {
  const full = path.join(root, relative);
  const stat = fsOps.lstatSync(full);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw invalid(`${relative} must be a safe regular file`);
  }
  return fsOps.readFileSync(full, "utf8");
}

function readJson(root, relative, fsOps = fs) {
  try {
    return JSON.parse(readRegularText(root, relative, fsOps));
  } catch (error) {
    if (error.code === "INVALID_COMPATIBILITY") throw error;
    throw invalid(`${relative} is invalid JSON: ${error.message}`);
  }
}

function validateCanonicalData(data) {
  assertExactKeys(data, EXACT_KEYS.root, "compatibility");
  assertExactKeys(data.node, EXACT_KEYS.node, "node");
  assertExactKeys(data.opencode, EXACT_KEYS.opencode, "opencode");
  assertExactKeys(data.sdk, EXACT_KEYS.sdk, "sdk");
  if (data.schema_version !== 1) throw invalid("schema_version must be 1");
  if (data.node.engines !== "^22.9.0 || ^24.0.0") {
    throw invalid("node.engines must be ^22.9.0 || ^24.0.0");
  }
  if (JSON.stringify(data.node.blocking_majors) !== JSON.stringify([22, 24])) {
    throw invalid("node.blocking_majors must be [22,24]");
  }
  if (data.node.canary_major !== 26) throw invalid("node.canary_major must be 26");
  for (const field of ["minimum_tested", "stable_tested"]) {
    try {
      parseStableVersion(data.opencode[field]);
    } catch {
      throw invalid(`${field} must use MAJOR.MINOR.PATCH`);
    }
  }
  if (compareStableVersions(data.opencode.minimum_tested, data.opencode.stable_tested) >= 0) {
    throw invalid("minimum_tested must be older than stable_tested");
  }
  if (data.opencode.supported_range !== `>=${data.opencode.minimum_tested} <2.0.0`) {
    throw invalid("supported_range must begin at minimum_tested and end before 2.0.0");
  }
  if (data.opencode.canary !== "latest") throw invalid("opencode.canary must be latest");
  for (const [field, value] of Object.entries(data.sdk)) {
    try {
      parseStableVersion(value);
    } catch {
      throw invalid(`sdk.${field} must use MAJOR.MINOR.PATCH`);
    }
  }
  return data;
}

export function checkCompatibility(
  repositoryRoot = REPOSITORY_ROOT,
  { fsOps = fs, surfaces = true } = {},
) {
  const data = validateCanonicalData(readJson(repositoryRoot, "compatibility.json", fsOps));
  if (surfaces) validateSurfaces(repositoryRoot, data, fsOps);
  return data;
}

function validateSurfaces() {
  // Added incrementally by Tasks 2-7. The default CLI always calls this path.
}

if (path.resolve(process.argv[1] ?? "") === SCRIPT_PATH) {
  try {
    const data = checkCompatibility();
    console.log(
      `compatibility contract ok: Node ${data.node.blocking_majors.join("/")} OpenCode ${data.opencode.supported_range}`,
    );
  } catch (error) {
    console.error(`compatibility contract invalid: ${error.message}`);
    process.exitCode = 1;
  }
}
```

- [ ] **Step 5: Run the focused tests**

Run:

```bash
node --test scripts/check-compatibility.test.mjs
```

Expected: 3 tests pass, 0 fail.

- [ ] **Step 6: Wire the checker into the fast contract**

Add these required files to `scripts/check.sh`:

```text
compatibility.json
scripts/check-compatibility.mjs
scripts/check-compatibility.test.mjs
```

Immediately after `node scripts/version.mjs --check`, add:

```bash
node scripts/check-compatibility.mjs
```

Add the package script:

```json
"check:compatibility": "node scripts/check-compatibility.mjs"
```

- [ ] **Step 7: Run the fast contract and commit**

Run:

```bash
npm run check:compatibility
npm run contract-check
git diff --check
```

Expected: all exit 0 and print the compatibility/contract success lines.

Commit only these files:

```bash
git add compatibility.json package.json scripts/check.sh scripts/check-compatibility.mjs scripts/check-compatibility.test.mjs
git commit -m "feat: add canonical compatibility contract"
```

## Task 2: Enforce package engines and exact SDK pins

**Files:**

- Modify: `scripts/check-compatibility.test.mjs`
- Modify: `scripts/check-compatibility.mjs`
- Modify: `package.json:1-20`
- Modify: `opencode/package.json:1-12`
- Modify: `opencode/package-lock.json:1-14`

- [ ] **Step 1: Extend the fixture with package manifests**

Have `makeFixture` write these minimal manifests whenever surface validation is
enabled:

```js
writeJson(root, "package.json", {
  name: "opencode-agent-orchestration-kit",
  engines: { node: VALID_COMPATIBILITY.node.engines },
});
writeJson(root, "opencode/package.json", {
  engines: { node: VALID_COMPATIBILITY.node.engines },
  dependencies: {
    "@opencode-ai/plugin": VALID_COMPATIBILITY.sdk.opencode_plugin,
    "@opentui/core": VALID_COMPATIBILITY.sdk.opentui_core,
    "@opentui/solid": VALID_COMPATIBILITY.sdk.opentui_solid,
  },
});
```

Add tests which independently change the root engine, packaged engine, plugin
pin, OpenTUI core pin, and OpenTUI solid pin, then expect an error naming the
drifting surface.

- [ ] **Step 2: Run the new tests and verify they fail**

Run:

```bash
node --test --test-name-pattern='engine|SDK|OpenTUI' scripts/check-compatibility.test.mjs
```

Expected: FAIL because package surfaces are not validated yet.

- [ ] **Step 3: Implement package-surface validation**

Add:

```js
function validatePackages(root, data, fsOps) {
  const rootPackage = readJson(root, "package.json", fsOps);
  const harnessPackage = readJson(root, "opencode/package.json", fsOps);
  if (rootPackage.engines?.node !== data.node.engines) {
    throw invalid("package.json engines.node drifted from compatibility.json");
  }
  if (harnessPackage.engines?.node !== data.node.engines) {
    throw invalid("opencode/package.json engines.node drifted from compatibility.json");
  }
  const expected = {
    "@opencode-ai/plugin": data.sdk.opencode_plugin,
    "@opentui/core": data.sdk.opentui_core,
    "@opentui/solid": data.sdk.opentui_solid,
  };
  for (const [name, version] of Object.entries(expected)) {
    if (harnessPackage.dependencies?.[name] !== version) {
      throw invalid(`opencode/package.json ${name} drifted from compatibility.json`);
    }
  }
}
```

Call `validatePackages` first from `validateSurfaces`.

- [ ] **Step 4: Add the Node engine to both real manifests**

Use exactly:

```json
"engines": {
  "node": "^22.9.0 || ^24.0.0"
}
```

Do not move the root canonical kit version and do not change any dependency
version.

- [ ] **Step 5: Refresh lock metadata without updating dependencies**

Run:

```bash
npm --prefix opencode install --package-lock-only --ignore-scripts
```

Inspect `opencode/package-lock.json`. The root package entry may gain the Node
engine; no `node_modules/*` version, resolved URL, or integrity may change.

Verify exact direct pins:

```bash
node - <<'NODE'
const lock = require('./opencode/package-lock.json')
const root = lock.packages['']
if (root.dependencies['@opencode-ai/plugin'] !== '1.14.41') process.exit(1)
if (root.dependencies['@opentui/core'] !== '0.2.5') process.exit(1)
if (root.dependencies['@opentui/solid'] !== '0.2.5') process.exit(1)
if (root.engines.node !== '^22.9.0 || ^24.0.0') process.exit(1)
NODE
```

- [ ] **Step 6: Run tests and commit**

Run:

```bash
node --test scripts/check-compatibility.test.mjs
npm run check:compatibility
npm run dependency-audit
git diff --check
```

Expected: all exit 0; audit reports only the already accepted low-severity
findings.

Commit:

```bash
git add package.json opencode/package.json opencode/package-lock.json scripts/check-compatibility.mjs scripts/check-compatibility.test.mjs
git commit -m "feat: declare supported Node engines"
```

## Task 3: Publish and validate the human compatibility matrix

**Files:**

- Create: `docs/compatibility.md`
- Modify: `README.md:229-237,758-765`
- Modify: `docs/installation.md:1-30`
- Modify: `scripts/check-compatibility.mjs`
- Modify: `scripts/check-compatibility.test.mjs`

- [ ] **Step 1: Add failing documentation contract tests**

Extend the fixture with README, installation, and compatibility documents. The
full matrix must sit between stable markers:

```markdown
<!-- compatibility-matrix:start -->
| Surface | Status | Contract |
|---|---|---|
| Node.js 22 | supported | ... |
<!-- compatibility-matrix:end -->
```

Add tests that:

1. replace `supported` with `supported boundary` and expect an unknown-status
   failure;
2. remove the OpenCode supported range and expect a missing-range failure;
3. remove Node 22 or Node 24 and expect a missing-supported-line failure;
4. remove `WSL2`, `Native Windows`, or any optional integration and expect the
   corresponding missing-boundary failure;
5. remove the README link to `docs/compatibility.md` and expect failure;
6. restore the unversioned installation text `Node.js and npm` and expect
   failure.

- [ ] **Step 2: Run the documentation tests red**

Run:

```bash
node --test --test-name-pattern='documentation|status|README|installation' scripts/check-compatibility.test.mjs
```

Expected: FAIL because documentation validation is not implemented.

- [ ] **Step 3: Implement marker-scoped documentation validation**

Add:

```js
const STATUS_TERMS = new Set(["tested", "supported", "experimental", "unsupported"]);

function extractMarkedMatrix(text) {
  const start = "<!-- compatibility-matrix:start -->";
  const end = "<!-- compatibility-matrix:end -->";
  const first = text.indexOf(start);
  const last = text.indexOf(end);
  if (first < 0 || last <= first) throw invalid("docs/compatibility.md matrix markers are missing");
  return text.slice(first + start.length, last);
}

function validateDocumentation(root, data, fsOps) {
  const docs = readRegularText(root, "docs/compatibility.md", fsOps);
  const readme = readRegularText(root, "README.md", fsOps);
  const installation = readRegularText(root, "docs/installation.md", fsOps);
  const matrix = extractMarkedMatrix(docs);
  for (const line of matrix.split("\n")) {
    if (!line.startsWith("|") || line.includes("---") || line.includes("Status")) continue;
    const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
    if (cells.length >= 2 && !STATUS_TERMS.has(cells[1])) {
      throw invalid(`unknown compatibility status: ${cells[1]}`);
    }
  }
  const requiredDocs = [
    data.node.engines,
    data.opencode.supported_range,
    data.opencode.minimum_tested,
    data.opencode.stable_tested,
    "Node.js 22",
    "Node.js 24",
    "Node.js 26",
    "WSL2",
    "Native Windows",
    "Token usage plugin",
    "Open Design Docker adapter",
    "Superpowers",
    "Impeccable",
  ];
  for (const token of requiredDocs) {
    if (!matrix.includes(token) && !docs.includes(token)) {
      throw invalid(`docs/compatibility.md must declare ${token}`);
    }
  }
  if (!readme.includes("docs/compatibility.md")) {
    throw invalid("README.md must link docs/compatibility.md");
  }
  if (!installation.includes(data.node.engines)) {
    throw invalid("docs/installation.md must declare the canonical Node engine");
  }
}
```

Call it after package validation.

- [ ] **Step 4: Write `docs/compatibility.md`**

Use the approved design's initial public matrix verbatim, but add:

- the four exact status definitions;
- a dated evidence section separating local evidence from blocking CI;
- the exact Node engine and OpenCode supported range;
- the SDK/OpenTUI pin table;
- promotion instructions: update `stable_tested`, run both boundary smokes,
  update docs, review, and never let the canary rewrite files;
- the fact that provider compatibility is out of scope;
- the canary failure interpretation;
- the two matrix markers shown above.

Do not claim remote matrix jobs have passed before they actually run. Before
remote evidence exists, label those combinations as the blocking policy and
keep the exact evidence subsection honest about what was locally observed.

- [ ] **Step 5: Update README and installation docs**

Replace the unversioned quick-start requirement with:

```markdown
- Node.js `^22.9.0 || ^24.0.0` and npm
```

Replace the README compatibility section with a short summary naming Node 22
and 24, OpenCode `>=1.14.41 <2.0.0`, WSL2 experimental, native Windows
unsupported, and link `docs/compatibility.md` for evidence/status details.

Add the same canonical Node prerequisite and link near the start of
`docs/installation.md`.

- [ ] **Step 6: Run tests and commit**

Run:

```bash
node --test scripts/check-compatibility.test.mjs
npm run check:compatibility
npm run contract-check
git diff --check
```

Expected: all exit 0.

Commit:

```bash
git add docs/compatibility.md README.md docs/installation.md scripts/check-compatibility.mjs scripts/check-compatibility.test.mjs
git commit -m "docs: publish compatibility matrix"
```

## Task 4: Expand blocking Node and OS CI

**Files:**

- Modify: `.github/workflows/check.yml`
- Modify: `scripts/check-compatibility.mjs`
- Modify: `scripts/check-compatibility.test.mjs`

- [ ] **Step 1: Add failing blocking-matrix tests**

Write a fixture workflow using a `strategy.matrix.include` list. Add tests that
remove or add a pair and assert that only these exact blocking combinations are
accepted:

```text
ubuntu-latest / 22 / canonical=false
ubuntu-latest / 24 / canonical=true
macos-latest  / 24 / canonical=false
```

Also test that:

- `fail-fast` is false;
- tag validation and dependency audit are guarded by `matrix.canonical`;
- each matrix job runs install, contract/tests, typecheck, and installation
  smoke;
- the workflow has no write permission or publish command.

- [ ] **Step 2: Run the matrix tests red**

Run:

```bash
node --test --test-name-pattern='blocking matrix|canonical job' scripts/check-compatibility.test.mjs
```

Expected: FAIL against the current single Ubuntu/Node 24 job.

- [ ] **Step 3: Implement narrow workflow parsing**

Do not add a YAML dependency. Parse only the deliberately stable compatibility
markers added to the workflow:

```yaml
# compatibility-blocking:start
strategy:
  fail-fast: false
  matrix:
    include:
      - os: ubuntu-latest
        node: 22
        canonical: false
      - os: ubuntu-latest
        node: 24
        canonical: true
      - os: macos-latest
        node: 24
        canonical: false
# compatibility-blocking:end
```

Reuse a generic `extractMarkedSection(text, start, end)` helper. Parse each
three-line entry with a strict regular expression and compare the normalized
array to the expected combinations derived from `blocking_majors` plus the
approved macOS representative.

- [ ] **Step 4: Convert the blocking workflow**

Keep the existing triggers and read-only permissions. Change `runs-on` and
setup-node to matrix values:

```yaml
runs-on: ${{ matrix.os }}
strategy:
  fail-fast: false
  matrix:
    include: # exact entries above
```

Add a first evidence step:

```yaml
- name: Report runtime evidence
  run: |
    uname -a || true
    node --version
    npm --version
    node -e "const p=require('./opencode/package.json'); console.log(JSON.stringify({arch:process.arch, platform:process.platform, plugin:p.dependencies['@opencode-ai/plugin'], opentuiCore:p.dependencies['@opentui/core'], opentuiSolid:p.dependencies['@opentui/solid']}))"
```

Use these guards:

```yaml
if: matrix.canonical && startsWith(github.ref, 'refs/tags/')
```

for tag validation, and:

```yaml
if: matrix.canonical
```

for dependency audit. All other current checks run in every matrix job.

- [ ] **Step 5: Run local contract tests and commit**

Run:

```bash
node --test scripts/check-compatibility.test.mjs
npm run check:compatibility
npm run check
git diff --check
```

Expected: local tests pass. Do not claim the remote Node 22/macOS jobs pass
until a later authorized push produces GitHub Actions evidence.

Commit:

```bash
git add .github/workflows/check.yml scripts/check-compatibility.mjs scripts/check-compatibility.test.mjs
git commit -m "ci: test supported Node and OS matrix"
```

## Task 5: Build the isolated OpenCode compatibility smoke

**Files:**

- Create: `scripts/opencode-compat-smoke.sh`
- Modify: `scripts/check-compatibility.test.mjs`
- Modify: `scripts/check.sh`

- [ ] **Step 1: Write a fake-CLI isolation test**

Extend the test fixture with a minimal `opencode/agents/lead.md` and a fake
`npx` placed first in `PATH`. The fake executable must:

- fail if a test-only inherited provider-token sentinel is present;
- fail if HOME or any XDG/npm cache path is outside one shared temp root;
- return the requested version for `opencode --version`;
- return `{"name":"lead","mode":"primary"}` for
  `opencode debug agent lead --pure`.

The test invokes the real shell script with an inherited fake secret and
asserts success. Add independent negative tests where the fake CLI returns the
wrong version, omits the lead agent, or prints the original repository path.

Use the working-tree copy behavior as an oracle: after running, the fake CLI's
`OPENCODE_CONFIG_DIR` must not equal or resolve under the fixture checkout.

- [ ] **Step 2: Run the smoke-wrapper tests red**

Run:

```bash
node --test --test-name-pattern='OpenCode compatibility smoke' scripts/check-compatibility.test.mjs
```

Expected: FAIL because `scripts/opencode-compat-smoke.sh` does not exist.

- [ ] **Step 3: Implement the shell wrapper**

Create an executable Bash script with these boundaries:

```bash
#!/usr/bin/env bash
set -euo pipefail

root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
version="${1:-}"
test "$#" -eq 1 || { echo "usage: $0 <MAJOR.MINOR.PATCH|latest>" >&2; exit 2; }
if test "$version" != latest; then
  node -e 'if (!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(process.argv[1])) process.exit(1)' "$version" \
    || { echo "invalid OpenCode version: $version" >&2; exit 2; }
fi

smoke_parent="${TMPDIR:-/tmp}"
smoke_parent="${smoke_parent%/}"
smoke_root="$(mktemp -d "$smoke_parent/oak-opencode-compat.XXXXXX")"
original_home="${HOME:-}"

cleanup() {
  case "$smoke_root" in
    "$smoke_parent"/oak-opencode-compat.*) rm -rf -- "$smoke_root" ;;
    *) echo "Refusing unsafe smoke cleanup: $smoke_root" >&2; return 1 ;;
  esac
}
trap cleanup EXIT

for dir in home config data cache state npm config/opencode; do
  mkdir -p "$smoke_root/$dir"
done
```

Copy the working tree with an inline Node script. Reject symlinks and skip any
path component named `node_modules` or `.oak`:

```js
import fs from "node:fs";
import path from "node:path";
const [source, target] = process.argv.slice(2);
fs.cpSync(source, target, {
  recursive: true,
  filter(current) {
    const relative = path.relative(source, current);
    if (relative.split(path.sep).some((part) => part === "node_modules" || part === ".oak")) return false;
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`source symlink is not allowed: ${relative}`);
    return true;
  },
});
```

Run every CLI call through exactly this allowlist:

```bash
run_opencode() {
  env -i \
    PATH="$PATH" \
    HOME="$smoke_root/home" \
    XDG_CONFIG_HOME="$smoke_root/config" \
    XDG_DATA_HOME="$smoke_root/data" \
    XDG_CACHE_HOME="$smoke_root/cache" \
    XDG_STATE_HOME="$smoke_root/state" \
    npm_config_cache="$smoke_root/npm" \
    OPENCODE_CONFIG_DIR="$smoke_root/config/opencode" \
    npx --yes --package "opencode-ai@$version" opencode "$@"
}
```

Capture `run_opencode --version`, require an exact match for a concrete version
and canonical `MAJOR.MINOR.PATCH` for `latest`. Capture
`run_opencode debug agent lead --pure`, parse it as JSON with Node, and require
`name === "lead"` and `mode === "primary"`.

Search both captured outputs for non-empty `$original_home` and `$root`; either
match is a failure. Finish with:

```text
opencode compatibility smoke ok: requested=<request> resolved=<actual>
```

Do not print the agent JSON, environment, npm config, or temp paths.

- [ ] **Step 4: Register executable/required-file contracts**

Add `scripts/opencode-compat-smoke.sh` to `required_files` and the executable
loop in `scripts/check.sh`.

- [ ] **Step 5: Run fake and real focused smokes**

Run:

```bash
node --test scripts/check-compatibility.test.mjs
bash scripts/opencode-compat-smoke.sh 1.14.41
bash scripts/opencode-compat-smoke.sh 1.18.4
git diff --check
```

Expected: all exit 0; each live smoke prints only its one success line. If npm
or OpenCode emits unavoidable non-secret diagnostics on stderr, document the
exact output instead of weakening the stdout/privacy assertions.

- [ ] **Step 6: Commit**

```bash
git add scripts/opencode-compat-smoke.sh scripts/check.sh scripts/check-compatibility.test.mjs
git commit -m "test: add isolated OpenCode compatibility smoke"
```

## Task 6: Add blocking OpenCode boundary evidence

**Files:**

- Modify: `.github/workflows/check.yml`
- Modify: `scripts/check-compatibility.mjs`
- Modify: `scripts/check-compatibility.test.mjs`

- [ ] **Step 1: Add failing boundary-job tests**

Between workflow markers `# opencode-boundaries:start` and
`# opencode-boundaries:end`, require a separate `opencode-compatibility` job
with:

```yaml
runs-on: ubuntu-latest
strategy:
  fail-fast: false
  matrix:
    opencode:
      - "1.14.41"
      - "1.18.4"
```

Add tests removing each version, changing Node 24, dropping `--pure` indirectly
by changing the invoked script, or replacing the isolated script with the
operator's `opencode` binary.

- [ ] **Step 2: Run boundary tests red**

Run:

```bash
node --test --test-name-pattern='OpenCode boundary job' scripts/check-compatibility.test.mjs
```

Expected: FAIL because the job is absent.

- [ ] **Step 3: Add checker enforcement**

Parse the marker-scoped job and require:

- Node `24` through `actions/setup-node`;
- the exact sorted version list from `minimum_tested` and `stable_tested`;
- `bash scripts/opencode-compat-smoke.sh "${{ matrix.opencode }}"`;
- read-only permissions inherited from the workflow;
- no `continue-on-error`, publication, credentials, or provider secrets.

- [ ] **Step 4: Add the blocking job**

The job needs only checkout, setup-node 24, and the smoke call. It must not run
`npm ci`; the smoke owns an isolated npm cache and installs only the requested
CLI package. Add a version-report step only if it does not duplicate or expose
the captured agent output.

- [ ] **Step 5: Run local checks and commit**

```bash
node --test scripts/check-compatibility.test.mjs
npm run check:compatibility
npm run contract-check
git diff --check
```

Expected: all exit 0 locally. Remote boundary evidence remains pending until an
authorized push.

Commit:

```bash
git add .github/workflows/check.yml scripts/check-compatibility.mjs scripts/check-compatibility.test.mjs
git commit -m "ci: verify supported OpenCode boundaries"
```

## Task 7: Add the separate latest canary

**Files:**

- Create: `.github/workflows/compatibility-canary.yml`
- Modify: `scripts/check-compatibility.mjs`
- Modify: `scripts/check-compatibility.test.mjs`
- Modify: `scripts/check.sh`

- [ ] **Step 1: Add failing canary-contract tests**

Add a valid fixture and negative cases for:

- missing `schedule`;
- missing `workflow_dispatch`;
- presence of `push` or `pull_request` triggers;
- Node different from `canary_major` 26;
- argument different from `opencode.canary` (`latest`);
- write permissions;
- publish, tag, issue creation, or dependency-update commands.

The canary is non-blocking because it has only schedule/manual triggers and is
not a branch/tag required workflow. Do not add `continue-on-error`; a scheduled
canary failure should remain visibly red in its own workflow.

- [ ] **Step 2: Run canary tests red**

Run:

```bash
node --test --test-name-pattern='canary' scripts/check-compatibility.test.mjs
```

Expected: FAIL because the canary workflow is absent.

- [ ] **Step 3: Implement canary checker rules**

Validate marker-scoped values instead of parsing general YAML. Require these
literal declarations inside the canary markers:

```yaml
node-version: 26
run: bash scripts/opencode-compat-smoke.sh latest
```

Validate the trigger and permission restrictions over the whole workflow.

- [ ] **Step 4: Create the canary workflow**

Use:

```yaml
name: Compatibility Canary

on:
  workflow_dispatch:
  schedule:
    - cron: "17 6 * * 1"

permissions:
  contents: read

jobs:
  latest:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup experimental Node
        uses: actions/setup-node@v4
        with:
          node-version: 26
      - name: Smoke latest OpenCode
        run: bash scripts/opencode-compat-smoke.sh latest
```

Wrap the Node/run declarations in the stable canary markers expected by the
checker. Do not add `push`, `pull_request`, secrets, caches outside the smoke,
artifact publication, or automated mutation.

- [ ] **Step 5: Register, validate, and commit**

Add the new workflow to `required_files` in `scripts/check.sh`.

Run:

```bash
node --test scripts/check-compatibility.test.mjs
npm run check:compatibility
npm run contract-check
git diff --check
```

Expected: all exit 0.

Commit:

```bash
git add .github/workflows/compatibility-canary.yml scripts/check.sh scripts/check-compatibility.mjs scripts/check-compatibility.test.mjs
git commit -m "ci: add non-blocking compatibility canary"
```

## Task 8: Run the complete validation and prepare the local handoff

**Files:**

- Modify only if evidence exposes an actual Slice 1.4 defect.
- Do not add release notes or bump `package.json` version.

- [ ] **Step 1: Run focused compatibility validation**

```bash
node --test scripts/check-compatibility.test.mjs
node scripts/check-compatibility.mjs
bash scripts/opencode-compat-smoke.sh 1.14.41
bash scripts/opencode-compat-smoke.sh 1.18.4
```

Expected: all compatibility tests pass; both exact smokes resolve the requested
version and discover the `lead` agent without printing private paths.

- [ ] **Step 2: Run the full release suite**

```bash
npm run check:release
```

Expected:

- contract checker passes;
- every `node:test` suite passes, including the new compatibility suite;
- typecheck passes;
- dependency audit exits 0 at `moderate` threshold;
- installation smoke passes.

- [ ] **Step 3: Verify the compatibility values and lockfile**

```bash
node - <<'NODE'
const c = require('./compatibility.json')
const root = require('./package.json')
const harness = require('./opencode/package.json')
if (root.engines.node !== c.node.engines) process.exit(1)
if (harness.engines.node !== c.node.engines) process.exit(1)
if (harness.dependencies['@opencode-ai/plugin'] !== c.sdk.opencode_plugin) process.exit(1)
if (harness.dependencies['@opentui/core'] !== c.sdk.opentui_core) process.exit(1)
if (harness.dependencies['@opentui/solid'] !== c.sdk.opentui_solid) process.exit(1)
NODE
npm --prefix opencode ci --ignore-scripts
npm run dependency-audit
```

Expected: exact pins remain `1.14.41`, `0.2.5`, and `0.2.5`; no moderate/high
advisory returns.

- [ ] **Step 4: Run public leak and diff checks**

```bash
git diff --check origin/master...HEAD
git diff --stat origin/master...HEAD
./scripts/check.sh
```

Expected: `git diff --check` and the repository's canonical leak scan both exit
0. Inspect any intentional security-term hit manually rather than hiding it
with a broad exclude.

- [ ] **Step 5: Confirm the private checkout is unchanged**

```bash
: "${OAK_PRIVATE_CHECKOUT:?Set OAK_PRIVATE_CHECKOUT to the active private checkout}"
git -C "$OAK_PRIVATE_CHECKOUT" status --short --branch
git -C "$OAK_PRIVATE_CHECKOUT" rev-parse HEAD
node "$OAK_PRIVATE_CHECKOUT/scripts/check-harness.mjs"
```

Expected: clean `master`, the recorded pre-implementation private commit, and a
passing checker. The machine-local checkout value must not be copied into
public files or commits.

- [ ] **Step 6: Request independent implementation review**

Give the reviewer only:

- approved spec path;
- this plan path;
- `origin/master...HEAD` diff;
- focused/full validation results;
- explicit no-push/no-release boundary.

Require review of correctness, privacy, CI semantics, shell portability,
Node/OpenCode evidence claims, and missing tests. Fix findings through focused
TDD and rerun the full relevant validation. Maximum three review iterations.

- [ ] **Step 7: Record the final local state without publishing**

```bash
git status --short --branch
git log --oneline origin/master..HEAD
```

Expected: clean public tree ahead of origin; private tree unchanged. Report
that GitHub-hosted Node 22/macOS/boundary/canary evidence remains unproven until
the user separately authorizes a push. Do not tag, release, or publish npm.

## Execution completion gate

Local implementation is complete only when all focused/full checks pass and an
independent implementation reviewer returns `APPROVED`. Remote compatibility
claims become current only after a separately authorized push produces the
blocking GitHub Actions evidence. A failed canary is recorded but does not
invalidate a passing blocking matrix.
