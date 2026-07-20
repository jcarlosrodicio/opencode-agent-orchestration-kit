# Safe Installation Lifecycle Design

## Status

Revised design awaiting explicit approval before implementation planning.

## Problem

The current installer copies directory contents directly into an OpenCode
configuration. It preserves a small set of existing root files, but it
overwrites colliding files under managed directories. The uninstaller relies on
a manually maintained list, deletes listed files even after user modification,
and leaves most currently shipped files behind.

The measured baseline is:

- a pre-existing `agents/lead.md` is overwritten during install;
- a subsequently modified owned file is deleted during uninstall;
- the shipped payload contains 185 files while the uninstall list contains 30;
- 155 shipped files remain after uninstall;
- neither install nor uninstall supports `--dry-run`;
- there is no upgrade, doctor, ownership manifest, or rollback mechanism.

## Goals

1. Track which files the kit owns without claiming unrelated user files.
2. Make every mutation plan inspectable before it is applied.
3. Prevent an upgrade from writing anything when a blocking conflict or
   unexplained drift exists on managed files.
4. Preserve user modifications during uninstall.
5. Support clean install, managed upgrade, diagnosis, uninstall, and one-step
   rollback with synthetic, reproducible tests.
6. Detect interrupted, corrupt, or concurrent operations mechanically.
7. Keep the implementation local, dependency-free, auditable, and portable
   across supported macOS and Linux environments.

## Non-goals

- A general-purpose package manager or remote control plane.
- The future `oak` CLI proposed for roadmap Slice 3.2.
- Canonical kit version identity, release-note binding, or migrations keyed by
  kit version; those belong to Slice 1.3.
- A full compatibility matrix or Windows support declaration; those belong to
  Slice 1.4.
- Multiple rollback generations, automatic background repair, or automatic
  synchronization.
- Automatic merging of user configuration files.

## Chosen approach

Use one dependency-free Node.js engine at `scripts/manage-installation.mjs`.
Small shell wrappers keep the current repository interface and expose one
operation each:

```text
install.sh [--dry-run] [--force] [--target PATH]
upgrade.sh [--dry-run] [--target PATH]
doctor.sh [--accept-preserved PATH] [--target PATH]
uninstall.sh [--dry-run] [--yes] [--target PATH]
rollback.sh [--dry-run] [--target PATH]
```

The wrappers contain no ownership or mutation logic. They resolve the repository
root and invoke the Node engine with the corresponding command.

Target resolution is identical for every wrapper: explicit `--target PATH`
wins, otherwise use a non-empty `OPENCODE_CONFIG_DIR`, otherwise use
`$HOME/.config/opencode`. The command fails if the selected environment value
is empty or if `HOME` is unavailable when needed. Shell-style `~` expansion is
not performed on argument values.

Extending the current Bash implementation was rejected because manifest parsing,
hashing, journaling, recovery, and deterministic tests would be duplicated and
fragile. A committed static payload manifest was rejected because it would
duplicate the source tree and introduce another drift surface before Slice 1.3
defines canonical version identity.

## Source payload

The source payload is the regular files and executable modes below `opencode/`.
The engine walks that directory without following symlinks and builds a sorted
inventory of normalized POSIX-style relative paths. A symlink file or symlink
directory anywhere in the source inventory is rejected; the walk never follows
it.

`.oak` is a reserved namespace and can never be part of the source payload or
the files managed by the kit. Source inventory rejects `.oak` and every
descendant path before normalization can admit it, whether the source entry is
a regular file, directory, symlink, or an equivalent normalized spelling.

Each source entry contains:

```json
{
  "path": "agents/lead.md",
  "sha256": "hex digest",
  "mode": 420
}
```

Paths must be relative, normalized, non-empty, and contain neither `..` nor a
platform root. Duplicate normalized paths are invalid. A persisted source mode
is exactly `stat.mode & 0o777`, represented as an integer from `0o000` through
`0o777`. Executable bits are preserved; the engine must not normalize all
payload files to `0644`.

## Target state layout

Managed state lives below the selected target:

```text
TARGET/.oak/
  manifest.json
  lock.json
  transaction.json
  rollback/
    transaction.json
    files/
```

`manifest.json` is active ownership state. `transaction.json` exists only while
an operation is in progress or needs recovery. `rollback/` stores exactly one
committed rollback point. Transient `rollback.next/` and `rollback.previous/`
directories may exist only while durably replacing that point or recovering the
replacement. Uninstall may leave `.oak/` behind so that the most recent
uninstall can be rolled back.

Structured `.oak/` metadata does not intentionally store credentials,
environment values, tokens, prompts, logs, transcripts, unrelated
configuration, or absolute machine-local paths. Rollback backups are different:
they contain the exact previous bytes of overwritten or removed managed files.
Those bytes may include credentials or private configuration and must be treated
as potentially sensitive.

Required permissions are:

```text
.oak/                         0700
manifest.json                 0600
lock.json                     0600
transaction.json              0600
rollback/                     0700
rollback/transaction.json     0600
rollback/files/*              0600
state temporary files         0600
transient rollback directories 0700
```

State directories and files are created with restrictive permissions before
any sensitive bytes are written; they are not created permissively and fixed
afterward. Backup contents are never printed. Errors, logs, and summaries may
name a relative managed path and operation but never include backed-up bytes.
Backups remain inside the selected target's `.oak/` state and are never copied
to the repository, external logs, or another target.

Public leak scanning applies to repository files and the public diff. It does
not scan or publish the contents of temporary targets created locally to test
rollback, because those targets may intentionally contain synthetic or exact
backup bytes and are deleted by the bounded test cleanup.

## Ownership manifest

The manifest has `schema_version: 1` and is validated strictly before use:

```json
{
  "schema_version": 1,
  "manager": "opencode-agent-orchestration-kit",
  "payload_sha256": "digest of the sorted source inventory",
  "created_at": "ISO-8601 timestamp",
  "updated_at": "ISO-8601 timestamp",
  "last_transaction_id": "opaque local id",
  "owned_files": [
    {
      "path": "agents/lead.md",
      "sha256": "digest of installed bytes",
      "mode": 420
    }
  ],
  "preserved_files": [
    {
      "path": "opencode.json",
      "observed_sha256": "digest of user bytes at the last operation",
      "observed_mode": 420,
      "source_sha256": "source payload digest at the last operation",
      "source_mode": 420,
      "reason": "preexisting-user-file",
      "merge_acknowledgement": {
        "target_sha256": "digest of the acknowledged target bytes",
        "target_mode": 420,
        "source_sha256": "digest of the acknowledged source bytes",
        "source_mode": 420,
        "acknowledged_at": "ISO-8601 timestamp"
      }
    }
  ]
}
```

`owned_files` contains only files written by the kit or safely adopted during
initial install because their bytes and mode already matched the source.
`preserved_files` records only paths that overlapped the source when deliberately
left under user ownership. An entry may remain briefly after a later source
removal solely as obsolete-preserved metadata awaiting upgrade cleanup. It
stores the prior observed user state and prior observed source state so a later
scan can distinguish which side changed. It does not inventory arbitrary files
or `node_modules`.

The validator rejects unknown schema versions, duplicate paths, invalid hashes,
invalid modes outside integer `0o000` through `0o777`, traversal paths, absolute
paths, overlap between owned and preserved paths, and unsorted entries. It
validates `observed_sha256`, `observed_mode`, `source_sha256`, and `source_mode`
for every preserved entry. Neither `owned_files` nor `preserved_files` may
contain `.oak` or a descendant of `.oak`. Preserved reasons are explicit state:
`preexisting-user-file` or `preexisting-exact-match`; unknown values fail
validation. `reason` is stable provenance and never records merge status.

`merge_acknowledgement` is either `null` or a complete object with four valid
hash/mode fields and an ISO-8601 `acknowledged_at` timestamp. Initial
preservation sets it to `null`. Acknowledgement creates or replaces it with the
exact accepted tuple and a timestamp from injectable `clock()`, while leaving
`reason` unchanged. Partial objects, invalid hashes, invalid modes, invalid
timestamps, or unknown fields are invalid. The `accept-preserved` transaction
validator additionally requires the next manifest's baselines to equal the new
acknowledgement tuple and its reason to equal the previous reason. A later
valid manifest may retain that object as historical while its baselines evolve
under the separately allowed policies. The entry remains preserved and
user-owned.

## File classifications

Planning compares source inventory, the validated manifest, and current target
state. Every path present in the source or ownership manifest is classified as
one of:

- `owned-unchanged`: target hash and mode match the manifest;
- `owned-modified`: target exists but differs from the manifest;
- `owned-missing`: manifest owns the path but the target is absent;
- `preserved-user`: a source-overlapping path deliberately not owned;
- `unowned-match`: an existing path exactly matches the source and can be
  adopted without writing;
- `unowned-conflict`: an existing source-overlapping path differs;
- `new`: source path is absent and unowned;
- `obsolete-unchanged`: owned path is absent from the new source and still
  matches the manifest;
- `obsolete-modified`: obsolete owned path differs from the manifest;
- `obsolete-preserved-present`: a path remains in `preserved_files`, is absent
  from the current source, and still exists in the target;
- `obsolete-preserved-missing`: a path remains in `preserved_files`, is absent
  from both the current source and target.

Arbitrary target files that overlap neither a source path nor an ownership
manifest entry are user-owned and never included in a mutation plan.

For a `preserved-user` entry, planning compares current target bytes/mode with
`observed_sha256`/`observed_mode`, and current source bytes/mode with
`source_sha256`/`source_mode`. It distinguishes:

- user unchanged + source unchanged: stable preserved state;
- user changed + source unchanged: known user-owned evolution;
- user unchanged + source changed: manual merge pending;
- user changed + source changed: manual merge pending on both sides;
- preserved path missing: actionable missing preserved state.

The last state applies only while the source still contains the path. When the
source no longer contains it, the entry is `obsolete-preserved-present` or
`obsolete-preserved-missing`; there is no current source baseline to merge or
acknowledge.

A source-changed preserved entry remains merge-pending until target bytes and
mode exactly match the current source or the user explicitly acknowledges the
current customized merge through the administrative operation below. The
manager never guesses that an arbitrary custom edit completed a merge. Ordinary
doctor is read-only and never refreshes either baseline. A real upgrade that
already has payload or ownership work to commit may refresh the observed user
baseline when only the user changed, and may refresh both baselines when target
and current source match exactly. A no-op upgrade never creates an implicit
manifest-only transaction merely to refresh preserved baselines.

An acknowledgement record is current only when its four hash/mode values match
the current target/source tuple and the stored baselines. It is historical when
either current side later changes, and it may remain as audit history. No
acknowledgement, a current acknowledgement, and a historical acknowledgement
are distinct reportable states. Health and merge classification derive from
current state versus the baselines, never merely from the object's presence.

## Obsolete preserved paths

An obsolete preserved path remains user-owned and is never treated as owned,
deleted, modified, backed up, recreated, or merged. It creates no journaled
filesystem operation. Before cleanup, ordinary doctor reports that the kit no
longer distributes the path and returns exit `1` because ownership metadata
cleanup is pending; it does not report owned drift or offer
`--accept-preserved` without a current source file.

A real upgrade removes each obsolete entry from `preserved_files`, does not add
it to `owned_files`, and represents the decision only between
`previous_manifest` and `next_manifest`, using a logical `preserve` plan entry
with plan reason `source-removed`; that reason is not written as preserved-file
provenance. This is real ownership work, so one or more obsolete preserved
entries are sufficient for a manifest-only upgrade even when no payload file
changes. That exception does not authorize a transaction whose only purpose is
to refresh an unacknowledged preserved baseline.

Rollback of this manifest-only upgrade restores the previous preserved entry
and its metadata without deleting a present user file or recreating a missing
one.

## Acknowledging a preserved manual merge

The single interface for recognizing a completed manual merge is:

```text
doctor --accept-preserved PATH [--target PATH]
```

This is an explicit administrative mutation mode of the existing diagnostic
wrapper; ordinary `doctor` remains read-only. A separate wrapper is unnecessary,
and coupling acknowledgement to `upgrade` would make an ordinary upgrade carry
unrelated user authorization.

The argument is exactly one normalized manifest-relative path. Globs,
directories, repeated options, broad patterns, and paths containing control
characters that cannot be represented safely on one line are rejected. The
target and current source must both exist as safe regular files. The command
displays classification, full hashes, modes, and one canonical authorization
line:

```text
ACK-PRESERVED <path> <target-sha256> <target-mode-octal> <source-sha256> <source-mode-octal>
```

Hashes are the full 64 lowercase hexadecimal characters. Modes are exactly four
octal digits from `0000` through `0777`. Single ASCII spaces separate fields;
all other characters, including additional spaces, are significant. The
command reads one line from stdin and removes only its terminating newline. The
result must equal the displayed line byte-for-byte. `yes`, `y`, a path alone,
partial or truncated fields, omitted modes, a tuple from another invocation, or
any other mismatch is not authorization.

The deterministic flow is:

1. Validate invocation, target, manifest, normalized `PATH`, and that the path
   belongs to `preserved_files` and is not obsolete-preserved.
2. Safely read current target/source hashes and modes, display their
   classification and the exact canonical line, and read one stdin line.
3. Return exit `1` without persistent mutation for EOF, cancellation, malformed
   input, or any non-exact line.
4. Build the complete initial plan only after exact confirmation. Block on
   `owned-modified`, `owned-missing`, `unowned-conflict`,
   `obsolete-modified`, corrupt or active transaction state, live or stale
   lock, unsafe symlink, structural path error, or any conflict that prevents a
   reliable rollback point. Unrelated non-blocking warnings on other preserved
   paths may continue.
5. Acquire the exclusive lock, then recompute the source, target, complete
   tuple, fingerprint, and global plan. Any change from the confirmed tuple or
   initial fingerprint returns exit `1` before persistent transaction state.
6. Create a manifest-only `accept-preserved` transaction. Update both stored
   baselines and create or replace `merge_acknowledgement` with the exact tuple
   plus `acknowledged_at` from injectable `clock()`. Keep `reason` unchanged.
7. Commit through the ordinary journal, manifest, rollback-point, durability,
   and commit-boundary protocol.

TTY is not required. Explicit stdin works identically in interactive and
non-interactive environments; being attached to a terminal never implies
acceptance. Tests provide the public canonical line through stdin and need no
private flag.

Exit `0` means acknowledgement committed. Exit `1` covers cancellation, EOF,
malformed or mismatched confirmation, post-confirmation tuple/fingerprint
change, a safe actionable global blocker, or another non-corrupt warning that
prevents apply. Exit `2` covers invalid invocation, non-normalized or
non-preserved or obsolete-preserved path, missing/non-regular target or source,
corrupt manifest or transaction state, unsafe symlink, structural collision, or
a filesystem error that prevents safe analysis or apply. Every exit `1` before
commit leaves zero persistent mutation except
durable cleanup of bootstrap directories created by that invocation.

Target and source need not match each other. Acceptance grants no authorization
for future states, modifies no file bytes or modes, never changes ownership,
and never adds the path to `owned_files`. After acceptance, an unchanged tuple
is stable and compatible with ordinary doctor exit `0`; a later target-only
change is user-only evolution, a later source-only change is merge-pending, and
changes on both sides are merge-pending on both sides. Rollback restores the
prior baselines and prior acknowledgement object or `null`, keeps `reason`, and
does not touch the preserved file.

## Blocking conflicts and non-blocking warnings

Upgrade performs no managed-file or persistent-state mutation when any blocking
conflict exists:

- `owned-modified`;
- `owned-missing`;
- `unowned-conflict`;
- `obsolete-modified`;
- invalid manifest or corrupt state;
- unresolved transaction;
- live lock;
- stale lock during an ordinary mutation;
- unsafe source, target, or state symlink;
- file/directory collision or invalid parent path;
- fingerprint change after lock acquisition.

These conditions are non-blocking warnings and may coexist with safe unrelated
upgrade operations:

- any `preserved-user` path;
- a preserved file modified by its user;
- changed source payload for a preserved file;
- a missing preserved path whose source still exists;
- an obsolete preserved path awaiting ownership-metadata cleanup;
- protected configuration awaiting manual merge;
- an absent optional integration.

Warnings never authorize modification of the warned path. A warning may make
doctor exit `1` as defined below without converting it into an upgrade blocker.

## Protected root files

To preserve compatibility with installations over an existing OpenCode config,
these pre-existing root paths remain user-owned by default:

```text
AGENTS.md
opencode.json
tui.json
package.json
package-lock.json
```

If one exists before initial installation and differs from the source, install
records it as `preserved-user`, leaves it untouched, and prints a merge warning.
During initial install only, an exact byte-and-mode match may be adopted as
owned without rewriting it. `--force` may overwrite a differing protected root
file only during initial install. The flag is explicit overwrite authorization,
and rollback bytes must be durable before replacement.

`--force` is not accepted by upgrade, uninstall, doctor, or rollback.

## Operation plans

Mutating commands first produce a complete in-memory logical plan. Each plan
entry has a kind (`add`, `adopt`, `update`, `remove`, `preserve`), path, before
state, after state, and reason. Plans are sorted by path and include a
fingerprint of all observed source, manifest, and target inputs.

Logical decisions and journaled filesystem operations are distinct. `add`,
`update`, and `remove` mutate managed filesystem bytes and may appear in the
transaction journal. `adopt` and `preserve` change only ownership metadata in
`previous_manifest` and the complete next manifest; they never appear in the
journal `operations` array and never have a backup.

During initial install, `adopt` claims an existing regular file only when its
bytes and mode exactly match the source. It does not rewrite the file and adds
it to `owned_files`. Rollback of an adoption reverts ownership by restoring the
previous manifest; it does not remove or modify the pre-existing file.

`preserve` always leaves a path user-owned and performs no file write. Initial
preservation records it in `preserved_files`; obsolete cleanup with reason
`source-removed` omits the entry from the next manifest while preserving the
user path. Rollback restores the previous manifest without removing, recreating,
or modifying the preserved file. Manual merge acknowledgement is also a
`preserve` metadata decision, not a managed-file mutation.

`--dry-run` renders the plan and exits without creating the target, `.oak/`, a
lock, a manifest, a backup, or any other file. Dry-run is an advisory preview;
it is strongly recommended but is not a persisted approval and is not required
before apply. No preview token is introduced in this slice.

A real invocation computes an initial in-memory plan, acquires the target lock,
and recomputes the plan under that lock. It aborts if the post-lock fingerprint
differs from the same invocation's pre-lock fingerprint. This check prevents a
race inside one invocation; it does not connect a previous dry-run process to a
later apply process.

Human-readable output must state counts and list every conflict or preserved
path. Tests call exported planning functions and assert the structured plan
directly; no public `--json` option is introduced in this slice.

## Install

Initial install supports a clean or pre-existing target.

1. Inventory the source and target without writing.
2. Preserve differing protected root files.
3. Adopt exact source matches.
4. Plan additions for absent source paths.
5. Treat any other unowned collision as a conflict and abort before writes.
6. With explicit `--force`, permit initial-install collisions after capturing
   their original bytes for rollback. The flag itself is the explicit
   authorization; a prior dry-run is recommended and documented but not
   mechanically required.
7. Apply the plan and create schema-1 ownership state.

A legacy installation without `.oak/manifest.json` is treated as an initial
install, not as an upgrade. Exact matches can be adopted. Differing managed
paths remain conflicts and require manual resolution or explicit initial
`--force`. This is the safe migration path for releases predating the manifest.

## Upgrade

Upgrade requires a valid active manifest.

It may:

- add new source paths;
- update `owned-unchanged` paths;
- remove `obsolete-unchanged` paths;
- remove obsolete preserved entries from ownership tracking without touching
  their target paths;
- refresh the manifest and payload digest.

Upgrade never claims an unowned path solely because its bytes happen to match.
When a path is new in the source, absent from the previous manifest, already
exists in the target, and matches the new source exactly in bytes and mode, it
remains user-owned. Upgrade records it as `preserved-user` with reason
`preexisting-exact-match`, does not rewrite it, emits a warning, and continues
other safe operations. If its source changes later, the preserved-file merge
policy applies.

A `preserved-user` path always remains user-owned during upgrade. Upgrade never
overwrites or auto-adopts it, even if the current bytes later match the shipped
source. A user-only change is informational and may refresh the observed user
baseline only when an independently requested, non-empty upgrade commits. A
source change produces a manual-merge warning and keeps the prior baselines
until target and source match exactly during such a real upgrade or the user
runs `doctor --accept-preserved PATH`. Neither case blocks unrelated safe
upgrade operations. A missing preserved path whose source still exists remains
a non-blocking warning and is not recreated; a missing path whose source was
removed follows obsolete-preserved cleanup instead.

It must abort the entire operation before any write if it finds:

- `owned-modified`;
- `owned-missing`;
- `unowned-conflict`;
- `obsolete-modified`;
- invalid or corrupt state;
- any other blocker in Blocking conflicts and non-blocking warnings.

Upgrade deliberately has no partial-success or force mode.

## Target bootstrap and lock acquisition

Lock creation must not weaken the no-write guarantee for an initially invalid
plan:

1. Compute the complete initial plan in memory without creating the target,
   `.oak/`, lock, journal, or backups.
2. If that plan contains a blocking conflict, abort with zero filesystem
   mutation.
3. For a potentially valid apply, create the target and `.oak/` only when
   absent, with their required modes, and record internal booleans equivalent to
   `target_created_by_invocation` and `oak_created_by_invocation`.
4. Generate the transaction ID, acquire the lock through exclusive publication
   with that ID, and recompute the entire plan while holding it.
5. If the fingerprint changed or the post-lock plan now contains a blocker,
   remove and durably unlink the invocation's lock. Remove `.oak/` only when
   `oak_created_by_invocation` is true and it remains empty. Remove the target
   only when `target_created_by_invocation` is true and it remains empty.
6. Cleanup never removes a directory that predated the invocation.
7. Do not create transaction state, rollback state, or backups until the
   post-lock plan is valid.

Creating and then fully cleaning invocation-owned bootstrap directories is not
a managed-file mutation. The observable final state after a post-lock abort must
match the pre-invocation state byte-for-byte. Bootstrap cleanup is durable:
after removing `.oak/`, fsync the target directory; after removing an
invocation-created target, fsync its parent directory. A controlled failure
between `rmdir` and parent-directory fsync must finish or retry that durability
step before surfacing the abort. The internal created-by-invocation flags are
never inferred for pre-existing directories.

## Doctor

Ordinary doctor is read-only and reports:

- manifest presence, schema, and structural validity;
- source payload validity;
- counts and paths by file classification;
- active, stale, or malformed lock state;
- interrupted transaction state;
- rollback availability;
- preserved configuration requiring manual merge;
- obsolete preserved entries awaiting ownership-metadata cleanup.

Exit codes:

- `0`: healthy managed installation with valid manifest and source, no blocking
  drift, no newly pending merge, and preserved files in a known stable state.
  A committed rollback point may be available. A deliberately preserved file
  is compatible with exit `0`; user-only changes with unchanged source are
  informational and remain user-owned.
- `1`: actionable but safely diagnosable state, including a missing preserved
  file whose source still exists, changed source for a preserved file, both
  user and source changed, manual merge pending, obsolete preserved metadata,
  stale lock, recoverable interrupted transaction, missing or modified owned
  file, or rollback conflict.
- `2`: invalid invocation, corrupt JSON, unknown schema, unsafe path or symlink,
  serious file/directory collision, unrecoverable state, or filesystem error
  that prevents safe analysis.

Ordinary doctor never repairs, deletes, or refreshes state. The explicitly
confirmed `--accept-preserved` administrative mode has the narrow manifest-only
mutation semantics defined above and no other repair authority.

## Uninstall

Uninstall requires a valid manifest and plans before prompting.

- Remove only `owned-unchanged` files.
- Preserve and report `owned-modified`, `owned-missing`, all `preserved-user`
  entries, and all unrelated user files.
- Remove directories only when they are empty after file operations.
- Record a rollback transaction and remove the active manifest only after the
  planned removals succeed.
- Leave `.oak/rollback/` so the uninstall can be restored.

User modifications are never deleted, including with `--yes`. `--yes` skips the
interactive confirmation but changes no ownership rule.

## Rollback

Rollback has two explicit modes selected from current state.

### Committed-operation rollback

When there is no active `planned`, `applying`, or `rolling-back` transaction,
only the latest committed install, upgrade, uninstall, or `accept-preserved`
transaction is rollbackable.

Rollback first verifies that current manifest presence matches the committed
transaction's `next_manifest`, and, when present, that its canonical digest
matches `next_manifest_sha256`. It also verifies that every journaled `add`,
`update`, or `remove` path still matches its committed after-state. Any presence,
digest, or managed-filesystem mismatch aborts before writes and lists the
conflict. Logical `adopt` and `preserve` decisions are reverted through the
manifest and do not impose byte/mode preconditions on their user-owned or
pre-existing files because rollback will not mutate those files.

When safe, rollback:

- restores replaced or removed bytes and modes;
- removes files added by the transaction;
- restores the previous active manifest or removes the newly created manifest;
- marks the transaction `rolled-back`;
- retains no second rollback generation.

`rollback --dry-run` is read-only and shows the exact inverse plan.

### Interrupted-operation recovery

When `transaction.json` is `planned`, `applying`, or `rolling-back`, `rollback`
performs or resumes recovery of that active transaction instead of consuming
the latest committed rollback point. It uses the journal's forward and inverse
completed-operation indexes and durable before backups:

- `planned|applying + none` first transitions durably to `rolling-back +
  interrupted-forward`; an existing `rolling-back` journal must already have a
  valid explicit origin;

- forward-completed operations not yet inverse-completed must still match their
  recorded after-state;
- inverse-completed operations must match their recorded before-state;
- uncompleted operations must still match their recorded before-state;
- before a forward manifest write, current presence and digest must match
  `previous_manifest`; after a forward-completed write they must match
  `next_manifest` until its inverse completes; after the inverse they must again
  match `previous_manifest`. Each comparison verifies expected absence as well
  as a present canonical digest;
- any mismatch aborts recovery before further mutation and reports the path;
- safe recovery inverses only completed operations and restores the previous
  manifest state;
- the active journal is atomically marked `rolled-back` and removed after the
  restored state is durable;
- the earlier committed rollback point, if any, remains available and is not
  replaced or consumed.

Recovery is blocked by a live lock. If the journal exists and its recorded PID
is no longer alive, rollback may atomically replace the stale lock with a
recovery lock. `rollback --dry-run` reports the recovery plan without replacing
the stale lock or writing any state.

## Transaction journal schema

Active and committed transaction records use `schema_version: 1` and a minimum
shape equivalent to:

```json
{
  "schema_version": 1,
  "transaction_id": "opaque-id",
  "command": "install",
  "status": "planned",
  "rollback_origin": "none",
  "created_at": "ISO-8601 timestamp",
  "source_payload_sha256": "hex digest",
  "previous_manifest": null,
  "next_manifest": {
    "schema_version": 1,
    "manager": "opencode-agent-orchestration-kit",
    "payload_sha256": "hex digest",
    "created_at": "ISO-8601 timestamp",
    "updated_at": "ISO-8601 timestamp",
    "last_transaction_id": "opaque-id",
    "owned_files": [
      {
        "path": "agents/lead.md",
        "sha256": "hex digest",
        "mode": 420
      }
    ],
    "preserved_files": []
  },
  "previous_manifest_sha256": null,
  "next_manifest_sha256": "hex digest",
  "lock": {
    "transaction_id": "opaque-id",
    "pid": 1234,
    "command": "install",
    "created_at": "ISO-8601 timestamp"
  },
  "operations": [
    {
      "index": 0,
      "kind": "update",
      "path": "agents/lead.md",
      "before_sha256": "hex digest",
      "before_mode": 420,
      "after_sha256": "hex digest",
      "after_mode": 420,
      "backup_path": "files/000000"
    }
  ],
  "completed_operation_indexes": [],
  "rollback_completed_operation_indexes": [],
  "manifest_write_completed": false,
  "rollback_manifest_write_completed": false
}
```

`previous_manifest` and `next_manifest` are each either a complete valid
manifest object or `null`; `{}` never represents absence. Presence and digest
are inseparable: an object requires its matching SHA-256 digest, and `null`
requires a null digest. The validator rejects an object with a null digest,
null with a non-null digest, an empty or incomplete object, a digest mismatch,
and any command-specific presence pair other than:

| Transaction command | Previous | Next |
| --- | --- | --- |
| `install` | `null` | valid manifest |
| `upgrade` | valid manifest | valid manifest |
| `accept-preserved` | valid manifest | valid manifest |
| `uninstall` | valid manifest | `null` |

Both manifests may never be null. Rollback and recovery retain the original
command and presence pair. Rollback of install removes `manifest.json` and
restores expected absence; rollback of uninstall restores the previous
manifest; rollback of upgrade or acknowledgement restores the previous
manifest. Presence is part of state validation: a present manifest when absence
is expected, or an absent manifest when presence is expected, is a blocking
conflict even before digest comparison.

Manifest bytes have one canonical representation used for writing, digesting,
and validation: object keys sorted lexicographically at every level, schema
arrays sorted by their defined path order, no insignificant whitespace, UTF-8
without BOM, and exactly one final LF byte. The SHA-256 covers those exact
bytes. No alternate serialization or digest representation is permitted.

The nested `lock` object is the durable snapshot of the lock holder that last
published journal progress. Its `transaction_id` must equal the top-level
transaction ID. Allowed transaction `command` values are `install`, `upgrade`,
`uninstall`, and `accept-preserved`;
rollback retains the original command and changes transaction status rather
than pretending to be a new forward operation. A lock may additionally record
`rollback` as its command because that field identifies the process holding the
lock, not the transaction being inverted.

`rollback_origin` is mandatory and has exactly three values: `none`,
`interrupted-forward`, and `committed-operation`. It is never inferred solely
from `status`. Allowed status/origin transitions are:

```text
planned + none -> applying + none
planned + none -> rolling-back + interrupted-forward
applying + none -> committed + none
applying + none -> rolling-back + interrupted-forward
committed + none -> rolling-back + committed-operation
rolling-back + interrupted-forward -> rolled-back + interrupted-forward
rolling-back + committed-operation -> rolled-back + committed-operation
```

`committed` is the stored status of
`.oak/rollback/transaction.json`. `planned`, `applying`, and `rolling-back` are
active-journal states. `rolled-back` is terminal and may exist only briefly
while its durable active journal is being cleaned. No other transition or
status/origin combination is valid. A forward recovery explicitly changes
`planned|applying + none` to `rolling-back + interrupted-forward`. Copying a
committed transaction to the active journal explicitly changes `committed +
none` to `rolling-back + committed-operation`. `rolled-back` retains the origin
of the inversion that just completed.

The journal `operations` array contains only managed-filesystem mutations and
permits exactly `add`, `update`, and `remove`. `backup_path` is nullable and has
this strict shape:

| `kind` | Before state | After state | `backup_path` |
| --- | --- | --- | --- |
| `add` | hash and mode both `null` | hash and mode required | `null` |
| `update` | hash and mode required | hash and mode required | required |
| `remove` | hash and mode required | hash and mode both `null` | required |

For example, a valid add operation is:

```json
{
  "index": 0,
  "kind": "add",
  "path": "agents/example.md",
  "before_sha256": null,
  "before_mode": null,
  "after_sha256": "hex digest",
  "after_mode": 420,
  "backup_path": null
}
```

An `add` rollback removes the file only while it matches the recorded
after-state. An `update` rollback restores its durable before-bytes and mode. A
`remove` rollback restores its durable before-bytes and mode. `adopt`,
`preserve`, unknown kinds, a backup on `add`, or a missing backup on `update` or
`remove` are invalid journal state.

The validator checks the schema version; allowed commands, status/origin states
and transitions; lock transaction-ID equality and well-formed
PID/timestamp/command fields; unique, consecutive operation indexes; normalized
managed paths; safe relative backup paths; hashes; modes; completed indexes
that refer to real operations; and the strict operation table above. Hash and
mode are a pair: neither may be null while the other is present. Operation paths
must not be `.oak` or a descendant. Forward `completed_operation_indexes` and
`rollback_completed_operation_indexes` must each contain unique valid indexes;
rollback progress may include only forward-completed operations and must be
consistent with `rolling-back` or `rolled-back` status.
`rollback_manifest_write_completed` may be true only in those rollback statuses
and only after the forward manifest write was completed.

Every non-null `backup_path` is a normalized relative path below `files/`; it
must never be absolute, escape its permitted root, contain `.oak` as a path
component, name a symlink, or represent a managed target path. Resolution is
defined only by the validated status/origin pair:

| Journal state | Permitted backup root |
| --- | --- |
| `planned|applying + none` | `.oak/rollback.next/` |
| `committed + none` | `.oak/rollback/` |
| `rolling-back|rolled-back + interrupted-forward` | `.oak/rollback.next/` |
| `rolling-back|rolled-back + committed-operation` | `.oak/rollback/` |

In particular, `rolling-back` alone never selects a backup root. Recovery fails
closed before mutation when origin, status, backup presence, storage location,
or path validation disagree. No redundant backup-root field is introduced.

### Manifest-only transactions

A transaction may have `"operations": []` when it changes only manifest state.
This includes initial adoption, preservation records, explicit manual-merge
acknowledgement, a permitted preserved baseline refresh during a real upgrade,
obsolete preserved metadata cleanup, and a payload-digest change with no
managed-file mutation. The empty operations array does not bypass transaction
safety: the operation still requires a lock,
complete plan fingerprint, durable journal with complete `previous_manifest`
and `next_manifest` presence values, durable manifest publication or removal,
rollback point, and the same commit boundary as a filesystem transaction. No
per-file backup is created. Rollback validates current manifest presence and
digest, then restores only the previous manifest state; it never mutates adopted
or preserved file bytes or modes.

After successful commit, `.oak/transaction.json` no longer exists. Its committed
form is installed at `.oak/rollback/transaction.json`, with backup bytes under
`.oak/rollback/files/`. A new point is first made durable under
`.oak/rollback.next/`, which remains intact as the interrupted-forward recovery
root until the commit boundary. The previous point is retained as
`.oak/rollback.previous/`; the candidate is durably materialized separately at
`.oak/rollback/` without consuming `rollback.next`. The active journal makes
that candidate non-committed until the journal is durably removed. Only after
that removal may `rollback.next` and `rollback.previous` be cleaned. Failure
before the boundary uses `rollback.next` for forward recovery, discards the
uncommitted candidate, and restores or retains `rollback.previous` as the prior
committed point. The protocol must never declare an operation committed with no
usable rollback point. Transient next/previous directories are resolved by
recovery and do not create additional user-visible rollback generations.

If a crash occurs after commit but before redundant `rollback.previous/` or
`rollback.next/` cleanup, `rollback/` remains the sole active point and the
transient directories are non-active cleanup residue. Doctor reports them as
actionable exit `1`. A later mutation may remove them only after acquiring the
lock, validating the active rollback point, and reaching a blocker-free
post-lock plan; it never selects either residue for user rollback or recovery
when no active journal exists.

## Transaction and interruption recovery

Every real mutation follows this sequence:

1. Acquire an exclusive target lock.
2. Recompute and validate the plan.
3. Capture all before-bytes needed for rollback.
4. Atomically write and durably publish a `planned + none` transaction journal.
5. Atomically change the journal to `applying` and durably publish that state.
6. Apply each file using the durable write/remove protocols below and durably
   record each completed operation index.
7. Atomically and durably publish `next_manifest`, or durably unlink
   `manifest.json` when next is null, and then durably record
   `manifest_write_completed: true`.
8. Keep the forward-recovery backups intact under `rollback.next/`. Move the
   prior committed point to `rollback.previous/`, durably materialize the new
   candidate at `rollback/` with a journal in state `committed + none`, and
   fsync `.oak/` after each directory transition. While the active journal
   exists, this `rollback/` candidate is not user-rollbackable.
9. After the new committed journal and backups are durable at `rollback/`,
   durably remove the active journal. This removal is the commit boundary. Any
   failure before it remains an interrupted operation and retains
   `rollback.previous/` plus the active journal needed for recovery.
10. After commit, durably remove the now-redundant `rollback.previous/` and
    `rollback.next/`. A crash here leaves only cleanup residue and does not
    change which point is active.
11. Durably remove the lock and release the operation.

Writing or replacing any regular managed file uses:

```text
create a same-directory temporary file with restrictive initial permissions
write all bytes
fsync the temporary file
apply the intended source mode
atomically rename to the destination
fsync the parent directory
```

Removing a managed file uses:

```text
make its rollback backup bytes and mode durable
unlink the managed file
fsync the parent directory
```

Manifest, journal, rollback metadata, and ordinary state replacements use a
same-directory `0600` temporary file, complete write, file `fsync`, atomic
rename, and `fsync` of the corresponding `.oak/` directory. State directories
are `0700`. Initial lock acquisition additionally requires exclusive
publication: the implementation may use a same-directory durable temporary plus
an atomic no-replace primitive such as same-filesystem link publication when a
portable no-replace rename is unavailable. Lock removal also fsyncs `.oak/`.

Directory `fsync` behavior is encapsulated in one internal helper. It retries
interruptions and handles macOS/Linux-specific open or sync limitations
explicitly; it must not silently downgrade a failed required directory sync to
success. A filesystem that cannot provide the required durability causes the
operation to fail closed and remain recoverable.

No operation is declared committed until managed files, required manifest
publication or removal, final journal, new rollback point, and all relevant
parent directory entries are durable under this protocol.

The journal records forward and inverse progress separately. A controlled
failure transitions the active journal from `planned|applying + none` to
`rolling-back + interrupted-forward`, resolves backups only below
`.oak/rollback.next/`, durably records each inverse operation, then transitions
to `rolled-back + interrupted-forward`. An abrupt exit may leave
`transaction.json` in `planned`, `applying`, or either valid `rolling-back`
origin; rollback resumes the transition deterministically from its recorded
indexes and origin. All other mutating commands refuse to run until recovery
completes. Doctor reports the exact state.

Committed-operation rollback acquires a lock whose `transaction_id` equals the
committed transaction ID and whose command is `rollback`. It then copies the
committed journal into active `transaction.json`, changes its status to
`rolling-back`, changes `rollback_origin` from `none` to
`committed-operation`, and replaces its nested `lock` snapshot with the exact
current rollback lock fields, all while retaining the committed point. It
resolves backups only below `.oak/rollback/` and removes that committed point
only after every inverse operation and manifest restoration are durable and the
active journal reaches `rolled-back + committed-operation`. Interrupted forward
recovery uses the existing active journal, resolves only
`.oak/rollback.next/` backups, and never consumes the earlier committed rollback
point.

The engine exposes an internal failpoint callback to tests so interruption can
be simulated without production-only environment flags or undocumented CLI
options.

For deterministic tests, the engine also accepts internal injectable
dependencies equivalent to `clock()`, `transactionId()`, and `pidProbe()`.
These, together with `failpoint()`, are module-level dependencies or function
arguments, never public CLI options or secret environment flags. A filesystem
adapter may be introduced only if required to simulate low-level write or fsync
failures; the default implementation always uses the real filesystem path.

## Concurrency

The engine creates `.oak/lock.json` using exclusive creation. The lock records
transaction ID, PID, command, and timestamp. PID liveness is conservative
because operating systems can reuse PIDs: if the recorded PID appears alive,
the engine blocks and does not try to infer whether it is the same process.
The PID probe treats success as apparently alive, `ESRCH` as not alive, and
`EPERM` as potentially alive and therefore blocking. Any other probe error is
reported conservatively and fails closed rather than declaring the PID dead.
Doctor reports that ambiguity. Ordinary install, upgrade, and uninstall never
remove an existing live or stale lock.

A dead-PID lock is reported as stale. Recovery rollback may replace it only when
an interrupted transaction also exists, the recorded PID does not appear alive,
the lock and journal have the same transaction ID, and replacement is atomic
and durable. Before the first replacement, every nested journal lock field must
exactly equal the stale lock. A replacement lock keeps that transaction ID, uses
the recovery PID/timestamp and command `rollback`, and is the only permitted
successor mismatch while the nested snapshot is being updated. The engine must
durably replace the nested journal lock snapshot before applying or recording
another inverse operation. A crash between lock replacement and that journal
update remains recognizable by the shared transaction ID plus the successor's
`rollback` command, so another dead-PID recovery may repeat the same handoff.
Any different mismatch fails closed. A stale lock without a matching
interrupted transaction remains a blocking condition for mutations and
requires manual investigation rather than an aggressive unlock heuristic.

Dry-run and ordinary doctor create no lock. `doctor --accept-preserved` is a
real manifest mutation and follows the same exclusive lock, rescan, fingerprint,
journal, and durability rules as every other apply. A concurrent read-only
preview cannot authorize stale writes.

## Filesystem safety

- Resolve and validate the explicit target before mutation. Convert target,
  repository root, and source payload root to normalized absolute paths, resolve
  existing components without following an unsafe symlink, and apply the
  filesystem's case-sensitivity rules when they can be determined safely.
- Reject `/`, an empty or safely unresolvable target, and every equality,
  ancestor, or descendant relationship between target and either repository
  root or source payload root. Thus the target cannot contain either root and
  cannot be contained by either root. Normalized `.`/`..`, case-equivalent, and
  symlink-mediated spellings do not bypass this rule.
- Never recursively delete a caller-supplied broad path.
- Reject source symlink files, source symlink directories, any symlink component
  in a managed target path, any symlink below `.oak/`, and any symlink used as
  rollback storage. Source inventory and target validation do not follow
  symlinks.
- Use only normalized manifest-relative paths joined beneath the validated
  target.
- Reserve `.oak` and all descendants exclusively for installation-manager
  state. Reject that namespace in source inventory, `owned_files`,
  `preserved_files`, logical plan paths, journal operation paths, and any
  backup path that attempts to represent a managed `.oak` path.
- Remove only explicitly planned files and proven-empty directories.
- Install, upgrade, recovery, and rollback restore both exact bytes and persisted
  mode. Internal `.oak` modes always follow the restrictive state policy rather
  than source modes.

These structural collisions fail closed before managed mutation and cannot be
resolved with `--force`:

- source file where target is a directory;
- source directory where target is a regular file;
- regular-file parent in a managed target path;
- `.oak` as a regular file or symlink;
- rollback storage as a symlink;
- manifest or lock path as a directory;
- any other invalid parent path or file/directory type mismatch.

`--force` is limited to initial install and authorizes replacement only of a
regular file at a normalized path beneath the validated target, with no symlink
in the path or its managed ancestors, and only after the previous bytes and mode
are durable. It cannot replace a directory, traverse a symlink, repair a
manifest, bypass a live or stale lock, ignore an active transaction, overwrite
`.oak`, run during upgrade, delete user-modified files during uninstall, resolve
path traversal, or omit rollback backup creation.

## Tests

Create `scripts/manage-installation.test.mjs`. Tests use temporary source and
target directories and import the engine rather than shelling out except for a
small wrapper contract set.

Required scenarios:

1. Clean install dry-run performs zero writes.
2. Clean install creates owned files and a valid sorted manifest.
3. Existing protected configuration is preserved and recorded.
4. Existing unrelated user files remain untouched.
5. Unowned managed collision aborts with no target or state changes.
6. Initial `--force` captures rollback bytes before replacement.
7. Exact existing matches are adopted without rewriting during initial install.
8. Upgrade fixture adds, updates, and removes expected files.
9. Modified owned file aborts the complete upgrade with byte-for-byte unchanged
   target and state.
10. Modified obsolete file aborts upgrade.
11. Uninstall removes unchanged owned files and preserves modified/user files.
12. Rollback restores install, upgrade, and uninstall.
13. Post-operation user modification blocks rollback.
14. Invalid schema, malformed JSON, duplicate paths, traversal paths, and bad
    hashes fail closed.
15. Simulated interruption leaves recoverable journal state.
16. Recovery rollback restores the pre-operation state.
17. Live lock rejects a second mutation.
18. Stale lock and corrupt transaction are reported without mutation.
19. Source and target symlink traversal are rejected.
20. Wrapper help, unknown arguments, target precedence, and exit codes remain
    deterministic.
21. Stable preserved protected file permits doctor exit `0`.
22. Source-only change for a protected file produces a merge warning.
23. User and source changes on the same protected file produce merge pending.
24. New upgrade source path with identical pre-existing target bytes/mode stays
    user-owned as `preexisting-exact-match`.
25. Source-file/target-directory collision fails without mutation.
26. Source-directory/target-file collision fails without mutation.
27. `.oak` as a regular file fails closed.
28. `.oak` as a symlink fails closed.
29. Failure between rename and parent-directory fsync remains recoverable.
30. Failure while installing a new rollback point preserves the previous point.
31. Bootstrap cleanup never removes a pre-existing target.
32. Bootstrap cleanup removes an empty target created by the invocation.
33. Initial install preserves executable modes.
34. Upgrade preserves executable modes.
35. Rollback restores executable modes.
36. `--force` rejects directory replacement.
37. `--force` rejects symlink replacement or traversal.
38. Backups, state files, state temporaries, and state directories have the
    required restrictive permissions.
39. An apparently live PID blocks conservatively.
40. Journal with invalid completed indexes fails closed.
41. Missing protected preserved file whose source still exists produces doctor
    exit `1` without recreation.
42. Stable preserved file is not a blocking conflict.
43. Failure before journal creation leaves zero persistent state.
44. Failure after journal creation produces a deterministic recovery plan.
45. Interrupted recovery rollback does not consume the prior committed rollback
    point.
46. Invalid or out-of-range persisted modes fail closed.
47. Error and summary output never includes sentinel bytes stored in a sensitive
    rollback backup.
48. A failure injected after bootstrap `rmdir` but before parent-directory
    `fsync` completes or retries the required sync and leaves the same durable
    zero state as before invocation.
49. An unknown journal status or an invalid status transition fails closed
    without changing target, manifest, journal, or rollback state.
50. Recovery from `rolling-back` resumes only the remaining inverse operations,
    reaches `rolled-back` deterministically, and retains the earlier committed
    rollback point for an interrupted forward operation.
51. Committed rollback writes a `rollback` lock and matching active-journal lock
    snapshot with the committed transaction ID; interruption before or after
    holder-snapshot refresh remains resumable, while any unrelated ID or holder
    mismatch fails closed.
52. Acknowledging a manual merge updates both preserved baselines and its
    acknowledgement metadata without changing reason, bytes, modes, or user
    ownership.
53. Manual-merge acknowledgement aborts if the target changes after the
    confirmed plan.
54. Manual-merge acknowledgement aborts if the source changes after the
    confirmed plan.
55. Acknowledgement of a path absent from `preserved_files` fails closed.
56. A source change after acknowledgement creates merge-pending state again.
57. A user change after acknowledgement is classified as user-only evolution.
58. Interrupted-forward recovery resolves backups only below
    `.oak/rollback.next/`.
59. Committed-operation rollback resolves backups only below `.oak/rollback/`.
60. An inconsistent status, rollback origin, backup root, or backup path fails
    closed.
61. `.oak` as any source-payload entry is rejected.
62. `.oak` in manifest-owned paths is rejected.
63. A target equal to the repository root is rejected.
64. A target that is an ancestor of the repository root is rejected.
65. A target that is a descendant of the repository root is rejected.
66. A target equal to, an ancestor of, or a descendant of the source payload is
    rejected.
67. A dangerous target relationship expressed through `..` normalization is
    rejected.
68. `adopt` changes ownership without rewriting the existing file.
69. Rollback of adoption restores ownership without deleting or modifying the
    adopted file.
70. `preserve` creates no mutable journal operation or backup.
71. Rollback of preservation restores manifest state without changing file
    bytes or mode.
72. A journal operation with `kind: adopt` is rejected.
73. A journal operation with `kind: preserve` is rejected.
74. An `add` operation with a non-null backup is rejected.
75. An `update` operation without a valid backup is rejected.
76. A `remove` operation without a valid backup is rejected.
77. A manifest-only transaction can commit and rollback correctly with an empty
    operations array.
78. Manual-merge acknowledgement is a rollbackable manifest-only transaction.
79. `EPERM` from the PID probe blocks conservatively.
80. Ordinary doctor reports a user-only preserved change without updating its
    baseline.
81. A source payload entry at `.oak/manifest.json` is rejected independently of
    whether `.oak` was materialized as a directory, file, or symlink.
82. A target relationship hidden through an existing symlink is rejected
    without following the unsafe path for mutation.
83. Reserved `.oak` paths in `preserved_files`, logical plans, journal
    operations, or backup paths are rejected.
84. A case-equivalent dangerous target relationship is rejected on a filesystem
    where case-insensitivity can be determined safely.
85. An `add` operation with non-null before-state is rejected.
86. A `remove` operation with non-null after-state is rejected.
87. An `update` with an incomplete before-state or after-state pair is rejected.
88. Any operation with a hash present but mode absent, or mode present but hash
    absent, is rejected.
89. An unknown journal operation kind is rejected.
90. `doctor --accept-preserved PATH` rejects path-only authorization that does
    not exactly match the displayed canonical ACK line.
91. Manual-merge acknowledgement rejects confirmation containing any target or
    source hash/mode value different from the planned tuple.
92. A no-op upgrade leaves the manifest and all preserved baselines byte-for-byte
    unchanged.
93. A crash after commit but before `rollback.next/` and
    `rollback.previous/` cleanup leaves `rollback/` as the sole active point;
    doctor returns `1`, and neither residue is selected for rollback or
    interrupted recovery.
94. A PID-probe error other than `ESRCH` or `EPERM` is reported conservatively
    and fails closed without stale-lock replacement.
95. An initial-install journal uses `previous_manifest: null`, a valid complete
    next manifest, and matching null/non-null digests.
96. An uninstall journal uses a valid previous manifest and
    `next_manifest: null` with a null next digest.
97. A manifest object paired with a null digest fails validation.
98. A null manifest paired with a non-null digest fails validation.
99. Rollback of install removes the active manifest and restores expected
    absence.
100. Rollback of uninstall restores the prior manifest.
101. Recovery detects a present manifest when the journal expects absence.
102. Recovery detects an absent manifest when the journal expects presence.
103. A preserved path removed from the source but present in the target is
     classified `obsolete-preserved-present`.
104. A preserved path absent from both source and target is classified
     `obsolete-preserved-missing`.
105. Upgrade removes obsolete preserved metadata without touching a present
     user file.
106. Upgrade removes obsolete preserved metadata without recreating a missing
     user file.
107. Rollback of that manifest-only upgrade restores the preserved entry without
     changing or recreating user bytes.
108. Ordinary doctor reports obsolete preserved metadata with exit `1` before
     cleanup and does not offer acknowledgement.
109. Obsolete preserved cleanup permits a manifest-only upgrade when no other
     payload or ownership work exists.
110. `--accept-preserved` requires the complete canonical ACK line.
111. Confirmation `yes` is rejected with exit `1` and no persistent mutation.
112. Path-only confirmation is rejected with exit `1` and no persistent
     mutation.
113. A truncated hash in the confirmation line is rejected.
114. EOF before a valid line cancels with exit `1` and zero persistent mutation.
115. Exact confirmation works through non-interactive stdin without private
     flags.
116. A tuple or fingerprint change after lock acquisition aborts with exit `1`.
117. A path absent from `preserved_files` returns exit `2`.
118. Unrelated owned drift blocks acknowledgement without changing state.
119. A non-blocking warning on another preserved file does not block
     acknowledgement.
120. Acknowledging a merge leaves the original preservation `reason` unchanged.
121. Acknowledging a merge creates a complete `merge_acknowledgement` matching
     the committed baselines.
122. `merge_acknowledgement.acknowledged_at` uses the injectable clock.
123. Rollback restores the previous acknowledgement object or `null`.
124. A partial acknowledgement object fails manifest validation.
125. A new acknowledgement whose hashes or modes differ from the
     `accept-preserved` next-manifest baselines fails transaction validation.
126. A later source change leaves the acknowledgement historical and creates
     merge-pending state.
127. A later target change leaves the acknowledgement historical and is
     classified as user-only evolution.
128. Canonical manifest serialization produces identical bytes and digest for
     writing and validation.
129. An empty object is invalid and never represents an absent manifest.
130. A transaction with both previous and next manifests null is rejected.
131. Committed-operation rollback rejects current manifest presence when the
     committed next state expects absence, and rejects absence when it expects
     presence, before any inverse write.
132. Committed-operation rollback rejects a present current manifest whose
     canonical digest differs from `next_manifest_sha256`.
133. Interrupted recovery rejects a present manifest with the wrong canonical
     digest for its recorded previous, next, or inverse-completed phase.
134. An upgrade journal accepts only valid complete previous and next manifests
     with matching non-null digests.
135. An `accept-preserved` journal accepts only valid complete previous and next
     manifests with matching non-null digests.
136. Each transaction command rejects every presence pair other than its
     declared install, upgrade, accept-preserved, or uninstall combination.

Update `unit-and-script-tests` so both `scripts/*.test.mjs` and
`opencode/scripts/*.test.mjs` execute in CI.

Extend `scripts/install-smoke.sh` to exercise, in a clean temporary target:

```text
install -> doctor -> upgrade --dry-run -> uninstall -> rollback -> doctor
```

The final doctor must confirm that rollback restored the managed installation,
and the installed plugin import must continue to pass.

## Documentation

Update `README.md` and `docs/installation.md` with:

- command examples and dry-run-first workflow;
- manifest ownership semantics;
- protected configuration behavior;
- legacy migration limitation;
- conflict resolution guidance;
- uninstall preservation rules;
- single-generation rollback limitation;
- recovery steps for interrupted state.

Update `CONTRIBUTING.md` only if its validation checklist needs to name the new
manager tests. Update `scripts/check.sh` to require the engine, wrappers, tests,
and executable modes.

## Validation and evidence

Required before closure:

- focused RED/GREEN manager tests;
- all manager scenarios above;
- `npm run check`;
- `npm run check:release`;
- `bash -n` for every shell wrapper;
- clean temporary installation lifecycle smoke;
- negative conflict proof showing no write occurred;
- `git diff --check`;
- public leak scan;
- independent spec, implementation, and final diff review.

Evidence must distinguish automated tests, static checks, temporary live smoke,
manual review, and anything not run. No routing behavior changes, so transcript
replay is not required.

## Public/private boundary

All implementation belongs to the public repository. No private OpenCode
configuration, provider, MCP, credential, endpoint, session, transcript,
machine-local path, or user-installed skill registry is copied or referenced.
Private memory state remains outside the public repository and this design.

## Rollback of this development slice

The Slice 1.2 diff can be reverted by its explicit public file list. It must not
discard the already approved but uncommitted Slice 1.1 changes in shared files
such as `package.json`, `README.md`, `CONTRIBUTING.md`, or
`scripts/install-smoke.sh`. No commit, push, tag, or release is part of this
slice unless separately requested.
