# Contributing

Thanks for considering a contribution.

This repository is a starter kit, so changes should stay small, portable, and safe for public reuse.

## Good contributions

- Fix unclear documentation.
- Improve install or uninstall safety.
- Add missing troubleshooting cases.
- Tighten agent or command prompts without changing public contracts unexpectedly.
- Improve Docker/Open Design setup while keeping secrets out of git.
- Add validation checks to `scripts/check.sh`.

## Before opening a PR

1. Keep the change focused.
2. Avoid committing credentials, auth files, sessions, logs, private product docs, or local paths.
3. Run:

   ```bash
   npm run check
   ```

   This runs the contract checker and all bundled `node:test` suites. Use
   `npm run check:quick` for a fast contract-only iteration and
   `npm run check:release` before preparing a release.

4. If you changed Docker files, also run:

   ```bash
   docker compose -f docker/open-design/docker-compose.yml config
   ```

5. Update README or docs when behavior changes.

## Project conventions

- `open-design` is the only skill wrapper bundled locally.
- Superpowers is referenced through the upstream OpenCode plugin, not vendored.
- Impeccable is optional and user-installed.
- Free-form messages should use direct developer mode for small changes.
- Slash commands are explicit workflow contracts.
- AHE sidecars are optional and should not be inserted into normal feature flow.

## Pull request checklist

- [ ] The change is scoped and documented.
- [ ] `npm run check` passes, including all bundled `node:test` suites.
- [ ] No secrets, auth files, sessions, logs, or private paths are included.
- [ ] Public behavior changes are reflected in README/docs.
