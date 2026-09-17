# Design: Windows `oak` installation fsync compatibility

## Current failure path

`createInstallationManager().run()` acquires `.oak/lock.json` before creating `transaction.json`. `acquireLock()` fsyncs the regular lock file and then calls `fsyncDirectory()`. On Windows, the directory-handle fsync throws `EPERM`; the invocation-owned flag is set only after `acquireLock()` returns, so normal cleanup does not run.

## Decisions

1. `fsyncDirectory()` returns immediately when the effective platform is `win32`, before opening the directory. The regular-file fsync in `atomicWrite()` and the regular lock-file fsync remain unchanged. POSIX behavior and fail-closed handling are unchanged.
2. `acquireLock()` tracks whether its `wx` open succeeded. If any later operation fails, it best-effort unlinks only that lock path and rethrows the original error. Cleanup is deliberately non-durable and does not call `durableUnlink()`, avoiding recursive failure when directory fsync is the failing operation. A competing invocation cannot legitimately own this lock because this call has not returned and the path was opened exclusively.
3. Add a small platform seam to test directory-fsync behavior deterministically without pretending the Linux runner is Windows. Add a manager regression test for post-publication lock cleanup and preservation of a pre-existing lock.
4. Document that direct `oak` commands have a Windows-specific directory-entry durability limitation; the Bash lifecycle wrappers remain unsupported on native Windows.

## Risks and mitigations

- Skipping directory fsync weakens directory-entry durability on Windows. This is explicit and limited to Windows, while file contents continue to use regular-file fsync and the operation remains recoverable.
- Best-effort lock cleanup could itself fail. The original acquisition error is preserved, and future runs can diagnose the remaining lock; no other lock is deleted.

## Verification

Run the focused installation-manager tests, the harness verification for changed targets, `npm run check:quick`, `npm run unit-and-script-tests`, and the available installation/package smoke tests. Native Windows execution is not available in this environment and must remain marked as not covered.
