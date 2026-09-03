# Models

Configure models through environment variables:

```bash
export OPENCODE_MODEL="openai/gpt-5.5"
export OPENCODE_SMALL_MODEL="$OPENCODE_MODEL"
```

Each role can be overridden independently:

```bash
export OPENCODE_RESEARCHER_MODEL="openai/gpt-5.5"
export OPENCODE_REVIEWER_MODEL="openai/gpt-5.5"
```

## Interactive switching

Run `npm run oc-switch` from a checkout, or install the published CLI globally
with npm:

```bash
npm install --global opencode-agent-orchestration-kit
oc-switch
```

To install the current checkout instead:

```bash
npm install --global .
oc-switch
```

Once a release tag exists, a checkout is optional:

```bash
npm install --global "git+https://github.com/jcarlosrodicio/opencode-agent-orchestration-kit.git#v1.0.43"
oc-switch
```

The TUI reads available models from OpenCode's own local `opencode models --pure`
catalog and discovers configured providers through OpenCode; it does not use
Pi's catalog. Startup is cache-first. Press `r` to request an explicit remote
refresh with `opencode models --pure --refresh`.

`Default` changes `OPENCODE_MODEL`, `Small/title` changes
`OPENCODE_SMALL_MODEL`, and agent rows change their corresponding
`OPENCODE_<AGENT>_MODEL` override. Press `Enter` or `/` to open the picker;
while it is open, all printable letters—including `q`, `r`, and `s`—filter the
catalog. Use `Enter` to apply, `Esc` to go back, `s` to save, and `q` to save
and exit. `Space` marks several agents for one assignment. The state is kept
under the XDG state directory and the model variables are updated in the
managed block of `.zshrc` or `.bashrc`.

Keep provider credentials in your shell, password manager, or OpenCode auth flow. Do not commit credentials.
