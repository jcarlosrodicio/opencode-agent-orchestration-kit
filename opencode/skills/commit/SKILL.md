---
name: commit
description: Use when the user asks to commit or open a pull request, or when /autonomous reaches delivery - produces atomic commits that stage explicit paths only, with messages and a pull-request body written from the actual diff.
phase: ship
domains:
  - release
stacks:
  - any
allowed_agents:
  - developer
skill_source: built-in
origin: null
status: active
---

# Commit

## When it runs

Outside `/autonomous`, commit only when the human asks for it. Under
`/autonomous`, this skill runs at delivery.

Pushing a branch and opening a pull request happen **only** through
`oak deliver`. Never run `git push` or `gh pr create` yourself.

## Branch

Work on a feature branch that follows the repository's naming convention, never
on the default branch. If the repository has no convention, ask. Under
`/autonomous`, use `<type>/<slug>` and record that decision in the autonomy log.

## Stage

1. Run `git status` first.
2. Stage explicit paths only. Never use `git add -A`, `git add .`,
   `git add -u` or `git commit -a`.
3. List any unrelated change you see, and leave it unstaged. Never stash,
   revert or overwrite someone else's work.
4. Read the staged diff (`git diff --cached`) and check it for secrets, tokens,
   `.env` values and absolute machine paths before committing.

## Commit

- One logical change per commit.
- English, imperative mood. Subject line `<type>: <summary>` under 72
  characters, where type is one of `feat`, `fix`, `refactor`, `test`, `docs`,
  `chore` or `perf`.
- The body explains why first, then anything a later reader needs to know.
- Write the message from the staged diff only, not from memory of the session.
- Never claim that tests pass unless they ran in this session.
- Never bypass hooks (`--no-verify`, `-n`). If a hook fails, fix the cause.

## Pull-request body

Use these sections:

- **What**: the change, in one paragraph.
- **Why**: the problem it solves.
- **How**: the approach and the decisions that shaped it.
- **Verification**: the commands actually run, and what was not covered.
- **Risk**: what could break, and how to roll it back.

Link task artifacts and reports instead of copying them into the body. Write the
body to a file and pass it to `oak deliver`.
