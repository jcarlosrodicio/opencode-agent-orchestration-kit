# Slice 1.4 Compatibility Matrix Design

**Status:** Draft for review
**Date:** 2026-07-21
**Repository:** `opencode-agent-orchestration-kit`
**Predecessors:** Slice 1.1 CI coverage, Slice 1.2 safe lifecycle, Slice 1.3 canonical release identity

## Summary

Slice 1.4 will replace the repository's broad compatibility claims with an
evidence-backed contract for Node.js, OpenCode, operating systems, the plugin
SDK, and optional integrations.

The public contract will distinguish four terms:

- `tested`: an exact combination has current automated or explicitly recorded
  evidence;
- `supported`: the project accepts compatibility defects for the declared
  range, backed by tested boundaries or representative environments;
- `experimental`: the integration may work, but failures do not block a
  release and compatibility is not promised;
- `unsupported`: the project does not claim the combination works.

The supported OpenCode policy approved for this slice is
`>=1.14.41 <2.0.0`. It becomes an actual release claim only when the minimum
and the pinned current-stable boundary both pass the core smoke. Exact versions
executed by CI are `tested`; `opencode-ai@latest` remains a non-blocking canary.

## Problem

The current repository says that the core kit requires OpenCode and lists its
optional integrations, but it does not answer the operational questions a user
needs before installing:

- which Node.js lines are supported;
- which OpenCode range is supported and which versions were actually tested;
- whether the plugin SDK and OpenTUI pins match that claim;
- which macOS and Linux environments have evidence;
- whether native Windows or WSL is supported;
- whether optional integrations are release-blocking;
- what happens when upstream OpenCode changes.

The existing CI runs only on Ubuntu with Node.js 24. A local preflight on
macOS ARM64 with Node.js 24.14.1 and OpenCode 1.18.3 passed all 295 tests,
typecheck, and installation smoke, but local evidence must not be presented as
an evergreen CI guarantee.

## Goals

1. Publish one precise compatibility matrix with explicit status semantics.
2. Make Node.js and OpenCode compatibility mechanically verifiable.
3. Exercise the supported Node.js lines on Linux and macOS in blocking CI.
4. Exercise the lower OpenCode boundary and one pinned current-stable version
   without provider credentials or optional network plugins.
5. Add a non-blocking canary against `opencode-ai@latest`.
6. Record the exact plugin SDK and OpenTUI versions shipped by the kit.
7. Classify optional integrations without turning them into core requirements.
8. Prevent documentation, package metadata, and workflows from drifting apart.

## Non-goals

- Updating OpenCode, `@opencode-ai/plugin`, OpenTUI, or optional integrations.
- Claiming native Windows support for the Bash lifecycle wrappers.
- Building a WSL runner or a custom self-hosted CI fleet.
- Testing every Linux distribution, CPU architecture, shell, model provider,
  or OpenCode version inside the supported interval.
- Automatically opening issues, updating dependencies, or publishing releases
  from the canary.
- Resolving the remaining low-severity dependency advisories. Those belong to
  Slice 1.5 because npm proposes incompatible dependency changes.
- Pinning the unpinned Superpowers Git reference. That is also Slice 1.5 work.

## Decisions considered

### A. Evidence-backed range with tested boundaries — selected

Declare a supported OpenCode range, test its minimum and a pinned stable
version, and list the exact executions separately. This provides a useful
promise while keeping the evidence visible.

### B. Exact versions only

Declare only the exact OpenCode and Node.js versions executed in CI. This is
maximally conservative but would make the compatibility contract obsolete on
every upstream patch and provide little value to users.

### C. Rolling latest only

Test only the latest OpenCode release. This is simple but cannot defend the
minimum-version claim and would allow upstream releases to redefine the kit's
support policy without review.

## Canonical compatibility data

A new root `compatibility.json` will be the machine-readable source for values
that have more than one consumer. It will remain deliberately small and will
not become a general feature-flag system.

It will contain:

```json
{
  "schema_version": 1,
  "node": {
    "engines": "^22.9.0 || ^24.0.0",
    "blocking_majors": [22, 24],
    "canary_major": 26
  },
  "opencode": {
    "supported_range": ">=1.14.41 <2.0.0",
    "minimum_tested": "1.14.41",
    "stable_tested": "1.18.4",
    "canary": "latest"
  },
  "sdk": {
    "opencode_plugin": "1.14.41",
    "opentui_core": "0.2.5",
    "opentui_solid": "0.2.5"
  }
}
```

`stable_tested` means the latest stable version deliberately pinned and proven
when the compatibility contract was last updated. It is not an alias for the
registry's moving `latest` tag. A later stable OpenCode release first appears
in the canary and becomes `stable_tested` only through a reviewed change.

The checker will require:

- both `package.json` files to use the exact Node `engines` value;
- `opencode/package.json` dependency pins to match `sdk`;
- the blocking CI matrix to contain exactly the declared Node majors;
- the OpenCode smoke matrix to contain `minimum_tested` and `stable_tested`;
- the canary to use the declared moving tag and remain non-blocking;
- the human matrix to expose the same range and exact versions.

This avoids several independent sources of compatibility truth while keeping
the normal package and workflow files readable.

## Initial public matrix

The implementation will publish the following statuses. `tested` entries must
include the exact version and environment emitted by CI; broad families remain
`supported`, not `tested`.

| Surface | Status | Contract |
|---|---|---|
| Node.js 22 | supported | 22.9.0 or newer within major 22; blocking CI |
| Node.js 24 | supported | major 24; blocking CI |
| Node.js 26 | experimental | non-blocking canary only |
| Node.js 20 and EOL/odd lines | unsupported | no release guarantee |
| OpenCode 1.14.41 | tested | minimum boundary in the blocking core smoke |
| OpenCode 1.18.4 | tested | pinned stable boundary in the blocking core smoke |
| OpenCode >=1.14.41 <2.0.0 | supported | boundary-tested compatibility promise |
| OpenCode <1.14.41 or >=2.0.0 | unsupported | requires a reviewed policy change |
| `@opencode-ai/plugin` 1.14.41 | tested | exact pin with install, import, and typecheck evidence |
| OpenTUI core/solid 0.2.5 | tested | exact pins with install, import, and typecheck evidence |
| Ubuntu GitHub runner | tested | blocking Node 22 and 24 jobs |
| macOS GitHub runner | tested | blocking Node 24 job; runner details recorded |
| Other mainstream Linux/macOS environments | supported | Bash, Node, and OpenCode must support the host |
| WSL2 | experimental | recommended upstream path, no kit-owned runner |
| Native Windows | unsupported | Bash lifecycle wrappers have no native contract |
| Token usage plugin | experimental | compile/import is tested; runtime session-tree behavior is not stable API evidence |
| Open Design Docker adapter | experimental | optional pinned image inputs, no blocking integration smoke |
| Superpowers | experimental | optional upstream Git plugin, not part of core smoke |
| Impeccable | experimental | optional externally installed skill |

The documentation must explain that `tested` is not a superset of
`supported`: it records exact evidence, while `supported` is the maintained
promise derived from that evidence.

## Blocking CI design

The existing workflow will keep one release-required suite but expand its
runtime evidence to these combinations:

```text
ubuntu-latest / Node 22
ubuntu-latest / Node 24
macos-latest  / Node 24
```

Each blocking combination will run:

1. checkout;
2. setup of the selected Node.js line;
3. `npm --prefix opencode ci`;
4. contract check and all `node:test` suites;
5. token-plugin typecheck;
6. installation smoke.

Dependency audit and tag/version validation need run only once on the canonical
Ubuntu/Node 24 job. Their result remains release-blocking. The workflow must
not publish packages, create tags, or mutate repository contents.

The job will print the exact OS, architecture, Node.js, npm, OpenCode, plugin
SDK, and OpenTUI versions used. Documentation may cite a combination as
`tested` only when a current blocking job emits that evidence successfully.

## OpenCode core smoke

The core smoke will run on Ubuntu/Node 24 for the two declared OpenCode
boundaries. It will install the requested CLI version in an isolated temporary
environment and must not use the operator's global config, credentials, cache,
state, or inherited provider environment.

For each boundary it will verify:

```text
opencode --version
opencode debug agent lead --pure
```

The smoke will invoke OpenCode through an environment allowlist rather than
inheriting the caller's environment. It will preserve only the executable
`PATH` plus these temporary or explicit values:

```text
HOME
XDG_CONFIG_HOME
XDG_DATA_HOME
XDG_CACHE_HOME
XDG_STATE_HOME
npm_config_cache
OPENCODE_CONFIG_DIR
```

Every home, XDG, npm cache, and config path will live under one fresh temporary
root. Before invoking OpenCode, the smoke will copy the shipped `opencode/`
tree into that root while excluding generated or mutable directories such as
`node_modules` and `.oak`; `OPENCODE_CONFIG_DIR` will point at this isolated
copy. The copy must come from the working tree so local pre-commit validation
exercises the implementation being reviewed rather than `HEAD`.

The script must clear inherited provider/API variables by constructing this
allowlisted environment, clean the temporary root on exit, and reject output
containing the caller's original home or repository path. The smoke must not
use a symlink back to the checkout because OpenCode resolves skill locations
to absolute paths in `debug agent` output.

OpenCode's `--pure` flag disables external plugins, so the core smoke does not
fetch Superpowers, contact Open Design, or require a model provider. The smoke
deliberately avoids `debug config` because resolved configuration output is
unnecessary for the acceptance criteria and creates avoidable disclosure risk.
It must assert the exact CLI version and the presence of the shipped `lead`
agent; a zero exit alone is insufficient.

The core smoke does not prove the token-usage plugin runtime contract because
`--pure` intentionally excludes plugin execution. Token plugin install,
import, and typecheck remain blocking checks; session-tree behavior remains
experimental.

## Canary design

A separate scheduled and manually dispatchable workflow will run
`opencode-ai@latest` with the same isolated pure core smoke on Ubuntu/Node 26.

The canary will:

- use `continue-on-error` or an equivalent job-level non-blocking contract;
- print the resolved OpenCode version;
- read Node 26 from `compatibility.json.node.canary_major` through the same
  checked workflow contract used by the blocking matrix;
- never modify `compatibility.json`;
- never update dependencies, open issues, publish packages, or create tags;
- fail visibly in its own workflow while leaving branch and release checks
  unaffected.

Keeping the canary in a separate workflow makes its non-blocking semantics
auditable and prevents conditional logic from weakening the blocking workflow.

## Compatibility checker

A focused Node.js checker and `node:test` suite will validate the compatibility
contract. The checker will be invoked by the fast contract check.

It will reject:

- malformed or unknown compatibility schema versions;
- status terms outside the four defined values;
- Node engine drift between root and packaged harness manifests;
- dependency-pin drift from the canonical SDK fields;
- missing or extra blocking Node majors;
- missing OpenCode boundary jobs;
- a canary Node version that differs from `node.canary_major`;
- a canary that is release-blocking or uses a fixed version instead of the
  declared moving tag;
- README or compatibility documentation that omits the supported OpenCode
  range, supported Node lines, native Windows status, or optional-integration
  boundary.

The checker will inspect committed files only. It will not query npm, GitHub,
or OpenCode at contract-check time.

## Documentation

`docs/compatibility.md` will be the complete human contract. The README's
existing compatibility section will become a concise summary linking to it.

The documentation will include:

- definitions of all four status terms;
- the matrix and exact evidence date/version fields;
- supported Node and OpenCode ranges;
- native Windows and WSL distinctions;
- the plugin SDK/OpenTUI pins;
- optional-integration classifications;
- how to interpret a failed latest canary;
- how maintainers promote a canary version to `stable_tested`;
- a statement that model-provider compatibility is outside this matrix.

Installation documentation will refer to the Node engine contract instead of
the current unversioned “Node.js and npm” requirement.

## Failure behavior

- A blocking matrix failure blocks branch/tag validation and release readiness.
- A minimum OpenCode smoke failure invalidates the supported lower bound and
  blocks the slice until the bound or implementation is corrected.
- A pinned stable smoke failure blocks the slice and any release claiming that
  version as tested.
- A latest canary failure is visible but does not block ordinary CI or release
  checks. Maintainers decide whether to update compatibility, fix the kit, or
  wait for upstream.
- An unavailable npm registry fails the blocking boundary smoke because the
  evidence was not produced. The canary remains non-blocking.
- No failure path may fall back to the user's installed OpenCode binary or
  credentials.

## Files expected to change

Public repository only:

- `compatibility.json` (new);
- `docs/compatibility.md` (new);
- `README.md`;
- `docs/installation.md`;
- `package.json`;
- `opencode/package.json`;
- `.github/workflows/check.yml`;
- `.github/workflows/compatibility-canary.yml` (new);
- `scripts/check-compatibility.mjs` (new);
- `scripts/check-compatibility.test.mjs` (new);
- `scripts/opencode-compat-smoke.sh` (new);
- `scripts/check.sh`.

`opencode/package-lock.json` changes only if adding `engines` through npm
causes a deterministic lockfile metadata update. Dependency versions must not
change as part of Slice 1.4.

The active private OpenCode configuration checkout is explicitly out of scope.
No provider, MCP, credential, raw transcript, absolute local path, or
machine-specific config may enter the public diff.

## Acceptance criteria

1. The four compatibility statuses are defined once and used consistently.
2. Node.js 22 and 24 are declared supported and pass their blocking jobs.
3. Node.js 26 is experimental and appears only in a non-blocking canary.
4. Both package manifests expose the canonical Node engine range.
5. OpenCode 1.14.41 and 1.18.4 pass isolated pure core smokes.
6. The public contract declares `>=1.14.41 <2.0.0` supported only after both
   boundary smokes pass.
7. `@opencode-ai/plugin` and OpenTUI pins match the canonical compatibility
   data and remain unchanged.
8. Ubuntu and macOS have blocking evidence; native Windows is explicitly
   unsupported and WSL2 explicitly experimental.
9. Optional integrations cannot fail the core compatibility smoke.
10. The latest canary is scheduled/manual, visible, and non-blocking.
11. Mechanical tests fail when package, workflow, canary, or documentation
    compatibility values drift.
12. `npm run check:release` passes locally after the change.
13. The public leak scan is clean and the private checkout is unchanged.

## Validation envelope

Focused validation:

```bash
node --test scripts/check-compatibility.test.mjs
node scripts/check-compatibility.mjs
bash scripts/opencode-compat-smoke.sh 1.14.41
bash scripts/opencode-compat-smoke.sh 1.18.4
```

Full validation:

```bash
npm run check:release
git diff --check
```

Remote evidence:

```text
blocking Ubuntu/Node 22 success
blocking Ubuntu/Node 24 success
blocking macOS/Node 24 success
minimum OpenCode smoke success
pinned stable OpenCode smoke success
latest canary result recorded but not required for release readiness
```

## Security and privacy

Compatibility jobs use only public package metadata and the public harness.
They must not receive model-provider secrets. Temporary config, cache, state,
and npm directories are removed on exit. Logs must not print environment
variables or home-directory contents.

The public-sync leak scan remains mandatory before commit. The compatibility
checker must not embed developer paths, private endpoints, provider names,
local MCP wiring, or raw session evidence.

## Rollback

Slice 1.4 has no installation-state or manifest migration. Rollback is a normal
Git revert of the compatibility commit. Removing the new workflows and checker
restores the prior CI behavior; installed users are unaffected because the
payload format and lifecycle manager do not change.

## Residual risks

- Boundary testing cannot prove every OpenCode patch inside the supported
  interval.
- `--pure` validates the core config but deliberately does not prove optional
  plugin runtime behavior.
- GitHub-hosted environments do not represent every supported Linux or macOS
  host.
- WSL remains documentation-level experimental evidence until a reproducible
  runner exists.
- OpenCode 2.x, a future plugin API change, or a future Node.js LTS line will
  require an explicit compatibility update.
- The pinned SDK is older than the current OpenCode release line. This slice
  exposes that fact but does not silently upgrade it.

## Handoff to implementation planning

After this specification passes independent review and human approval, the
implementation plan must preserve this sequence:

1. add failing compatibility contract tests;
2. add canonical data and checker;
3. add documentation and package engines;
4. add isolated OpenCode smoke;
5. expand blocking CI;
6. add the separate non-blocking canary;
7. run focused, full, leak, and private-checkout validations;
8. request independent implementation review before any release action.

No push, tag, GitHub Release, or npm publication is part of Slice 1.4 unless
the user requests it separately after implementation is complete.
