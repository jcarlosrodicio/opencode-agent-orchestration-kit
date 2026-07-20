# Version Identity and Release Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish `package.json` version `1.0.27` as the kit's single editable identity, propagate it through installation state and lifecycle commands, and reject release/tag/version drift mechanically.

**Architecture:** Add a dependency-free version module for strict stable-version parsing, comparison, canonical package reads, release-note checks, and explicit tag validation. Inject that canonical reader into the existing installation manager so manifests, doctor, upgrade, rollback, and recovery remain testable without duplicating the version. Keep release publication manual and preserve the Slice 1.2 transaction model.

**Tech Stack:** Node.js 24 ESM, `node:test`, Bash wrappers/smoke scripts, JSON manifests, GitHub Actions YAML, Markdown.

---

## Preconditions and execution constraints

Approved spec: `docs/superpowers/specs/2026-07-20-version-identity-and-releases-design.md`.

The public branch already contains local commit `948b488` for Slices 1.1 and
1.2 and is ahead of `origin/master`. The approved Slice 1.3 spec and this plan
are intentionally uncommitted. Do not create a worktree from `HEAD`: it would
omit both documents and separate implementation from the unpublished Slice 1.2
baseline it extends.

The user previously required inline execution and public consolidation only at
the end. That overrides this skill's usual per-task commit cadence:

- work in the current public checkout;
- do not stage with `git add .` or `git add -A`;
- do not create intermediate commits;
- use checkboxes and test evidence as checkpoints;
- after final review, stage the exact public-safe file list and create one local
  commit;
- do not push, tag, or create a release.

The private OpenCode configuration checkout is out of scope and must remain
clean. Never copy private configuration, providers, MCP wiring,
credentials, sessions, transcripts, memories, databases, endpoints, or machine
paths into the public repository.

Before editing:

- [ ] `git status --short --branch` shows only this approved spec and plan.
- [ ] `git log -1 --oneline` is `948b488 feat: add safe installation lifecycle`.
- [ ] `npm run check` passes 245 tests.
- [ ] `git diff --check` passes.

## File responsibility map

### Create

- `scripts/version.mjs` — strict version parser/comparator, canonical package
  reader, repository contract checker, CLI output, and explicit tag check.
- `scripts/version.test.mjs` — module, repository contract, workflow, and
  `V001–V027` uniqueness tests.
- `docs/releases/v1.0.27.md` — release-ready notes for the unpublished release.
- `docs/superpowers/specs/2026-07-20-version-identity-and-releases-design.md`
  — approved public contract, already untracked when execution begins.
- `docs/superpowers/plans/2026-07-20-version-identity-and-releases.md` — this
  reviewed public plan, also already untracked when execution begins.

### Modify

- `package.json` — canonical version and `check:version`.
- `scripts/manage-installation.mjs` — injected version provider, required
  manifest field, `--version`, version-aware lifecycle behavior.
- `scripts/manage-installation.test.mjs` — fixtures and `V012–V027` scenarios.
- `scripts/check.sh` — required files and version contract invocation.
- `scripts/install-smoke.sh` — version-bearing lifecycle assertions.
- `.github/workflows/check.yml` — tag trigger and tag-only validation.
- `README.md`, `docs/installation.md`, `docs/quickstart.md` — public contract.

### Preserve unless a failing test proves otherwise

- The five shell wrappers: their pass-through already supports `--version`.
- `opencode/package.json`: dependency manifest, not a version source.
- Historical `docs/releases/*`: no backfill.

## Test-ID contract

Keep `[S001]` through `[S136]` exactly once. Add `[V001]` through `[V027]`
exactly once across the two root test files. An unlabelled meta-test in
`scripts/version.test.mjs` reads both files and asserts the exact sorted V list;
the meta-test has no V label to avoid recursive counting.

---

### Task 1: Strict canonical version module

**Files:**
- Create: `scripts/version.mjs`
- Create: `scripts/version.test.mjs`
- Modify: `package.json:3`

- [ ] **Step 1: Write RED tests `[V001]–[V003]`**

Test canonical `1.0.27`; reject `v1.0.27`, leading zeroes, missing components,
prerelease, metadata, whitespace, negative/unsafe components; prove numeric
ordering `1.9.9 < 1.10.0`. Use temporary repository fixtures and require exact
package name `opencode-agent-orchestration-kit`.

Import the intended interface:

```js
import {
  compareStableVersions,
  formatVersion,
  parseStableVersion,
  readCanonicalVersion,
} from "./version.mjs";
```

- [ ] **Step 2: Verify RED**

Run `node --test --test-name-pattern='V001|V002|V003' scripts/version.test.mjs`.
Expected: FAIL because the module/exports do not exist.

- [ ] **Step 3: Implement the minimal pure functions**

```js
export function parseStableVersion(value) { /* strict MAJOR.MINOR.PATCH */ }
export function compareStableVersions(left, right) { /* numeric comparison */ }
export function readCanonicalVersion(repositoryRoot, fsOps = fs) { /* package */ }
export function formatVersion(version) {
  return `opencode-agent-orchestration-kit ${version}`;
}
```

Reject non-safe integers. Read a regular, non-symlink root `package.json` through
an injected filesystem object. Never inspect Git or the network.

- [ ] **Step 4: Change root package version to `1.0.27`**

Do not add a version to `opencode/package.json`.

- [ ] **Step 5: Verify GREEN**

Run the focused test command and `npm run check:quick`. Expected: 3 focused
tests pass and existing contract checks remain green.

### Task 2: Version-bearing manifest schema

**Files:**
- Modify: `scripts/manage-installation.mjs:218-288,532-581,865-901`
- Modify: `scripts/manage-installation.test.mjs:57-169`

- [ ] **Step 1: Update fixtures and write RED `[V012]–[V015]`**

Add `kit_version: "1.0.27"` to `validManifest()`. Make `managerFixture()` inject
a provider returning `1.0.27`, and make `planFixture()` pass the same explicit
`kitVersion` into pure planning options. Test initial install persistence
(`V012`); install dry-run reports the source identity while leaving the target
absent (`V013`); invalid/missing manifest versions (`V014`); and digest change
when only version changes (`V015`).

- [ ] **Step 2: Verify RED**

Run `node --test --test-name-pattern='V012|V013|V014|V015' scripts/manage-installation.test.mjs`.
Expected: FAIL because generated manifests omit or reject the new field.

- [ ] **Step 3: Require the field without duplicating identity**

Import `parseStableVersion`, add `kit_version` to `MANIFEST_KEYS`, validate it,
and include it in `makeNextManifest`. Pass the value through `buildPlan` options.
Extend `createInstallationManager` with an injected `versionProvider`; do not
add a literal `KIT_VERSION` constant.

- [ ] **Step 4: Preserve the field in snapshots**

Do not add a transaction-level version. Existing complete previous/next
manifest snapshots and canonical digests must carry it.

- [ ] **Step 5: Verify GREEN and regression safety**

Run the focused command, then `node --test scripts/manage-installation.test.mjs`.
Expected: all manager tests pass and all S IDs remain unique.

### Task 3: Exact mutation-free `--version`

**Files:**
- Modify: `scripts/version.mjs`
- Modify: `scripts/version.test.mjs`
- Modify: `scripts/manage-installation.mjs:1326-1381`
- Test unchanged: all five shell wrappers

- [ ] **Step 1: Write RED `[V004]–[V006]`**

Require exact direct-manager output, identical output from every wrapper, zero
target writes, and exit two when `--version` is combined with any other flag.

- [ ] **Step 2: Verify RED**

Run `node --test --test-name-pattern='V004|V005|V006' scripts/version.test.mjs`.
Expected: FAIL as an unknown command/argument.

- [ ] **Step 3: Wire the provider once**

Production `main()` derives the repository root from the existing source root
and creates `() => readCanonicalVersion(repositoryRoot)`. Recognize sole direct
`--version` and sole wrapper `<command> --version` before target resolution.
Print `formatVersion(version)` plus one newline. Never inventory source, inspect
target, lock, or mutate state.

- [ ] **Step 4: Add `node scripts/version.mjs` CLI output**

Use an entrypoint guard so importing the module has no side effects.

- [ ] **Step 5: Verify GREEN**

Run the focused test and `bash -n` on all wrappers. Expected: PASS; wrappers
remain executable and unchanged.

### Task 4: Version-aware upgrade planning

**Files:**
- Modify: `scripts/manage-installation.mjs:532-680,1210-1324`
- Modify: `scripts/manage-installation.test.mjs`

- [ ] **Step 1: Write RED `[V016]–[V019]`**

Test: higher source version creates a manifest-only upgrade even with unchanged
payload files; equal version/payload is no-op; equal version/different payload
blocks as `same-version-different-payload`; lower source blocks as
`source-older`. On blockers assert target, manifest, lock, journal, and rollback
bytes are unchanged.

- [ ] **Step 2: Verify RED**

Run `node --test --test-name-pattern='V016|V017|V018|V019' scripts/manage-installation.test.mjs`.
Expected: FAIL because planning ignores version order.

- [ ] **Step 3: Add one pure version gate**

Receive source version, previous manifest, and current source payload digest;
return `upgrade-available`, `current`, `same-version-different-payload`, or
`source-older`. Reuse `compareStableVersions`. Evaluate before target bootstrap
or lock acquisition. A greater version sets `hasWork` even with zero file ops.

- [ ] **Step 4: Preserve command boundaries**

Apply the gate to upgrade. Initial install uses the canonical version; uninstall
uses validated installed state. Add no downgrade/force flag.

- [ ] **Step 5: Verify GREEN**

Run the focused command plus matching existing `S001`, `S008`, `S009`, `S092`.
Expected: PASS.

### Task 5: Deterministic doctor taxonomy

**Files:**
- Modify: `scripts/manage-installation.mjs:1142-1190,1326-1381`
- Modify: `scripts/manage-installation.test.mjs`

- [ ] **Step 1: Write RED `[V021]` and `[V022]`**

Table-test `current`, `upgrade-available`, `source-older`,
`same-version-different-payload`, and `invalid-version-state`. Separately prove
manifest absence yields `not-installed`, source `1.0.27`, installed null;
present corrupt/version-invalid manifest yields exit two and never
`not-installed`.

Assert additive fields `sourceVersion`, `installedVersion`, `versionState` and
preservation of existing safe report keys.

- [ ] **Step 2: Verify RED**

Run `node --test --test-name-pattern='V021|V022' scripts/manage-installation.test.mjs`.
Expected: FAIL because doctor has no version fields.

- [ ] **Step 3: Compose reports without weakening fail-closed behavior**

Add the three fields to valid/absent reports. Catch only enough validation
failure to classify a present invalid manifest or canonical source safely; use
null only for the side that cannot supply a valid version. Never echo raw JSON
or package contents. Filesystem failures that prevent a safe report retain the
generic exit-two path and must not become `not-installed`.

- [ ] **Step 4: Preserve existing finding precedence**

Version `current` does not override locks, active transactions, ownership drift,
preserved warnings, or rollback residue. Add concise ordinary doctor output;
leave ACK output unchanged.

- [ ] **Step 5: Verify GREEN and regressions**

Run the focused tests plus `S021`, `S044`, `S080`, `S093`, `S108`. Expected:
PASS.

### Task 6: Acknowledgement, rollback, and recovery identity

**Files:**
- Modify: `scripts/manage-installation.mjs:902-1140,1191-1269`
- Modify: `scripts/manage-installation.test.mjs`

- [ ] **Step 1: Write RED `[V020]`, `[V023]–[V027]`**

Prove: ACK cannot bypass a newer source transition; upgrade snapshots record the
new version; rollback restores the old version; initial-install rollback restores
manifest absence; interrupted recovery uses journal versions even if the current
provider changes; corrupt version state cannot bypass locks, ownership, digest,
conflict, or recovery checks.

- [ ] **Step 2: Verify RED**

Run `node --test --test-name-pattern='V020|V023|V024|V025|V026|V027' scripts/manage-installation.test.mjs`.
Expected: version assertions fail.

- [ ] **Step 3: Preserve snapshot identity**

Commit, rollback, and recovery use only versions stored in complete previous and
next manifests. Never replace a recovered snapshot version with the current
provider. Existing canonical manifest digest checks cover version-only
corruption.

- [ ] **Step 4: Gate acknowledgement narrowly**

When source and installed versions differ, return action required before ACK
authorization or mutation. Normal upgrade remains possible because Slice 1.2
treats preserved merge warnings as non-blocking; after upgrade, ACK can operate
at the current version.

- [ ] **Step 5: Verify GREEN and crash regressions**

Run the V-focused command plus `S012`, `S016`, `S029`, `S030`, `S045`, `S050`,
`S051`, `S099`, `S100`, `S133`. Expected: PASS.

### Task 7: Release-note and repository drift checker

**Files:**
- Modify: `scripts/version.mjs`
- Modify: `scripts/version.test.mjs`
- Create: `docs/releases/v1.0.27.md`
- Modify: `package.json:7-17`
- Modify: `scripts/check.sh:7-67`

- [ ] **Step 1: Write RED `[V007]–[V011]`**

Using temp fixture repos, test current note path/heading, missing/wrong note,
historical gaps allowed, matching/mismatching/malformed tag, and repository-local
check without tag context. `[V008]` must also prove each allowlisted competing
declaration fails: root `VERSION`, `opencode/package.json.version`, and a stable
literal added to each operational source class. Never rewrite the real package
or depend on local tags.

- [ ] **Step 2: Verify RED**

Run `node --test --test-name-pattern='V007|V008|V009|V010|V011' scripts/version.test.mjs`.
Expected: FAIL because check modes do not exist.

- [ ] **Step 3: Implement explicit modes**

Support:

```bash
node scripts/version.mjs --check
node scripts/version.mjs --check-tag v1.0.27
```

`--check` validates root package identity, exactly the current note filename and
first heading, and mechanical single-source rules through the exported API:

```js
export function checkVersionContract(options) { /* returns validated identity */ }
```

`options` supplies `repositoryRoot` and an injectable filesystem. The checker
uses this explicit allowlist:

- root `VERSION` must be absent;
- `opencode/package.json` must not contain a `version` key;
- `scripts/version.mjs`, `scripts/manage-installation.mjs`, the five wrappers,
  `scripts/check.sh`, and `.github/workflows/check.yml` must not contain a
  concrete stable-version literal outside the root package consumer path;
- current release notes and behavioral tests are intentional consumers and are
  excluded from duplicate-declaration scanning.

This catches a future operational `KIT_VERSION = "1.0.27"` or equivalent hard
coding while permitting dependency, schema, fixture, smoke, and historical
documentation versions on their declared surfaces. The scan is allowlisted and
does not grep arbitrary prose. It does not require `.git`, inspect historical
tags, or use the network. `--check` calls `checkVersionContract`; `--check-tag`
accepts exactly one supplied tag after the same contract passes.

- [ ] **Step 4: Write release-ready 1.0.27 notes**

Heading:

```markdown
# v1.0.27 - Safe lifecycle and canonical release identity
```

Describe the actual unpublished delta since v1.0.26: complete CI, safe
manifest-owned lifecycle, canonical release identity, legacy-install migration,
validation, and public exclusions. Never claim remote availability or an
already-created tag/release.

- [ ] **Step 5: Integrate package and fast checks**

Add `"check:version": "node scripts/version.mjs --check"`. Invoke it once from
the fast contractual path. Require the module, test, and current release note in
`scripts/check.sh`. Leave `unit-and-script-tests` unchanged because its glob
already includes the new test.

- [ ] **Step 6: Add the V-ID meta-test**

Read both test files and assert the extracted list is exactly `V001–V027`, once
each. Retain a separate S-ID verification at final validation.

- [ ] **Step 7: Verify GREEN**

```bash
node --test scripts/version.test.mjs
npm run check:version
npm run check:quick
```

Expected: PASS.

### Task 8: Tag-aware CI without publication

**Files:**
- Modify: `.github/workflows/check.yml:3-41`
- Modify: `scripts/version.test.mjs`

- [ ] **Step 1: Extend `[V010]`/`[V011]` with RED workflow assertions**

Assert tag pushes matching `v*`; a tag-only `--check-tag` step receiving
`GITHUB_REF_NAME`; preserved PR/master triggers and differentiated CI steps; no
tag/release creation, push command, or write permission.

- [ ] **Step 2: Verify RED**

Run `node --test --test-name-pattern='V010|V011' scripts/version.test.mjs`.
Expected: FAIL on current branch-only workflow.

- [ ] **Step 3: Add tag trigger and validation**

Keep:

```yaml
push:
  branches:
    - master
  tags:
    - "v*"
```

After Node setup, add a step guarded by
`startsWith(github.ref, 'refs/tags/')` that passes only `GITHUB_REF_NAME` to
`--check-tag`. Preserve contract, unit/script, `npm ci`, audit, typecheck, and
smoke as separate steps. Add no write permission or release action.

- [ ] **Step 4: Simulate correct and incorrect tags**

```bash
node scripts/version.mjs --check-tag v1.0.27
node scripts/version.mjs --check-tag v1.0.26
```

Expected: first zero; second exit two with concise mismatch. Record the second
as expected failure-path evidence.

- [ ] **Step 5: Verify GREEN workflow tests**

Run the focused V010/V011 command. Expected: PASS.

### Task 9: Smoke lifecycle and public documentation

**Files:**
- Modify: `scripts/install-smoke.sh:18-54`
- Modify: `README.md:320-390,535-555,740-765`
- Modify: `docs/installation.md`
- Modify: `docs/quickstart.md:60-70`

- [ ] **Step 1: Extend smoke assertions**

After install, use Node rather than `jq` to assert the active manifest and both
manifest snapshots inside `.oak/rollback/transaction.json` contain the expected
`kit_version` values. Assert all wrapper version lines. After
uninstall/rollback, assert the restored manifest still contains 1.0.27 and final
doctor succeeds.

- [ ] **Step 2: Run smoke before docs**

Run `npm run installation-smoke`. Expected: `installation smoke ok`. Fix only
Slice 1.3 lifecycle regressions.

- [ ] **Step 3: Update installation docs**

Document `kit_version` versus `schema_version`, version commands, six doctor
states/null semantics, higher/equal/lower upgrade rules, same-version payload
blocker, experimental manifest repair, and legacy dry-run/force migration. Do
not authorize automatic `.oak` deletion; require backup and exact-path review.

- [ ] **Step 4: Update README and quickstart**

Keep the dynamic latest-release badge. Add canonical/version-check commands,
manual tag validation, and explicit publication boundary. Do not claim 1.0.27
is remotely available.

- [ ] **Step 5: Validate documentation boundary**

Run `npm run check:quick`, `git diff --check`, and `bash scripts/check.sh`.
Expected: PASS and no public leak findings.

### Task 10: Full verification, independent review, and local consolidation

**Files:**
- Verify every intended file above.
- Do not touch private config.

- [ ] **Step 1: Run focused suites and exact ID checks**

```bash
node --test scripts/version.test.mjs
node --test scripts/manage-installation.test.mjs
node -e 'const fs=require("fs");const files=["scripts/version.test.mjs","scripts/manage-installation.test.mjs"];const text=files.map(f=>fs.readFileSync(f,"utf8")).join("\n");for(const prefix of ["S","V"]){const end=prefix==="S"?136:27;const re=new RegExp(`\\[${prefix}(\\d{3})\\]`,"g");const ids=[...text.matchAll(re)].map(m=>m[1]);const counts=new Map();for(const id of ids)counts.set(id,(counts.get(id)||0)+1);const bad=[];for(let i=1;i<=end;i++){const id=String(i).padStart(3,"0");if(counts.get(id)!==1)bad.push([`${prefix}${id}`,counts.get(id)||0]);}if(ids.length!==end||bad.length){console.error({prefix,count:ids.length,bad});process.exit(1);}}console.log("scenario ids unique");'
```

Expected: both suites pass; exactly 136 S IDs and 27 V IDs.

- [ ] **Step 2: Run complete release readiness**

```bash
npm run check:version
npm run check
node scripts/version.mjs --check-tag v1.0.27
set +e
node scripts/version.mjs --check-tag v1.0.26
mismatch_status=$?
set -e
test "$mismatch_status" -eq 2
npm run check:release
bash -n install.sh upgrade.sh doctor.sh uninstall.sh rollback.sh scripts/check.sh scripts/install-smoke.sh
git diff --check
```

Expected: the matching tag passes; the mismatched tag exits exactly two and the
explicit status assertion passes; every remaining command passes. Audit may
report the known three low transitive
vulnerabilities while passing the configured moderate threshold; do not force a
breaking dependency change in this slice.

- [ ] **Step 3: Inspect exact scope and public leak boundary**

Apply `opencode-public-sync`: inspect `git diff --stat`, `git status --short`,
and the intended public diff for private paths, providers/MCPs, credentials, raw
evidence, endpoints, or machine identifiers. Explain intentional generic docs
hits; remove every unintended hit.

- [ ] **Step 4: Request one independent implementation review**

Provide the approved spec, this plan, full diff, and evidence. Require explicit
review of canonical-source non-duplication; invalid-manifest doctor fail-closed
behavior; version-only digest/recovery integrity; blockers before writes;
mutation-free wrapper output; tag CI without publication; and leak safety.

Fix only Critical/Important Slice 1.3 findings, rerun focused/full checks, and
repeat review once. Surface a third blocked loop to the user.

- [ ] **Step 5: Consolidate locally after review passes**

Stage each intended file explicitly—never `.` or `-A`—and create one local
public commit:

The exact staged set includes the approved Slice 1.3 spec and this reviewed plan
alongside every implementation, test, workflow, release-note, smoke, and public
documentation file listed in the responsibility map. They are intentional
public artifacts, not leftovers. Do not stage ignored `.DS_Store` or any file
outside that enumerated set.

```bash
git commit -m "feat: add canonical version and release contract"
```

Verify the public branch is clean and ahead of origin. Do not push, tag, create
a GitHub Release, or publish npm.

## Final handoff evidence

Report:

- canonical version and exact version output;
- local public commit hash and unchanged private checkout;
- focused/full test counts and scenario-ID uniqueness;
- matching tag success plus expected mismatch evidence;
- independent-review verdict and audit residuals;
- explicit confirmation that no push, tag, GitHub Release, or npm publication
  occurred;
- next recommendation: Slice 1.4 compatibility matrix, only after separate
  approval.
