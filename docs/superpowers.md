# Superpowers

Superpowers is not vendored in this repository.

The starter config references it through the upstream OpenCode plugin:

```json
{
  "plugin": ["superpowers@git+https://github.com/obra/superpowers.git#d884ae04edebef577e82ff7c4e143debd0bbec99"]
}
```

The commit is the immutable identifier reviewed for upstream release `v6.1.1`.
When OpenCode starts, the plugin is resolved from upstream if plugin support
and network access are available. If you keep an existing `opencode.json`, you
must add this exact plugin entry yourself.

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

Do not replace the commit with a tag-only reference. Updates follow the
[reviewed supply-chain checklist](supply-chain.md):

```json
{
  "plugin": ["superpowers@git+https://github.com/obra/superpowers.git#d884ae04edebef577e82ff7c4e143debd0bbec99"]
}
```

Superpowers remains experimental. The default-config smoke proves this exact
starter pin loads, while the supported core smoke runs without it.
