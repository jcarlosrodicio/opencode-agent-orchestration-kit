# Installation lifecycle requirements

## ADDED Requirements

### Requirement: Windows directory fsync compatibility

The installation manager MUST NOT call `fsyncSync` on a directory descriptor when running on `win32`.

#### Scenario: directory sync on Windows

- **GIVEN** the manager reaches a directory durability boundary on `win32`
- **WHEN** it requests `fsyncDirectory()`
- **THEN** the helper returns without opening or syncing the directory
- **AND** regular-file fsync operations remain available

#### Scenario: directory sync on POSIX

- **GIVEN** the manager reaches a directory durability boundary on a POSIX platform
- **WHEN** opening or syncing the directory fails with a non-interrupted error
- **THEN** the error is propagated and the operation remains fail-closed

### Requirement: failed lock acquisition cleanup

The manager MUST remove a lock file created by the current lock-acquisition attempt when a later acquisition step fails, without removing a lock that predated the attempt.

#### Scenario: publication succeeds but acquisition fails

- **GIVEN** `openSync(lockPath, "wx")` succeeds for the current invocation
- **WHEN** writing, syncing, closing, or directory handling fails before `acquireLock()` returns
- **THEN** the current lock path is best-effort removed
- **AND** the original acquisition error is rethrown

#### Scenario: another lock already exists

- **GIVEN** `openSync(lockPath, "wx")` fails because the path already exists
- **WHEN** lock acquisition reports the conflict
- **THEN** the pre-existing lock remains untouched
