# Installation lifecycle

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

## Upgrade and conflicts

`upgrade` requires a valid manifest. It may add new files, update unchanged owned files, remove unchanged obsolete owned files, and remove obsolete preserved metadata without touching user bytes.

The complete upgrade aborts before mutation for:

- modified or missing owned files;
- modified obsolete owned files;
- unowned collisions;
- unsafe paths, symlinks, or file/directory collisions;
- invalid manifest, journal, lock, or rollback state;
- a post-lock fingerprint change.

Preserved user changes and pending protected-file merges are warnings, not authorization to overwrite those paths.

## Doctor and preserved merge acknowledgement

Ordinary `doctor` is lock-free and read-only. Exit codes are:

- `0`: healthy managed installation; stable preservation and user-only preserved evolution are allowed;
- `1`: actionable state such as owned drift, a pending merge, obsolete preserved metadata, stale lock, interrupted transaction, rollback conflict, or cleanup residue;
- `2`: invalid invocation, corrupt/unknown state, unsafe path/symlink, structural collision, or a filesystem error that prevents safe analysis.

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

## After installation

```bash
(cd "${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}" && npm install)
opencode auth login
opencode models openai --refresh
```

If a protected `opencode.json` or `tui.json` was preserved, merge the relevant plugin entries manually and use `doctor --accept-preserved` only after reviewing the complete tuple.
