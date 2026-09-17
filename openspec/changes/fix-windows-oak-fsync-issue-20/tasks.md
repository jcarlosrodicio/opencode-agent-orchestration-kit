# Tasks

## Phase 1: RED tests

- [x] Add a deterministic regression test proving a simulated `win32` directory fsync does not open or sync a directory.
- [x] Add a manager test that fails after lock publication and verifies the created lock is cleaned up while a pre-existing lock is preserved.

## Phase 2: Implementation

- [x] Add the `win32` guard/platform seam to `fsyncDirectory()`.
- [x] Add ownership-aware best-effort cleanup to `acquireLock()` and preserve the original error.

## Phase 3: Documentation

- [x] Update the installation lifecycle design and compatibility documentation with the Windows directory-entry durability limitation and the unchanged Bash-wrapper boundary.

## Phase 4: Verification

- [x] Run focused tests and attempt the harness verification for `scripts/manage-installation.mjs` and its test file; record the unavailable harness command.
- [x] Run `npm run check:quick`, `npm run unit-and-script-tests`, and available installation/package smoke tests; classify environment failures separately.
- [x] Perform adversarial review and rerun all affected gates.
- [x] Record native Windows execution as not covered unless a Windows runner is available.
