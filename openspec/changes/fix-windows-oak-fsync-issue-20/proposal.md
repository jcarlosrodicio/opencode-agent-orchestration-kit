# Proposal: Fix Windows `oak install` directory fsync failure

## Problem

`oak install` currently opens the `.oak` directory and calls `fsyncSync` on its descriptor. Windows rejects that operation with `EPERM`, so installation aborts before the transaction journal exists and can leave `.oak/lock.json` behind.

## Scope

- Make directory fsync a no-op on `win32` only.
- Keep regular-file fsyncs unchanged.
- Remove a lock if the current invocation created it and then fails before `acquireLock` returns.
- Add regression coverage and document the Windows durability limitation.

Out of scope: native Windows support for the Bash lifecycle wrappers, automatic reclamation of arbitrary pre-existing locks, version bumps, release publication, and CI infrastructure changes.

## Acceptance criteria

1. The manager can complete the direct `oak` installation path on Windows without attempting `fsyncSync` on a directory descriptor.
2. Existing POSIX directory-fsync failures still fail closed.
3. A lock created by a failed lock acquisition is not left behind; a lock that existed before the attempt is never removed by that attempt.
4. Existing installation, recovery, and durability tests remain green.
5. Documentation distinguishes the direct Windows CLI limitation from the still-unsupported Bash wrappers.
