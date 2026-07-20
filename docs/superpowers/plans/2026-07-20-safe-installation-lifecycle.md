# Safe Installation Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the copy/delete installers with a dependency-free, manifest-owned, dry-run-first installation manager supporting safe install, upgrade, doctor, uninstall, committed rollback, and interrupted-operation recovery.

**Architecture:** Keep all ownership, planning, validation, journaling, locking, durability, and recovery rules in one importable Node.js engine at `scripts/manage-installation.mjs`. Root shell scripts are executable argument-forwarding wrappers only. A single `node:test` suite drives the engine through injected clock, transaction ID, PID probe, failpoint, filesystem, and I/O seams, while smoke tests exercise the public wrappers against real temporary directories.

**Tech Stack:** Node.js 24 ESM, built-in `node:test`, `node:assert/strict`, `node:fs`, `node:crypto`, `node:path`, Bash wrappers, JSON state under `.oak/`, existing npm/CI scripts.

---

## Execution prerequisites and safety gate

The current public working tree contains approved but uncommitted Slice 1.1 changes plus the Slice 1.2 spec and this plan. Do not start implementation by staging whole shared files or by creating a worktree from `HEAD`, because either action can omit or accidentally bundle approved work.

- [ ] Obtain explicit approval for how the current Slice 1.1/spec/plan baseline will be committed or otherwise transferred.
- [ ] Create a dedicated `codex/` implementation branch and worktree from that approved baseline using `superpowers:using-git-worktrees`.
- [ ] Confirm the implementation worktree starts with `git status --short --branch` showing no unrelated changes.
- [ ] Re-run `npm run check` and expect `102` existing tests passing before adding manager tests.
- [ ] Keep the developer's live OpenCode configuration read-only throughout implementation; every lifecycle test uses a bounded temporary target.

## File map

**Create**

- `scripts/manage-installation.mjs` — the only lifecycle engine and CLI dispatcher; exports pure validation/planning helpers plus an injected manager factory.
- `scripts/manage-installation.test.mjs` — scenarios `[S001]` through `[S136]`, unit fixtures, failpoints, and focused wrapper contracts.
- `upgrade.sh` — forwards to engine command `upgrade`.
- `doctor.sh` — forwards to `doctor`, including `--accept-preserved`.
- `rollback.sh` — forwards to engine command `rollback`.

**Replace with thin wrappers**

- `install.sh` — forwards to engine command `install`.
- `uninstall.sh` — forwards to engine command `uninstall`.

**Modify**

- `scripts/check.sh` — require the engine, tests, five wrappers, and executable modes.
- `scripts/install-smoke.sh` — run the complete clean-target lifecycle and validate the installed harness.
- `package.json` — include `scripts/*.test.mjs` in `unit-and-script-tests`.
- `README.md` — document dry-run, ownership, conflicts, protected files, doctor, uninstall, rollback, and recovery.
- `docs/installation.md` — detailed command and recovery reference.

**Verify, but normally do not modify**

- `.github/workflows/check.yml` — the existing `npm run unit-and-script-tests` and `npm run installation-smoke` steps pick up the new suite through `package.json`.
- `CONTRIBUTING.md` — the existing statement that `npm run check` runs every bundled `node:test` suite remains accurate.
- `docs/superpowers/specs/2026-07-20-safe-installation-lifecycle-design.md` — approved source of truth; no implementation edits unless a genuine contradiction is discovered and returned to the user.

## Engine contract to preserve across tasks

Implement these named exports in `scripts/manage-installation.mjs` so tests do not shell out for engine behavior:

```js
export const SCHEMA_VERSION = 1;
export const PROTECTED_ROOT_FILES = [
  "AGENTS.md",
  "opencode.json",
  "package.json",
  "package-lock.json",
  "tui.json",
];

export function canonicalManifestBytes(manifest) {}
export function validateManifest(manifest) {}
export function validateTransaction(transaction) {}
export function inventorySource(sourceRoot, deps) {}
export function inspectInstallation({ sourceRoot, targetRoot, deps }) {}
export function buildPlan({ command, inspection, options }) {}
export function createInstallationManager(options) {}
export async function main(argv, options = {}) {}
```

`createInstallationManager` accepts explicit dependencies rather than secret flags:

```js
{
  sourceRoot,
  clock: () => new Date(),
  transactionId: () => crypto.randomUUID(),
  pidProbe: (pid) => process.kill(pid, 0),
  failpoint: () => {},
  fsOps: realFsOps,
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
}
```

The production CLI calls the same exported manager used by tests. `fsOps` exists only to inject low-level failures and delegates to real `node:fs` operations by default; no public environment switch selects a test implementation.

Use scenario-prefixed names in the test suite:

```js
test("[S001] clean install dry-run performs zero writes", async () => {
  // fixture, action, exact assertions
});
```

This makes the final scenario-coverage check mechanical.

### Task 1: Test fixture, CLI skeleton, and target resolution

**Files:**
- Create: `scripts/manage-installation.test.mjs`
- Create: `scripts/manage-installation.mjs`

- [ ] **Step 1: Add fixture helpers and the first failing CLI tests**

Create helpers using `fs.mkdtempSync`, never caller-owned paths:

```js
function makeFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oak-manager-test-"));
  const sourceRoot = path.join(root, "repo", "opencode");
  const targetRoot = path.join(root, "target");
  fs.mkdirSync(sourceRoot, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, sourceRoot, targetRoot };
}

function deterministicDeps(overrides = {}) {
  return {
    clock: () => new Date("2026-07-20T00:00:00.000Z"),
    transactionId: () => "tx-0001",
    pidProbe: () => ({ alive: false, code: "ESRCH" }),
    failpoint: () => {},
    ...overrides,
  };
}
```

Add focused tests for target precedence, missing `HOME`, empty environment values, `--help`, unknown flags, missing flag values, and command/flag compatibility from scenario `20`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
node --test --test-name-pattern='S020|target precedence|unknown flag' scripts/manage-installation.test.mjs
```

Expected: FAIL because `main` and argument parsing are not implemented.

- [ ] **Step 3: Implement the minimal CLI dispatcher and target resolver**

Implement strict parsing for `install`, `upgrade`, `doctor`, `uninstall`, and `rollback`. Apply `--target` > non-empty `OPENCODE_CONFIG_DIR` > `$HOME/.config/opencode`; never expand `~`. Return structured exit codes from `main` and set `process.exitCode` only in the executable entrypoint.

- [ ] **Step 4: Re-run the focused tests and verify GREEN**

Run the command from Step 2.

Expected: PASS; no filesystem lifecycle behavior exists yet.

- [ ] **Step 5: Commit the skeleton**

```bash
git add scripts/manage-installation.mjs scripts/manage-installation.test.mjs
git commit -m "feat: scaffold installation manager CLI"
```

### Task 2: Source inventory, reserved namespace, modes, and path safety

**Files:**
- Modify: `scripts/manage-installation.mjs`
- Modify: `scripts/manage-installation.test.mjs`

- [ ] **Step 1: Add failing inventory and path-safety scenarios**

Add scenarios `19`, `25-28`, `33`, `36-38`, `46`, `61-67`, and `81-89`. Fixtures must cover source/target symlinks, file-directory collisions, `.oak` as file/directory/symlink/payload path, repository/payload target equality and ancestor/descendant relationships, `..`, case-equivalent paths where supported, invalid modes, and unknown operation kinds.

- [ ] **Step 2: Verify the new scenarios fail**

```bash
node --test --test-name-pattern='S019|S02[5-8]|S033|S03[6-8]|S046|S06[1-7]|S08[1-9]' scripts/manage-installation.test.mjs
```

Expected: FAIL on missing inventory/path validators.

- [ ] **Step 3: Implement inventory and safe path primitives**

Implement sorted `lstat`-based traversal without following symlinks. Normalize POSIX relative paths, reject traversal/absolute/control paths and `.oak`, persist `stat.mode & 0o777`, hash regular-file bytes with SHA-256, and compare resolved target/repository/payload relationships before any mutation.

Keep helpers narrowly named, for example:

```js
function normalizeManagedPath(value) {}
function assertSafeTarget({ targetRoot, repositoryRoot, sourceRoot, fsOps }) {}
function inspectRegularFile(fullPath, fsOps) {}
function inventorySource(sourceRoot, deps) {}
```

- [ ] **Step 4: Run the focused scenarios**

Expected: every selected scenario passes and fixture cleanup removes only its own temporary root.

- [ ] **Step 5: Commit path safety**

```bash
git add scripts/manage-installation.mjs scripts/manage-installation.test.mjs
git commit -m "feat: validate installation paths and source inventory"
```

### Task 3: Canonical manifest and journal schema validation

**Files:**
- Modify: `scripts/manage-installation.mjs`
- Modify: `scripts/manage-installation.test.mjs`

- [ ] **Step 1: Add failing schema tests**

Add scenarios `14`, `40`, `46`, `49`, `60`, `62`, `72-76`, `83`, `85-89`, `95-98`, `124-125`, and `128-136`. Include exact fixtures for valid install/upgrade/accept-preserved/uninstall presence pairs, canonical manifest bytes, null/object digest coupling, acknowledgement shape, status/origin transitions, operation before/after pairs, and backup-root selection.

- [ ] **Step 2: Verify schema tests fail**

```bash
node --test --test-name-pattern='S014|S040|S049|S060|S062|S07[2-6]|S08[3-9]|S09[5-8]|S12[4-9]|S13[0-6]' scripts/manage-installation.test.mjs
```

Expected: FAIL because validators and canonical serializer are incomplete.

- [ ] **Step 3: Implement canonical manifest bytes**

Serialize recursively sorted object keys with no insignificant whitespace, schema-sorted arrays, UTF-8 without BOM, and exactly one final LF. Use the same bytes for writing and hashing:

```js
export function canonicalManifestBytes(manifest) {
  const normalized = canonicalizeManifest(manifest);
  return Buffer.from(`${JSON.stringify(normalized)}\n`, "utf8");
}
```

Do not use plain `JSON.stringify` elsewhere for persisted manifest bytes.

- [ ] **Step 4: Implement strict manifest and transaction validators**

Validate complete manifests, stable preservation reasons, nullable/full `merge_acknowledgement`, `.oak` exclusions, sorted unique paths, manifest presence/digest pairs, command-specific pairs, lock identity, status/origin transitions, completed indexes, operation kinds, nullable `backup_path`, and root selection.

Return validated immutable data or throw a typed manager error carrying exit code `2`; never repair invalid state.

- [ ] **Step 5: Run schema tests and verify GREEN**

Run the Step 2 command, then:

```bash
node --test --test-name-pattern='S128|S129|S130|S134|S135|S136' scripts/manage-installation.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit schema contracts**

```bash
git add scripts/manage-installation.mjs scripts/manage-installation.test.mjs
git commit -m "feat: validate installation manifests and journals"
```

### Task 4: Inspection, ownership classification, and pure planning

**Files:**
- Modify: `scripts/manage-installation.mjs`
- Modify: `scripts/manage-installation.test.mjs`

- [ ] **Step 1: Add failing classification and dry-run scenarios**

Add scenarios `1-5`, `7-10`, `21-24`, `41-42`, `52`, `56-57`, `68`, `70`, `80`, `92`, `103-104`, `108-109`, `118-121`, `126-127`. Assert structured plans, sorted paths, reasons, fingerprints, blockers, warnings, exact ownership, and zero filesystem writes for dry-run.

- [ ] **Step 2: Verify planning is RED**

```bash
node --test --test-name-pattern='S00[1-5]|S00[7-9]|S010|S02[1-4]|S04[1-2]|S052|S05[6-7]|S068|S070|S080|S092|S10[3-4]|S10[8-9]|S11[8-9]|S12[0-1]|S12[6-7]' scripts/manage-installation.test.mjs
```

Expected: FAIL because classification and plan generation are missing.

- [ ] **Step 3: Implement inspection and classifications**

Produce explicit `owned-unchanged`, `owned-modified`, `owned-missing`, `preserved-user`, `unowned-match`, `unowned-conflict`, `new`, `obsolete-unchanged`, `obsolete-modified`, `obsolete-preserved-present`, and `obsolete-preserved-missing` records. Compute acknowledgement current/historical/absent state independently from preservation reason.

- [ ] **Step 4: Implement pure logical plans**

Return sorted entries with kinds `add`, `update`, `remove`, `adopt`, or `preserve`, exact before/after states, reasons, blockers, warnings, source/manifest/target fingerprint, and full previous/next manifests. Never write from `buildPlan`.

Ensure:

- initial exact matches may `adopt`;
- upgrade exact pre-existing paths stay preserved with `preexisting-exact-match`;
- source-removed preserved entries use logical `preserve` reason `source-removed` and are removed only from the next manifest;
- baseline-only no-op upgrade stays read-only;
- obsolete-preserved cleanup is real manifest work.

- [ ] **Step 5: Run focused planning tests**

Expected: PASS with byte-for-byte unchanged fixture trees for every dry-run/blocker.

- [ ] **Step 6: Commit planning**

```bash
git add scripts/manage-installation.mjs scripts/manage-installation.test.mjs
git commit -m "feat: plan ownership-safe installation changes"
```

### Task 5: Durable state primitives, bootstrap cleanup, and conservative locks

**Files:**
- Modify: `scripts/manage-installation.mjs`
- Modify: `scripts/manage-installation.test.mjs`

- [ ] **Step 1: Add failing durability and lock scenarios**

Add scenarios `15`, `17-18`, `29-32`, `38-39`, `43-44`, `48-51`, `79`, `93-94`. Use injected failpoints before journal creation, after journal creation, after rename, before directory fsync, during bootstrap removal, during rollback-point publication, and during lock-holder refresh.

- [ ] **Step 2: Verify RED**

```bash
node --test --test-name-pattern='S015|S01[7-8]|S02[9]|S03[0-2]|S03[8-9]|S04[3-4]|S04[8-9]|S05[0-1]|S079|S09[3-4]' scripts/manage-installation.test.mjs
```

Expected: FAIL on absent state/lock primitives.

- [ ] **Step 3: Implement restrictive and durable state writes**

Create `.oak` directories as `0700` and files/temporaries as `0600` before writing. Implement complete-write loops, file fsync, atomic same-directory rename, required parent-directory fsync, durable unlink/rmdir, and platform-explicit directory fsync errors.

Call named failpoints at every tested boundary; failpoints are dependency callbacks, never environment variables.

- [ ] **Step 4: Implement bootstrap and lock protocol**

Record `target_created_by_invocation` and `oak_created_by_invocation`, clean only invocation-owned empty directories, and fsync parents after removal. Publish `lock.json` exclusively with transaction ID/PID/command/timestamp. Treat PID success and `EPERM` as alive, `ESRCH` as dead, and all other errors as fail-closed.

- [ ] **Step 5: Run durability tests**

Expected: PASS; every interruption leaves either exact pre-state, a valid recoverable active journal, or post-commit cleanup residue with one active rollback point.

- [ ] **Step 6: Commit durability primitives**

```bash
git add scripts/manage-installation.mjs scripts/manage-installation.test.mjs
git commit -m "feat: add durable installation state and locking"
```

### Task 6: Transaction executor and initial install

**Files:**
- Modify: `scripts/manage-installation.mjs`
- Modify: `scripts/manage-installation.test.mjs`

- [ ] **Step 1: Add failing install/apply scenarios**

Complete scenarios `2-7`, `33`, `36-38`, `43`, `68-70`, and `95`. Assert exact bytes/modes, protected preservation, initial adoption without rewrite, `--force` backup durability, manifest-only install, previous manifest null, and rollback candidate contents.

- [ ] **Step 2: Verify RED**

```bash
node --test --test-name-pattern='S00[2-7]|S033|S03[6-8]|S043|S06[8-9]|S070|S095' scripts/manage-installation.test.mjs
```

- [ ] **Step 3: Implement the generic forward transaction executor**

Translate only logical `add/update/remove` entries into journal operations. Capture required update/remove backups under `rollback.next/files`, write `planned + none`, transition to applying, record each completed index durably, publish/remove the next manifest, materialize the committed candidate, remove the active journal as commit boundary, then clean residue and lock.

`adopt` and `preserve` affect only next manifest. An empty operations array still follows the whole journal/rollback protocol.

- [ ] **Step 4: Implement install policy**

Support clean/pre-existing targets, protected root preservation, exact-match adoption, collision blockers, and initial-only regular-file `--force`. Do not recreate the old sibling timestamp backup directory.

- [ ] **Step 5: Run install scenarios and full suite**

```bash
node --test --test-name-pattern='S00[1-7]|S033|S03[6-8]|S068|S069|S070|S095' scripts/manage-installation.test.mjs
node --test scripts/manage-installation.test.mjs
```

Expected: focused tests pass; remaining unimplemented command scenarios may still fail and should be listed, not weakened.

- [ ] **Step 6: Commit install execution**

```bash
git add scripts/manage-installation.mjs scripts/manage-installation.test.mjs
git commit -m "feat: execute managed installations transactionally"
```

### Task 7: Upgrade and obsolete-preserved cleanup

**Files:**
- Modify: `scripts/manage-installation.mjs`
- Modify: `scripts/manage-installation.test.mjs`

- [ ] **Step 1: Add/finish failing upgrade scenarios**

Cover scenarios `8-10`, `22-24`, `34`, `42`, `53-57`, `92`, `103-109`, `126-127`, and `134`. Assert all-or-nothing blockers, exact-match non-adoption, executable modes, baseline policy, source removal, present/missing obsolete preservation, metadata-only rollback point, and no-op distinction.

- [ ] **Step 2: Verify RED**

```bash
node --test --test-name-pattern='S00[8-9]|S010|S02[2-4]|S034|S042|S05[3-7]|S092|S10[3-9]|S12[6-7]|S134' scripts/manage-installation.test.mjs
```

- [ ] **Step 3: Implement upgrade policy through the generic executor**

Require a valid active manifest. Abort the complete plan on owned/unowned/obsolete blockers. Add/update/remove only safe owned entries. Preserve new exact pre-existing files, keep all preserved paths user-owned, and remove obsolete-preserved metadata via manifest-only ownership work without touching targets.

- [ ] **Step 4: Run focused and install-regression tests**

```bash
node --test --test-name-pattern='S00[1-9]|S010|S02[1-4]|S034|S042|S092|S10[3-9]|S126|S127|S134' scripts/manage-installation.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit upgrade**

```bash
git add scripts/manage-installation.mjs scripts/manage-installation.test.mjs
git commit -m "feat: add conflict-safe managed upgrades"
```

### Task 8: Ordinary doctor and deterministic preserved acknowledgement

**Files:**
- Modify: `scripts/manage-installation.mjs`
- Modify: `scripts/manage-installation.test.mjs`

- [ ] **Step 1: Add/finish failing doctor and ACK scenarios**

Cover scenarios `21-23`, `41`, `52-57`, `78`, `80`, `90-92`, `108`, and `110-127`, plus `135`. Use `Readable.from()` for exact stdin and captured writable streams for canonical output.

Canonical test input must use full lowercase hashes and four-digit octal modes:

```js
const ack = `ACK-PRESERVED opencode.json ${targetHash} 0644 ${sourceHash} 0644\n`;
```

- [ ] **Step 2: Verify RED**

```bash
node --test --test-name-pattern='S02[1-3]|S041|S05[2-7]|S078|S080|S09[0-2]|S108|S11[0-9]|S12[0-7]|S135' scripts/manage-installation.test.mjs
```

- [ ] **Step 3: Implement ordinary doctor**

Keep it lock-free and read-only. Report classifications, locks, transactions, rollback availability, acknowledgement current/historical/absent state, obsolete-preserved cleanup, and exact exit `0/1/2` rules.

- [ ] **Step 4: Implement `doctor --accept-preserved`**

Print the exact ACK line, read one stdin line, strip only LF, compare byte-for-byte, build the global plan, block unrelated owned drift, allow unrelated preserved warnings, acquire lock, rescan tuple/fingerprint, and commit an `accept-preserved` manifest-only transaction. Preserve `reason`; set baselines and complete acknowledgement with injected clock.

- [ ] **Step 5: Run ACK tests**

Expected: `yes`, path-only, truncated hashes, EOF, stale tuples, invalid paths, and owned drift leave final state byte-for-byte unchanged; exact non-TTY stdin commits and is rollbackable.

- [ ] **Step 6: Commit doctor and acknowledgement**

```bash
git add scripts/manage-installation.mjs scripts/manage-installation.test.mjs
git commit -m "feat: diagnose installs and acknowledge preserved merges"
```

### Task 9: Uninstall with user-change preservation

**Files:**
- Modify: `scripts/manage-installation.mjs`
- Modify: `scripts/manage-installation.test.mjs`

- [ ] **Step 1: Add/finish failing uninstall scenarios**

Cover scenarios `11`, `41`, `70-71`, `77`, `96`, `100`, and wrapper confirmation behavior from scenario `20`. Assert only `owned-unchanged` files are removed, modified/missing/preserved/unrelated files survive, directories are removed only when empty, next manifest is null, and `--yes` changes only prompting.

- [ ] **Step 2: Verify RED**

```bash
node --test --test-name-pattern='S011|S041|S07[0-1]|S077|S096|S100' scripts/manage-installation.test.mjs
```

- [ ] **Step 3: Implement uninstall planning and execution**

Use the same executor with a valid previous manifest and null next manifest. Back up every removed owned file durably, preserve all user states, durably unlink `manifest.json`, retain the committed rollback point, and leave `.oak` for rollback.

- [ ] **Step 4: Run uninstall plus upgrade regression tests**

Expected: PASS; no preserved or unrelated bytes are changed.

- [ ] **Step 5: Commit uninstall**

```bash
git add scripts/manage-installation.mjs scripts/manage-installation.test.mjs
git commit -m "feat: uninstall only unchanged owned files"
```

### Task 10: Committed rollback and interrupted-operation recovery

**Files:**
- Modify: `scripts/manage-installation.mjs`
- Modify: `scripts/manage-installation.test.mjs`

- [ ] **Step 1: Add/finish rollback and recovery scenarios**

Cover scenarios `12-16`, `29-30`, `35`, `40`, `44-51`, `58-60`, `69`, `71`, `77-78`, `93`, `99-102`, `107`, `123`, and `131-133`. Include failpoints in forward apply, inverse apply, manifest publication/removal, rollback candidate transition, lock-holder refresh, and post-commit cleanup.

- [ ] **Step 2: Verify RED**

```bash
node --test --test-name-pattern='S01[2-6]|S02[9]|S030|S035|S040|S04[4-9]|S05[0-1]|S05[8-9]|S060|S069|S071|S07[7-8]|S093|S09[9]|S10[0-2]|S107|S123|S13[1-3]' scripts/manage-installation.test.mjs
```

- [ ] **Step 3: Implement interrupted-forward recovery**

Transition `planned|applying + none` to `rolling-back + interrupted-forward`, resolve backups only from `rollback.next`, validate forward/inverse progress and manifest presence/digest by phase, restore only completed work, retain the earlier committed rollback point, and resume idempotently after inverse interruption.

- [ ] **Step 4: Implement committed rollback**

Copy the committed journal to active state as `rolling-back + committed-operation`, publish a matching rollback lock, resolve only `rollback/files`, validate current next-manifest presence/digest and operation after-states, inverse operations, restore previous manifest presence, and consume the committed point only after durable completion.

Adopt/preserve/obsolete cleanup/acknowledgement rollback changes only manifest ownership metadata.

- [ ] **Step 5: Implement cleanup-residue handling**

With no active journal, treat `rollback` as the sole committed point and `rollback.next`/`rollback.previous` as doctor exit-`1` residue. Clean residue only under a valid lock after validating the active point; never select residue for rollback.

- [ ] **Step 6: Run all manager scenarios**

```bash
node --test scripts/manage-installation.test.mjs
```

Expected: all `[S001]` through `[S136]` pass.

- [ ] **Step 7: Verify scenario IDs are complete and unique**

```bash
node - <<'NODE'
const fs = require('fs');
const text = fs.readFileSync('scripts/manage-installation.test.mjs', 'utf8');
const ids = [...text.matchAll(/\[S(\d{3})\]/g)].map((match) => Number(match[1]));
const expected = Array.from({ length: 136 }, (_, index) => index + 1);
const counts = new Map(expected.map((id) => [id, 0]));
for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
const mismatches = [...counts].filter(([, count]) => count !== 1);
if (mismatches.length > 0 || ids.length !== expected.length) {
  throw new Error(`scenario ID occurrence mismatch: ${JSON.stringify(mismatches)}`);
}
console.log('manager scenarios 1-136 present exactly once');
NODE
```

Expected: `manager scenarios 1-136 present exactly once`.

- [ ] **Step 8: Commit rollback and recovery**

```bash
git add scripts/manage-installation.mjs scripts/manage-installation.test.mjs
git commit -m "feat: add durable installation rollback and recovery"
```

### Task 11: Public shell wrappers and repository checks

**Files:**
- Modify: `install.sh`
- Modify: `uninstall.sh`
- Create: `upgrade.sh`
- Create: `doctor.sh`
- Create: `rollback.sh`
- Modify: `scripts/check.sh`
- Modify: `package.json`
- Test: `scripts/manage-installation.test.mjs`

- [ ] **Step 1: Add failing wrapper contract tests**

For each wrapper assert help, unknown arguments, missing values, target precedence, exit propagation, and absence of lifecycle logic. Execute wrappers only for this small contract set.

- [ ] **Step 2: Verify wrapper tests fail**

```bash
node --test --test-name-pattern='wrapper|S020' scripts/manage-installation.test.mjs
```

- [ ] **Step 3: Replace/create thin wrappers**

Each wrapper follows this exact shape, substituting its command:

```bash
#!/usr/bin/env bash
set -euo pipefail

root="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
exec node "$root/scripts/manage-installation.mjs" install "$@"
```

Set all five wrappers executable. No wrapper parses ownership, hashes, manifests, or paths.

- [ ] **Step 4: Update package and repository checks**

Change:

```json
"unit-and-script-tests": "node --test scripts/*.test.mjs opencode/scripts/*.test.mjs"
```

Add the engine, manager test, and wrappers to `required_files` in `scripts/check.sh`; require executable mode for all wrappers and `scripts/check.sh`. Do not require `.mjs` files to be executable.

- [ ] **Step 5: Run wrapper/static checks**

```bash
bash -n install.sh uninstall.sh upgrade.sh doctor.sh rollback.sh scripts/check.sh scripts/install-smoke.sh
npm run contract-check
npm run unit-and-script-tests
```

Expected: shell syntax clean, harness check passes, existing 102 tests plus all manager tests pass.

- [ ] **Step 6: Commit wrappers and checks**

```bash
git add install.sh uninstall.sh upgrade.sh doctor.sh rollback.sh scripts/check.sh package.json scripts/manage-installation.test.mjs
git commit -m "feat: expose managed installation lifecycle commands"
```

### Task 12: Real temporary lifecycle smoke

**Files:**
- Modify: `scripts/install-smoke.sh`

- [ ] **Step 1: Extend the smoke script and verify initial failure**

Use separate source fixtures only when testing upgrade payload changes; never mutate the checked-out `opencode/` tree. The primary smoke sequence is:

```text
install --target TMP/target
doctor --target TMP/target
upgrade --dry-run --target TMP/target
uninstall --yes --target TMP/target
rollback --target TMP/target
doctor --target TMP/target
```

Keep the installed `npm ci`, `check-harness.mjs`, and `@opencode-ai/plugin` import checks.

- [ ] **Step 2: Run smoke before completing assertions**

```bash
npm run installation-smoke
```

Expected: FAIL until the lifecycle assertions and wrapper behavior agree.

- [ ] **Step 3: Finish bounded smoke assertions**

Assert manifest/rollback state at each phase, final restored managed installation, and no files outside the `mktemp` root. Cleanup must validate its explicit root before recursive removal.

- [ ] **Step 4: Run smoke and release-path checks**

```bash
npm run installation-smoke
npm run check
```

Expected: both pass.

- [ ] **Step 5: Commit smoke coverage**

```bash
git add scripts/install-smoke.sh
git commit -m "test: cover complete installation lifecycle smoke"
```

### Task 13: User documentation

**Files:**
- Modify: `README.md:227-371`
- Modify: `README.md:515-600`
- Modify: `docs/installation.md:1-61`

- [ ] **Step 1: Update README lifecycle overview**

Document command examples, dry-run-first workflow, `.oak/manifest.json` ownership, protected-root behavior, exact-match adoption differences between install and upgrade, conflict resolution, `doctor --accept-preserved` ACK input, obsolete-preserved cleanup, uninstall preservation, one-generation rollback, and interrupted recovery.

- [ ] **Step 2: Rewrite the detailed installation guide**

Include exact syntax and exit semantics for all five wrappers, default target precedence, legacy installation handling, `--force` limits, doctor exit `0/1/2`, manifest-only operations, recovery steps, and a warning not to delete `.oak` manually.

- [ ] **Step 3: Check documentation against wrapper help**

```bash
./install.sh --help
./upgrade.sh --help
./doctor.sh --help
./uninstall.sh --help
./rollback.sh --help
```

Expected: documented syntax matches output exactly.

- [ ] **Step 4: Run public leak and whitespace checks**

```bash
git diff --check
bash scripts/check.sh
```

Expected: no whitespace errors, the repository's canonical public-data scan reports no private data, and all harness contracts pass.

- [ ] **Step 5: Commit docs**

```bash
git add README.md docs/installation.md
git commit -m "docs: explain safe installation lifecycle"
```

### Task 14: Full verification and independent reviews

**Files:**
- Review all Slice 1.2 implementation files; modify only to address confirmed findings.

- [ ] **Step 1: Run focused manager tests**

```bash
node --test scripts/manage-installation.test.mjs
```

Expected: scenarios `1-136` pass.

- [ ] **Step 2: Run repository validation**

```bash
npm run check
```

Expected: contract check, existing tests, and manager tests pass.

- [ ] **Step 3: Run release validation**

```bash
npm run check:release
```

Expected: clean dependency install, all tests, typecheck, dependency audit at the existing threshold, and lifecycle smoke pass.

- [ ] **Step 4: Run static safety checks**

```bash
bash -n install.sh uninstall.sh upgrade.sh doctor.sh rollback.sh scripts/check.sh scripts/install-smoke.sh
git diff --check
git status --short
```

Expected: syntax and whitespace clean; status lists only intentional Slice 1.2 changes plus any explicitly preserved baseline files.

- [ ] **Step 5: Prove a blocking conflict performs no writes**

Run the focused scenario for modified-owned upgrade and compare a recursive fixture snapshot before/after.

Expected: target bytes, modes, manifest, journal, rollback state, and directory entries are identical.

- [ ] **Step 6: Run public leak scan**

```bash
bash scripts/check.sh
```

Expected: the repository's canonical public-data scan reports no private data and all harness contracts pass.

- [ ] **Step 7: Request independent implementation review**

Use `superpowers:requesting-code-review`. Ask the reviewer to compare the complete diff against the approved spec, with focus on ownership, destructive-path safety, backup confidentiality, lock recovery, manifest presence/digests, and tests.

- [ ] **Step 8: Address confirmed review findings with focused RED/GREEN tests**

Do not broaden scope or weaken assertions. Re-run Steps 1-6 after every fix batch.

- [ ] **Step 9: Request final diff review**

Require an explicit ready/not-ready verdict and report any validation not run.

- [ ] **Step 10: Prepare the final handoff without publishing**

Report files, commits, tests, smoke evidence, review verdict, residual risks, and working-tree status. Do not push, tag, release, or modify private OpenCode configuration without a separate user request.
