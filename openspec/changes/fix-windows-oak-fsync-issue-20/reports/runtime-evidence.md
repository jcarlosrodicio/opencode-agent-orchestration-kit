# Runtime evidence

## Scope

This change affects the direct installation lifecycle in
`scripts/manage-installation.mjs`. The focused runtime target is the manager
test suite; native Windows execution is not available on this host.

## Commands

| Command | Result |
|---|---|
| `node --test scripts/manage-installation.test.mjs` | PASS — 200 tests, 200 passed, 0 failed |
| `npm run typecheck` | PASS — exit 0 |
| `npm run check:quick` | PASS — contract, threat, use-case, JSON, harness, frontmatter, and public-boundary checks passed |
| `bash -n install.sh uninstall.sh upgrade.sh doctor.sh rollback.sh scripts/check.sh` | PASS |
| `git diff --check` | PASS |
| `scripts/harness/verify scripts/manage-installation.mjs scripts/manage-installation.test.mjs` | NOT AVAILABLE — this repository has no `scripts/harness/verify` entrypoint |
| `npm run check` | WARNING — 1,075 tests: 1,073 passed, 2 package-smoke tests failed because the smoke runs under Node v26.8.1 while the package contract is Node `^22.9.0 || ^24.0.0` |
| `npm run check:release` | WARNING — preflight stopped at the generated `.codegraph/daemon.log` public-boundary artifact before the full release chain; the artifact was removed and `npm run check:quick` then passed |
| `npm run installation-smoke` | WARNING — lifecycle assertions passed; final doctor check reported Node v26.8.1 outside the supported engine range |
| `npm run package-smoke` | WARNING — packed smoke reached installation validation and failed for the same Node v26.8.1 engine mismatch |

## Native Windows boundary

The regression test simulates `win32` for `fsyncDirectory()` and proves that no
directory descriptor is opened. A separate manager test simulates a directory
fsync failure after the regular lock-file fsync and proves the newly-created
lock is removed while a pre-existing lock is preserved. A real Windows run is
`not covered` in this environment.
