# Installation lifecycle

Prerequisites include Node.js `^22.9.0 || ^24.0.0` and npm. See the
[compatibility matrix](compatibility.md) for supported OpenCode versions,
platform status, exact integration pins, and evidence.

## Test without a global install

```bash
git clone https://github.com/<owner>/opencode-agent-orchestration-kit.git
cd opencode-agent-orchestration-kit
export OPENCODE_CONFIG_DIR="$PWD/opencode"
source env.example
(cd opencode && npm install)
opencode
```

## Target selection

Every lifecycle command resolves its target in the same order:

1. `--target PATH`;
2. a non-empty `OPENCODE_CONFIG_DIR`;
3. `$HOME/.config/opencode`.

An explicitly empty configured value or missing required `HOME` is invalid. Argument values are literal, so `~` is not shell-expanded by the manager.

## Commands

```text
./install.sh [--dry-run] [--force] [--target PATH]
./upgrade.sh [--dry-run] [--target PATH]
./doctor.sh [--accept-preserved PATH] [--target PATH]
./uninstall.sh [--dry-run] [--yes] [--target PATH]
./rollback.sh [--dry-run] [--target PATH]
```

Each wrapper also accepts `--version` by itself. It prints the same identity as
`node scripts/version.mjs`; combining `--version` with another argument is an
invalid invocation.

Start mutating workflows with the corresponding `--dry-run`. A preview computes the complete plan and performs zero writes: it creates no target, `.oak`, lock, manifest, journal, or backup. Apply recomputes the plan after acquiring the lock; a changed fingerprint aborts.

## Ownership and protected files

Managed state is stored under `TARGET/.oak/`. `manifest.json` lists only kit-owned files and source-overlapping files deliberately preserved as user-owned. Arbitrary target files and `node_modules` are never claimed.

These pre-existing root files remain user-owned by default when they differ:

```text
AGENTS.md
opencode.json
tui.json
package.json
package-lock.json
```

An exact initial match may be adopted without rewriting. A differing protected file is preserved with source and user baselines so `doctor` can report later changes. A legacy install with no manifest is treated as an initial install.

Initial `install --force` is narrow overwrite authorization for colliding regular files. It first stores exact bytes and modes in the rollback point. It cannot replace directories or symlinks, traverse unsafe paths, overwrite `.oak`, bypass locks/corrupt state, force an upgrade, or delete a user-modified file.

## Version identity

The root `package.json` is the only editable kit-version source. `kit_version`
in a manifest identifies the kit release whose payload and ownership state it
describes. `schema_version` identifies the manifest format; the two values are
independent. Every complete previous or next manifest snapshot records a
canonical stable `kit_version`.

Use these read-only checks from the repository root:

```bash
node scripts/version.mjs
npm run check:version
node scripts/version.mjs --check-tag v1.0.28
```

The tag check validates only the supplied value. It does not inspect the
network, create a tag, or publish a release.

## Upgrade and conflicts

`upgrade` requires a valid manifest. It may add new files, update unchanged owned files, remove unchanged obsolete owned files, and remove obsolete preserved metadata without touching user bytes.

The complete upgrade aborts before mutation for:

- modified or missing owned files;
- modified obsolete owned files;
- unowned collisions;
- unsafe paths, symlinks, or file/directory collisions;
- invalid manifest, journal, lock, or rollback state;
- a post-lock fingerprint change.

Version comparison is an additional pre-lock gate:

- source greater than installed: normal upgrade planning continues, including
  a manifest-only version transition when the payload is unchanged;
- equal version and equal payload: no-op;
- equal version and different payload: the complete upgrade is blocked with
  `same-version-different-payload`;
- source lower than installed: the complete upgrade is blocked with
  `source-older`; arbitrary downgrade is unsupported.

Preserved user changes and pending protected-file merges are warnings, not authorization to overwrite those paths.

## Doctor and preserved merge acknowledgement

Ordinary `doctor` is lock-free and read-only. Exit codes are:

- `0`: healthy managed installation; stable preservation and user-only preserved evolution are allowed;
- `1`: actionable state such as owned drift, a pending merge, obsolete preserved metadata, stale lock, interrupted transaction, rollback conflict, or cleanup residue;
- `2`: invalid invocation, corrupt/unknown state, unsafe path/symlink, structural collision, or a filesystem error that prevents safe analysis.

Its structured report adds `sourceVersion`, `installedVersion`, and
`versionState`. The state is exactly one of:

- `not-installed`: manifest absent;
- `current`: version and payload match;
- `upgrade-available`: the local source checkout is newer;
- `source-older`: the local source checkout is older;
- `same-version-different-payload`: release identity contradicts payload;
- `invalid-version-state`: a present manifest or canonical source version is
  invalid.

`sourceVersion` is null only when the source identity is invalid.
`installedVersion` is null when the manifest is absent or cannot supply a valid
version. A present invalid manifest is never reported as `not-installed`.
Version state does not hide ownership drift, preserved-file warnings, locks,
transactions, rollback conflicts, or cleanup residue.

To record that one preserved file has been manually merged:

```bash
./doctor.sh --accept-preserved opencode.json
```

The command displays:

```text
ACK-PRESERVED <path> <target-sha256> <target-mode> <source-sha256> <source-mode>
```

Paste that exact line to stdin. Hashes are full lowercase SHA-256 values; modes are four octal digits. `yes`, the path alone, partial values, EOF, or any stale tuple cancels without persistent mutation. A valid acknowledgement updates only manifest baselines and acknowledgement metadata; it never changes file bytes, mode, ownership, or preservation reason. It is rollbackable.

## Uninstall

`uninstall` plans before prompting. It removes only `owned-unchanged` files and proven-empty directories. Modified, missing, preserved, and unrelated user files survive. `--yes` skips the confirmation only; it changes no ownership rule. The active manifest is removed after the planned file removals commit, while `.oak/rollback/` remains for one rollback.

## Rollback and interrupted recovery

`rollback` validates the current manifest presence/digest and every operation after-state before inverse writes. It restores exact previous bytes and modes, or only manifest ownership metadata for adoption, preservation, acknowledgement, and obsolete-preserved cleanup. A later user edit blocks rollback.

When `.oak/transaction.json` records an interrupted forward operation or rollback, `rollback` resumes its deterministic recovery instead of selecting another point. Backups for interrupted forward recovery are resolved only below `rollback.next/`; committed rollback uses only `rollback/`. A stale lock is replaced only when it matches the recoverable journal and its PID is no longer alive.

The manager retains one committed rollback generation. Post-commit `rollback.next/` or `rollback.previous/` directories are cleanup residue, never additional rollback choices.

Do not delete or edit `.oak` manually. Rollback backups may contain exact prior configuration bytes, including sensitive values, and are created with restrictive permissions.

An unpublished experimental manifest with `schema_version: 1` but no
`kit_version` has no automatic migration: `doctor` reports invalid state and
mutations fail closed. A developer repairing that experimental state must first
back up the complete target, inspect the exact `.oak` path and its recovery
artifacts, and only then explicitly remove that experimental `.oak` state and
reinstall. Never authorize broad deletion or invent a version for an invalid
manifest.

An older installation with no ownership manifest follows the normal initial
install path: run `install --dry-run`, review every collision, back up the
target, and use `install --force` only for exact regular-file replacements that
you intentionally want the kit to own.

## After installation

```bash
(cd "${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}" && npm install)
opencode auth login
opencode models openai --refresh
```

If a protected `opencode.json` or `tui.json` was preserved, merge the relevant plugin entries manually and use `doctor --accept-preserved` only after reviewing the complete tuple.
