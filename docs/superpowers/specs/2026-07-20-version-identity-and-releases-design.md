# Version Identity and Release Contract Design

## Status

Approved by independent review and the user; ready for implementation planning.

## Roadmap scope

This design covers Phase 1, Slice 1.3: canonical version identity and releases.
It builds on the release checks from Slice 1.1 and the installation manifest from
Slice 1.2. It does not publish a release.

## Problem

The repository currently exposes incompatible version histories:

- the newest local and remote tag is `v1.0.26`;
- the newest GitHub Release visible during preflight is `v1.0.22`;
- the root `package.json` still declares `0.1.0`;
- only `v1.0.10` and `v1.0.14` have checked-in release-note documents;
- the installation manifest identifies its schema and payload digest, but not
  the kit release that produced it;
- the lifecycle wrappers and manager expose no version command;
- CI validates behavior but cannot reject a tag whose name disagrees with the
  source version.

Consequently, a green check cannot prove which kit version was tested, an
installed manifest cannot report its originating release, and a tag can be
created over internally contradictory metadata.

The current functional baseline is healthy: `npm run check` passes all 245
tests. The public branch contains the completed but unpublished Slice 1.2 commit
and is one commit ahead of `origin/master`. The private OpenCode configuration is
clean and is not an input to this slice.

## Goals

1. Make the root `package.json` the single editable source of kit version.
2. Prepare stable version `1.0.27` without creating or publishing its tag.
3. Expose the same version identity through the lifecycle manager and all five
   shell wrappers.
4. Persist the originating kit version in installation and transaction state.
5. Detect contradictory version, payload, release-note, and tag state
   mechanically.
6. Make `doctor`, `upgrade`, recovery, and rollback version-aware without adding
   network access or a new package dependency.
7. Define a release gate that remains manual and human-authorized.

## Non-goals

- Creating, pushing, moving, or deleting a Git tag.
- Creating or editing a GitHub Release.
- Publishing an npm package.
- Automatically incrementing the version.
- Backfilling release-note files for `v1.0.15` through `v1.0.26`.
- Declaring the OpenCode, Node, operating-system, or optional-integration
  compatibility matrix from Slice 1.4.
- Adding checksums, signatures, provenance attestations, an SBOM, or other Slice
  1.5 supply-chain mechanisms.
- Building the future `oak` CLI from Slice 3.2.
- Adding prerelease or build-metadata policy before a demonstrated need.
- Querying GitHub, npm, or another remote service during normal version checks
  or lifecycle operations.

## Chosen approach

The root `package.json` is the only editable version source. The implementation
sets its `version` to `1.0.27`. All other surfaces consume or validate that
value; none stores an independently editable copy except durable installation
state and the release-note filename that intentionally records historical
identity.

The accepted public release format is exactly three non-negative decimal
components:

```text
MAJOR.MINOR.PATCH
```

Each component is `0` or a non-zero digit followed by digits. Leading zeroes,
prefix `v`, surrounding whitespace, prerelease identifiers, and build metadata
are invalid in this slice. Git tags add exactly one lowercase `v`, producing
`vMAJOR.MINOR.PATCH`.

A standalone `VERSION` file was rejected because it would add another source
that could drift from Node package metadata. Git tags were rejected as the
source of truth because source archives, shallow clones, untagged development
commits, and installed configurations may not have tag metadata.

## Version module

Add a dependency-free ESM module at `scripts/version.mjs`. It owns only version
identity and comparison. It must not perform installation mutations, Git
network operations, version increments, or release publication.

The module exports focused functions equivalent to:

```text
parseStableVersion(value)
compareStableVersions(left, right)
readCanonicalVersion(repositoryRoot)
formatVersion(version)
checkVersionContract(options)
```

`parseStableVersion` returns numeric major, minor, and patch components and the
canonical string, or rejects the value. Comparison is numeric per component;
string or locale comparison is forbidden. Inputs larger than JavaScript's safe
integer range are rejected rather than rounded.

`readCanonicalVersion` reads the root `package.json` as a regular file, parses
JSON, validates its exact public package name and version format, and returns the
canonical version. It does not read `opencode/package.json`, Git tags, release
badges, or installation state as competing sources.

The command:

```bash
node scripts/version.mjs
```

prints exactly:

```text
opencode-agent-orchestration-kit 1.0.27
```

with one trailing newline and exit status zero. Invalid or contradictory state
prints a concise diagnostic to stderr and exits with status two. The output
contains no local path, environment value, Git remote, or package contents.

## Lifecycle version interface

The lifecycle entrypoint recognizes `--version` before command parsing:

```bash
node scripts/manage-installation.mjs --version
```

Each existing wrapper passes `--version` through and therefore prints the same
line without target resolution, source inventory, lock acquisition, manifest
access, or filesystem mutation:

```bash
./install.sh --version
./upgrade.sh --version
./doctor.sh --version
./uninstall.sh --version
./rollback.sh --version
```

`--version` is valid only as the sole argument. Combinations such as
`--version --target PATH` fail with status two. Existing help output and normal
command parsing remain unchanged.

The manager imports the canonical reader from `scripts/version.mjs`. It must not
embed a second `KIT_VERSION = "1.0.27"` constant. Tests inject a version reader
or repository root where isolation is needed; they do not rewrite the real
`package.json` concurrently.

## Manifest version identity

Slice 1.2's manifest schema remains `schema_version: 1` because that manifest
format has not been published. Before its first public release, add one required
field:

```json
{
  "schema_version": 1,
  "manager": "opencode-agent-orchestration-kit",
  "kit_version": "1.0.27",
  "payload_sha256": "hex digest"
}
```

`schema_version` identifies the metadata format. `kit_version` identifies the
kit release whose payload and ownership state the manifest describes. They are
independent and must never be inferred from each other.

Every complete manifest object, including `previous_manifest` and
`next_manifest` snapshots inside transaction and rollback journals, requires a
valid `kit_version`. Its canonical JSON bytes and digest include that field.
Adding or changing a kit version therefore changes the manifest digest even when
the owned-file set is identical.

The manifest validator rejects:

- a missing or unknown `kit_version` field;
- a non-string or non-canonical version;
- prefix `v`, whitespace, prerelease, metadata, or leading zeroes;
- a manifest digest computed without the version field;
- an otherwise valid transaction whose manifest snapshot fails these rules.

No separate transaction-level kit-version field is required. Complete previous
and next manifest snapshots already carry the relevant identities; install has
only next, uninstall has only previous, and upgrade or accept-preserved has both.
`source_payload_sha256` remains the journal's independent source-content guard.

## Unpublished experimental state

A Slice 1.2 manifest with `schema_version: 1` but no `kit_version` is invalid.
There is no automatic migration for this experimental format because no public
release shipped it. `doctor` reports the validation failure and mutation
commands fail closed without changing files.

The repair documentation may instruct a developer who used the unpublished
manager to preserve or back up the target, remove only the experimental `.oak`
state after explicit review, and reinstall. The implementation must not silently
invent a version or claim ownership from an invalid manifest.

Installations predating the ownership manifest remain governed by Slice 1.2's
existing path: inspect with dry-run, review collisions, and use install
`--force` only when intentionally adopting or replacing a managed collision.

## Doctor version states

`doctor` compares only the canonical source checkout and the local installation.
It performs no network request and does not claim to know the newest remote
release.

When doctor can parse enough state to produce its normal structured report, it
adds these fields without renaming or removing any existing report key:

```json
{
  "sourceVersion": "1.0.27",
  "installedVersion": "1.0.26",
  "versionState": "upgrade-available"
}
```

`sourceVersion` is the canonical package version, or `null` only when that
source is invalid. `installedVersion` is the validated manifest `kit_version`,
or `null` when the manifest is absent or cannot supply a valid version.
`versionState` is always one of the states below when a structured report is
returned; it is never omitted. Existing fields such as `manifest`, `blockers`,
`warnings`, `activeTransaction`, `activeLock`, `rollbackAvailable`, and
`cleanupResidue` retain their current meaning.

The states are disjoint:

| State | Meaning | Exit behavior |
| --- | --- | --- |
| `not-installed` | `manifest.json` is absent | Existing not-installed behavior |
| `current` | Version and payload both match | Healthy unless another check is actionable |
| `upgrade-available` | Source version is greater | Action required; recommend upgrade dry-run |
| `source-older` | Source version is lower | Blocking; refuse accidental downgrade |
| `same-version-different-payload` | Version matches but payload differs | Blocking release-identity contradiction |
| `invalid-version-state` | `manifest.json` is present but invalid, or the canonical source version is invalid | Validation error; fail closed with exit two |

Manifest absence is never classified as invalid. Conversely, a present
manifest missing `kit_version`, containing malformed JSON, failing another
manifest invariant, or carrying a non-canonical version is never classified as
`not-installed`. When invalid bytes prevent extraction, `installedVersion` is
`null`; when the source package version is invalid, `sourceVersion` is `null`.
The diagnostic must identify which side is invalid without echoing manifest or
package contents. If an underlying filesystem error prevents even a safe
structured report, existing generic fail-closed error handling remains valid,
but it must not emit `not-installed`.

The human-readable doctor output names both versions when available and gives a
specific next action. It must not label `upgrade-available` as a remote update;
it means only that the local source checkout is newer than the installed state.

Other doctor findings retain their current precedence and semantics. A current
version does not override ownership drift, preserved-file warnings, active
transactions, locks, or cleanup residue.

## Install and upgrade rules

Initial install writes the canonical source version into the next manifest.
Install dry-run reports that version without creating target or `.oak` state.

Upgrade planning applies these version gates after validating current state and
before acquiring a lock:

1. Source version greater than installed version: normal Slice 1.2 planning may
   continue.
2. Source version equal and payload equal: no-op.
3. Source version equal and payload different: block the complete upgrade with
   `same-version-different-payload`; do not partially update files or manifest.
4. Source version lower: block with `source-older`; no downgrade flag is added.

An intentional return to the previous committed state uses existing one-step
rollback. Arbitrary downgrade installation is outside this slice.

`accept-preserved` is allowed only when source and installed kit versions match
and the existing Slice 1.2 acknowledgement rules pass. It changes preserved
baselines, not release identity. If the source version is newer, the user must
perform the normal upgrade flow rather than using acknowledgement to bypass a
version transition.

Uninstall preserves the previous version only in its rollback snapshot. Its
resulting active manifest remains absent as already specified.

## Recovery and rollback

Recovery validates version-bearing manifest snapshots before inspecting or
inverting file operations. It never substitutes the current checkout version
for a journal snapshot.

Rollback restores the exact previous manifest, including `kit_version`, or
restores manifest absence for rollback of an initial install. A committed
rollback must still compare canonical manifest presence and digest, so changing
only the recorded version is a blocking mismatch.

Interrupted forward and inverse operations retain their current durability,
lock, and progress rules. Version identity adds no new mutable recovery file and
no remote dependency.

## Release-note contract

The canonical release-note path for the current package version is:

```text
docs/releases/v1.0.27.md
```

The filename must equal `v${package.json.version}.md`. Its first heading must be:

```text
# v1.0.27 - <concise title>
```

The document contains at least:

- user-visible highlights;
- installation or upgrade instructions;
- migration notes, or an explicit statement that no migration is required;
- validation performed;
- the public-safety exclusion boundary.

The Slice 1.3 implementation prepares this document as release-ready source
material but does not create a GitHub Release. Missing historical checked-in
notes are recorded as pre-contract drift and are not backfilled. The new checker
requires only the note matching the current canonical version; it does not scan
every historical tag for a corresponding file.

The README keeps its dynamic latest-release badge. It must not add a hard-coded
"latest" version that becomes a new drift surface. Documentation may show
`1.0.27` only where describing the prepared release or an exact version-output
example.

## Mechanical version checker

`scripts/version.mjs --check` validates repository-local state:

1. root package name and stable version syntax;
2. the current release-note filename and heading;
3. lifecycle manager and wrapper `--version` output through behavioral tests,
   not source-text duplication;
4. required `kit_version` manifest schema and fixtures through manager tests;
5. absence of a competing root `VERSION` file or independently declared kit
   version in an allowlisted set of version-bearing configuration surfaces.

The checker does not search arbitrary prose for every version-shaped string;
dependency versions, historical notes, examples for external tools, schema
versions, and compatibility declarations are legitimate. Drift checks are
allowlisted to known authoritative or consumer surfaces.

Add `npm run check:version` for the standalone check. The fast contractual path
invokes it, and `npm run check` and `npm run check:release` inherit it.

The check uses no Git network operation. In an exported source tree without
`.git`, repository-local validation still works.

## Tag validation

Tag validation is an explicit mode, for example:

```bash
node scripts/version.mjs --check-tag v1.0.27
```

It validates that the supplied tag name equals `v${canonicalVersion}`. Empty,
multiple, malformed, or mismatched values exit non-zero. It does not create,
move, delete, fetch, or push a tag and does not decide whether a GitHub Release
exists.

The GitHub Actions workflow adds tag pushes matching `v*` to its existing
triggers. On a tag ref it runs tag validation against `GITHUB_REF_NAME` and then
the complete release-readiness suite. On branch pushes and pull requests it runs
the repository-local version check without requiring HEAD to be tagged.

This distinction permits multiple reviewed commits to prepare a release while
ensuring that the eventual tag cannot disagree with its source. A normal
development commit is not required to have a tag.

## Manual release procedure

After implementation is complete and only after separate human authorization,
the documented release sequence is:

1. Confirm a clean intended public tree and canonical version.
2. Run `npm run check:version`.
3. Run `npm run check:release`.
4. Inspect release notes and migration instructions.
5. Confirm that the intended tag does not already exist locally or remotely.
6. Commit all release-bearing source surfaces.
7. Create annotated tag `v1.0.27` on that exact commit.
8. Push the commit, then push that exact tag.
9. Confirm the remote tag target.
10. Create the GitHub Release from the checked-in release notes and confirm the
    dynamic README badge resolves to it.

These are documentation requirements, not actions authorized by this slice.
An existing remote tag is immutable unless the user explicitly authorizes an
exception after reviewing its impact; the tooling never moves it silently.

## Expected implementation files

- `package.json`
- `scripts/version.mjs`
- `scripts/version.test.mjs`
- `scripts/manage-installation.mjs`
- `scripts/manage-installation.test.mjs`
- `scripts/check.sh`
- `.github/workflows/check.yml`
- `docs/releases/v1.0.27.md`
- `README.md`
- `docs/installation.md`
- `docs/quickstart.md` if needed to keep the release check unambiguous

The five shell wrappers should remain behavior-free. They need not change if
their existing argument pass-through already makes `--version` work.

No private OpenCode configuration, provider, MCP, credential, session,
transcript, memory, database, endpoint, or machine-local path is an input or
output of the implementation.

## Test scenarios

The implementation adds focused synthetic coverage for at least:

1. `package.json` version `1.0.27` parses canonically.
2. Prefix, leading zero, missing component, negative, prerelease, metadata,
   whitespace, and unsafe-integer versions are rejected.
3. Numeric comparison handles `1.9.9 < 1.10.0` correctly.
4. Direct manager `--version` output is exact and mutation-free.
5. All five wrappers produce the identical version line and status.
6. `--version` combined with another argument is rejected.
7. Current release-note path and heading pass.
8. Missing, wrongly named, or wrongly headed current notes fail.
9. Historical missing release notes do not fail the current contract.
10. Matching and mismatching tag values pass and fail deterministically.
11. Branch/PR check mode does not require a tag.
12. Initial install persists `kit_version`.
13. Install dry-run reports identity and writes nothing.
14. Missing or malformed manifest `kit_version` fails closed.
15. Manifest canonical digest changes when only kit version changes.
16. Greater source version plans an upgrade.
17. Equal version and payload is a no-op.
18. Equal version with different payload blocks all writes.
19. Lower source version blocks all writes.
20. `accept-preserved` cannot bypass an available version upgrade.
21. Doctor reports every version state with actionable output and additive
    `sourceVersion`, `installedVersion`, and `versionState` fields.
22. Manifest absence reports `not-installed`, a source version, and null
    installed version; a present invalid manifest reports
    `invalid-version-state` and never `not-installed`.
23. Upgrade commits the next version into manifest and rollback journal.
24. Rollback restores the exact earlier kit version.
25. Rollback of initial install restores manifest absence.
26. Interrupted recovery preserves snapshot versions rather than using the
    current checkout.
27. Corrupt version state never weakens existing lock, conflict, ownership, or
    recovery checks.

Existing Slice 1.2 scenario IDs remain unique. New scenarios may continue the
numbered series or use a separate version-contract series, but the chosen scheme
must be mechanically checked and documented in the implementation plan.

## Validation

The implementation plan must include, in order:

```bash
node --test scripts/version.test.mjs
node --test scripts/manage-installation.test.mjs
npm run check:version
npm run check
node scripts/version.mjs --check-tag v1.0.27
# mismatched tag command, expected non-zero
npm run check:release
git diff --check
```

The installation smoke must assert version-bearing manifests during install,
upgrade, rollback, and final doctor state. A tag mismatch is a tested expected
failure, not a failed release readiness run.

Before any later public commit or release, run the public leak scan required by
`opencode-public-sync`. The spec and synthetic tests must contain no private
paths, provider names, MCP wiring, credentials, raw evidence, or private
configuration.

## Acceptance criteria

- Root `package.json` is the sole editable kit-version source and declares
  `1.0.27`.
- All lifecycle entrypoints emit one identical deterministic version line.
- Every valid manifest snapshot records and validates `kit_version`.
- Doctor distinguishes absent, valid, and present-but-invalid local version
  states through a deterministic additive report shape without network access.
- Upgrade blocks downgrade and same-version/different-payload ambiguity before
  mutation.
- Rollback and recovery preserve exact historical version identity.
- Current release notes are mechanically bound to the canonical version.
- Normal CI checks source consistency; tag CI additionally validates the tag and
  runs the complete release suite.
- Historical release-note gaps are documented but do not create fabricated
  artifacts.
- All focused and full validation passes.
- Independent review reports no unresolved Critical or Important finding.
- No commit, push, tag, GitHub Release, or npm publication occurs without a
  separate explicit request.

## Failure and rollback strategy

During implementation, version-contract changes are one coherent public slice.
If validation fails, do not tag or publish the tree. Revert only the files owned
by Slice 1.3 or correct them under review; do not weaken validation or alter
unrelated history.

After a future release, runtime rollback uses the Slice 1.2 committed rollback
point and restores the earlier manifest version. Source-control rollback uses a
new corrective commit and a new version. Never move an already published tag to
hide a release mistake.

## Risks and mitigations

- **Unreleased manifest schema is mistaken for a published compatibility
  promise.** Mitigation: document that required `kit_version` completes schema 1
  before its first release; reject experimental incomplete state.
- **Version numbers appear legitimately in many files.** Mitigation: validate an
  explicit surface allowlist rather than grepping all prose.
- **Same version is reused for changed payload.** Mitigation: block
  same-version/different-payload upgrades and require the release operator to
  bump the canonical version.
- **A lower checkout overwrites a newer installation.** Mitigation: block
  downgrade; use committed rollback for the supported one-step reversal.
- **CI branch checks incorrectly require a tag.** Mitigation: isolate tag
  validation to explicit tag context.
- **A tag is valid but no GitHub Release is created.** Mitigation: keep remote
  publication human-gated and require post-push confirmation in the documented
  release procedure; automatic release publication is out of scope.
- **Historical tags and GitHub Releases remain inconsistent.** Mitigation: treat
  them as documented pre-contract history and enforce the contract from 1.0.27
  forward without rewriting history.

## Handoff boundary

Approval of this specification authorizes only creation of an implementation
plan. It does not authorize implementation, commit, push, tag, release, or
publication. The plan must preserve the current public branch, include strict
test-first version and lifecycle scenarios, and require independent review
before any final consolidation.
