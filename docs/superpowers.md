# Superpowers

Superpowers is enabled through the OpenCode plugin:

```json
{
  "plugin": ["superpowers@git+https://github.com/obra/superpowers.git"]
}
```

It provides workflow skills for:

- brainstorming;
- writing plans;
- executing plans;
- test-driven development;
- systematic debugging;
- verification before completion;
- requesting and receiving code review;
- finishing a development branch.

The kit uses Superpowers as discipline for the orchestrator, developer, and reviewer. It is not used by `designer`, which is intentionally restricted to `open-design` and `impeccable`.

To pin a version:

```json
{
  "plugin": ["superpowers@git+https://github.com/obra/superpowers.git#v5.0.5"]
}
```
