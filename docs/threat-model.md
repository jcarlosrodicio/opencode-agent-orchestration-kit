# Threat Model

This is the canonical threat model for the public OpenCode Agent Orchestration
Kit. It inventories the assets and boundaries that the kit can affect, the
capabilities it declares, representative abuse cases, the controls that exist
today, and the risk that remains.

The model describes observed public contracts. OpenCode permission frontmatter
is a policy layer enforced by the OpenCode runtime; it is not an
operating-system sandbox. A test proves only the behavior and scope named by
that test.

Markdown is the sole source of truth. The tables below use stable IDs so
`scripts/check-threat-model.mjs` can detect structural drift without generating
or rewriting this document.

## Scope and security objectives

The modeled system includes the published package, its lifecycle scripts, the
portable OpenCode harness under `opencode/`, its agents and commands, durable
loop and handoff contracts, review preparation, AHE evidence handling, optional
plugins, Open Design, package checks, and the boundary used to prepare public
releases.

The principal objectives are:

- preserve human authorization for sensitive effects;
- protect workspace, configuration, state, evidence, and package integrity;
- keep private material out of public or network-facing surfaces;
- contain filesystem and tool effects to their declared scope;
- make important controls traceable to a test, check, or explicit limitation;
- keep managed mutations recoverable and resource use bounded where supported.

OpenCode, Node.js, Git, the operating system, and the authentic sources used to
verify pins, checksums, and signatures are part of the trusted computing base.
Their internal security is outside this kit's guarantees. Repository content,
external services, tool output, models, memory, and plugins are untrusted
inputs.

## Actors

| ID | Actor | Trust | Capabilities |
|---|---|---|---|
| AC-001 | Authorized operator or maintainer | Trusted only within the authority explicitly granted | Starts commands, approves gates, selects targets, accepts residual risk, and authorizes publication |
| AC-002 | Repository contributor or repository-controlled content | Untrusted | Controls source, diffs, documentation, filenames, links, and patches read by agents |
| AC-003 | Dependency, action, executable reference, or plugin | Untrusted until pinned and reviewed | Can execute code during installation, checks, CI, or agent runtime |
| AC-004 | Registry, Git host, MCP, model, tool, or remote service | External and untrusted | Returns artifacts, data, instructions, or failures across a network or tool boundary |
| AC-005 | Untrusted local process | Untrusted | Can race filesystem operations, replace paths, create symlinks, or contend for locks |
| AC-006 | Accidental operator | Partially trusted | Can select the wrong target, approve the wrong scope, omit checks, or publish the wrong artifact |

## Assets

| ID | Asset | Protection |
|---|---|---|
| A-001 | Operator intent and approval | Integrity, authenticity, and durable attribution |
| A-002 | User workspace and source files | Integrity, availability, and path containment |
| A-003 | Private configuration, secrets, credentials, and provider data | Confidentiality and integrity |
| A-004 | Agent permissions, routing, delegation, and workflow contracts | Integrity and traceability |
| A-005 | Handoffs, approvals, loop snapshots, histories, and locks | Integrity, authenticity, and recoverability |
| A-006 | Installation manifest, journal, backups, ownership, and rollback state | Integrity, confidentiality, and recoverability |
| A-007 | Review, evaluation, and AHE evidence | Integrity, confidentiality, and provenance |
| A-008 | Package contents, pins, checksums, tags, and release artifacts | Integrity, authenticity, and reproducibility |
| A-009 | Sessions, logs, plugin state, and runtime state | Confidentiality, integrity, and availability |
| A-010 | Boundary between private preparation and public publication | Confidentiality and data minimization |

## Trust boundaries

| ID | Boundary | Flow |
|---|---|---|
| TB-001 | Human to agent and HITL state | Requests, approvals, rejections, and authority enter the agent workflow |
| TB-002 | Repository content to instruction context | Diffs, documents, source, filenames, and patches enter prompts and reviews |
| TB-003 | Agent to tool, filesystem, shell, network, and delegated task | A model decision can become a local or external effect |
| TB-004 | Public package to installed target | Versioned package files can mutate a local installation |
| TB-005 | Managed source to user-owned target files | Lifecycle ownership rules decide whether existing files are preserved or replaced |
| TB-006 | Local runtime to registry, Git, plugin, MCP, model, web, or Open Design | Data and executable material cross an external-service boundary |
| TB-007 | Raw session or evidence to sanitized artifact | Potentially private data is reduced for checks, reports, or publication |
| TB-008 | Private preparation to public sync and release | Only portable reviewed material may enter the public repository or package |
| TB-009 | Temporary workspace or process state to persistent filesystem | Reviews, journals, locks, backups, histories, sessions, and caches can survive a process |

## Agent capabilities

The executable source for each row is the corresponding frontmatter file. Shell
summaries name the default and important exceptions rather than duplicating
every glob. Network combines `webfetch` and `websearch`.

| Agent | Edit | Shell | Network | External directory | Delegation | Role | Source |
|---|---|---|---|---|---|---|---|
| debugger | Deny except `docs/ai/evolution/**` | Ask by default; Git status, diff, and log allowed | Allow | Deny | None | Optional trace and root-cause sidecar | opencode/agents/debugger.md |
| designer | Ask | Ask by default; navigation allowed | Allow | Deny | None | UX, visual design, and Open Design handoff | opencode/agents/designer.md |
| developer | Allow | Ask by default; declared test, lint, typecheck, and Git inspection commands allowed | Ask | Deny | None | Approved implementation and validation | opencode/agents/developer.md |
| evaluator | Deny except `docs/ai/evolution/**` | Ask by default; declared evaluation and validation commands allowed | Ask | Deny | None | Optional benchmark and smoke sidecar | opencode/agents/evaluator.md |
| evolver | Deny except `docs/ai/evolution/**` | Ask by default; Git inspection allowed | Ask | Deny | None | Evidence-based harness evolution sidecar | opencode/agents/evolver.md |
| lead | Deny | Ask by default; read-only Git, navigation, search, and evidence collection exceptions | Allow | Deny | designer, researcher, specifier, developer, reviewer, evaluator, debugger, evolver | Primary product-development orchestrator | opencode/agents/lead.md |
| researcher | Ask | Ask by default; Git inspection allowed | Allow | Deny | None | Technical and product research | opencode/agents/researcher.md |
| review_api | Deny | Ask by default; Git inspection allowed and RTK remains gated | Deny | Deny | None | Focused API and compatibility review | opencode/agents/review_api.md |
| review_coordinator | Deny | Ask by default; deterministic review preparation allowed | Deny | Deny | review_quality, review_security, review_tests, review_api | Primary review coordinator | opencode/agents/review_coordinator.md |
| review_quality | Deny | Ask by default; Git inspection allowed and RTK remains gated | Deny | Deny | None | Focused correctness and maintainability review | opencode/agents/review_quality.md |
| review_security | Deny | Ask by default; Git inspection allowed and RTK remains gated | Deny | Deny | None | Focused security and supply-chain review | opencode/agents/review_security.md |
| review_tests | Deny | Ask by default; Git inspection and declared test commands allowed | Deny | Deny | None | Focused test and regression review | opencode/agents/review_tests.md |
| reviewer | Deny | Ask by default; declared validation and Git inspection commands allowed | Ask | Deny | None | Senior diff and specification review | opencode/agents/reviewer.md |
| scoper | Deny except ask under `docs/ai/**` | Ask by default; Git inspection allowed | Allow | Deny | researcher, specifier | Primary research-to-spec orchestrator | opencode/agents/scoper.md |
| specifier | Ask | Ask by default; Git status and diff allowed | Allow | Deny | None | Specifications, tasks, acceptance criteria, and validation plans | opencode/agents/specifier.md |

These declarations limit the behavior OpenCode should permit. They do not stop a
compromised runtime, dependency, operating-system process, or already-authorized
shell command from acting with the privileges of the user account.

## External surfaces

| Surface | Boundary | Controls or limitations |
|---|---|---|
| npm registry and package metadata | TB-006 | Exact dependency versions, lockfile integrity, dependency audit, signature audit, and package smoke reduce drift; registry compromise remains possible |
| Git repositories and external references | TB-006 | Immutable commit pins and supply-chain checks reject unsupported mutable references |
| GitHub Actions | TB-006 | Third-party actions are pinned and checked; the CI host and pinned upstream remain trusted dependencies |
| OpenCode plugin runtime | TB-003<br>TB-006 | Plugin dependencies are scoped and pinned; optional plugin behavior remains partly experimental |
| Superpowers upstream plugin | TB-006 | The installation contract uses a reviewed immutable Git reference and explicit approval for changes |
| Open Design service and container | TB-003<br>TB-006 | Documentation recommends local or authenticated network exposure; the service can execute agents and write workspace files |
| Agent web access | TB-003<br>TB-006 | Frontmatter asks, allows, or denies web tools per role; fetched content remains untrusted |
| MCP, memory, models, and tool output | TB-003<br>TB-006 | Persistent memory is a hint rather than truth; no general content-isolation guarantee exists |
| Package, tag, and release publication | TB-008 | Version checks, exact tarball smoke, canonical checksum, and separate human authorization reduce artifact mismatch |

## Persistence surfaces

| Surface | Owner | Sensitivity | Lifecycle | Controls or limitations |
|---|---|---|---|---|
| `.oak` manifest, journal, backups, rollback, and lock | Lifecycle manager and operator | May contain ownership metadata and copies of replaced private bytes | Created and updated transactionally; backups support rollback; uninstall follows ownership | No-follow checks, target containment, restrictive backup modes, journal recovery, and exclusive lock; retention is operator-managed |
| `.opencode/loops` snapshots, histories, and locks | Loop state tool and operator | Approved contract, progress, hashes, and execution history | Initialized, resumed, appended, repaired, migrated, and released through the loop-state tool | Contract hashes, append-only validation, idempotent action IDs, locks, and symlink containment |
| `.opencode/handoffs` | Harness workflow and operator | Durable human approval and task context | Written at approval boundaries and read when work resumes | Approval status is explicit; filesystem access by other local processes remains possible |
| AHE raw and session evidence | Evaluator, debugger, and operator | Potentially contains prompts, paths, code, tool output, or secrets | Collected privately, analyzed, and reduced into publishable artifacts | Sanitization and private/raw boundary are policy controls; retention and deletion depend on the operator |
| Review temporary workspace | Review preparation scripts | Patch content, filenames, findings, and metadata | Created for deterministic review preparation and cleaned after use | Safe path handling, patch delimiters, size budgets, timeouts, and network-restricted review roles |
| OpenCode sessions, logs, and credentials | OpenCode runtime and operator | Highly sensitive | Managed by OpenCode outside this kit's lifecycle | Must stay out of Git and public artifacts; OpenCode storage guarantees are outside scope |
| Optional plugin caches and runtime state | Plugin runtime and operator | Usage metadata and runtime-derived values | Created and retained according to the plugin and OpenCode runtime | Optional and partly experimental; not all plugin state is covered by core package smoke |

## Data flows

1. **Request to effect.** Operator intent crosses TB-001 into routing, then an
   agent decision crosses TB-003 into a tool, filesystem, shell, network call,
   or delegated task.
2. **Durable approval.** A human decision crosses TB-001 into a handoff or loop
   contract that can survive a restarted process through TB-009.
3. **Installation.** Public package material crosses TB-004 and TB-005 into a
   target, with ownership, journal, backup, conflict, and rollback decisions.
4. **Review.** Repository-controlled diff and filenames cross TB-002 into a
   temporary review workspace, then findings cross TB-007 into sanitized output.
5. **Evidence reduction.** Private raw sessions and evidence cross TB-007 only
   after minimization into a publishable contract or aggregate.
6. **Public sync and release.** Portable selected files cross TB-008 into the
   public repository, package, tag, and release after leak and artifact checks.
7. **External interaction.** A local agent, tool, or plugin crosses TB-006 to a
   registry, Git host, web page, model, MCP, or Open Design and receives an
   untrusted response.

## Risk register

Severity describes operational priority within this system, not a calculated
CVSS score. `partially-mitigated` means that useful controls exist but do not
eliminate the documented abuse. No row is accepted on behalf of the maintainer.

| ID | Title | Actor or input | Assets | Boundaries | Abuse | Severity | Controls | Evidence | Status | Residual | Authority | Review trigger |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| TM-001 | Prompt injection from a diff or patch | AC-002 | A-001<br>A-002<br>A-007 | TB-002<br>TB-003 | Patch text is treated as an instruction and causes an unauthorized tool or review action | high | Review prompts delimit patch data, repository content is declared untrusted, and focused roles restrict edits and network | test:opencode/scripts/adversarial-harness.test.mjs diff-injection-is-data<br>check:opencode/AGENTS.md untrusted repository rule | partially-mitigated | Models can still follow hostile content within an otherwise allowed action | maintainer | Prompt, review preparation, model, or permission change |
| TM-002 | Hostile instructions in repository documentation | AC-002 | A-001<br>A-002<br>A-004 | TB-002<br>TB-003 | A repository document attempts to override active instructions or expand authority | high | Loaded instruction files remain authoritative while ordinary repository documents are treated as data | test:opencode/scripts/adversarial-harness.test.mjs repo-doc-is-data<br>check:opencode/AGENTS.md instruction precedence | partially-mitigated | Natural-language separation depends on model and runtime behavior | maintainer | Instruction-loading or prompt hierarchy change |
| TM-003 | Hostile web, tool, MCP, model, or memory content | AC-004 | A-001<br>A-002<br>A-003<br>A-004 | TB-003<br>TB-006 | External output injects instructions, false facts, or malicious payloads into an agent decision | high | Network access is role-scoped and memory is explicitly a hint rather than truth | check:opencode/scripts/check-harness.mjs permission contracts<br>limitation:no general isolation of external content | partially-mitigated | Allowed external content can influence agents and tools | maintainer | New MCP, model, tool, plugin, or web-enabled role |
| TM-004 | Unauthorized write, delegation, or confused deputy | AC-002<br>AC-004 | A-001<br>A-002<br>A-004 | TB-001<br>TB-003 | A less-authorized input induces a more-authorized agent or delegated task to perform an effect | high | Closed orchestration contracts, task allowlists, edit permissions, workflow barriers, and completion authority are checked | check:opencode/scripts/check-harness.mjs orchestration contracts<br>limitation:delegated authority is enforced as policy, not capability tokens | partially-mitigated | Authority context can be misunderstood across natural-language handoffs | maintainer | Agent, delegation, routing, or approval contract change |
| TM-005 | Shell allowlist or wrapper bypass | AC-002<br>AC-003 | A-002<br>A-003<br>A-004 | TB-003 | An allowed wrapper or command pattern carries arguments that produce an unreviewed effect | high | Shell defaults to ask and wrapper arguments remain gated by declared patterns | test:opencode/scripts/adversarial-harness.test.mjs rtk-wrapper-needs-approval<br>check:opencode/scripts/check-harness.mjs shell permission contracts | partially-mitigated | Correctness depends on OpenCode matcher and shell semantics | maintainer | Shell matcher, wrapper, or allowlist change |
| TM-006 | Network exfiltration during agent or review work | AC-002<br>AC-004 | A-002<br>A-003<br>A-007 | TB-003<br>TB-006 | Readable workspace or evidence data is sent through an allowed network tool | high | Focused reviewers deny network and other roles ask or allow it explicitly; review policy treats secret-like data as sensitive | test:opencode/scripts/adversarial-harness.test.mjs review-network-not-allowed<br>check:opencode/scripts/check-harness.mjs reviewer network permissions | partially-mitigated | Network-enabled agents can expose data they are already authorized to read | maintainer | Network permission, review role, or tool change |
| TM-007 | Filesystem escape by symlink, traversal, or race | AC-002<br>AC-005 | A-002<br>A-003<br>A-006 | TB-004<br>TB-005<br>TB-009 | A managed path resolves outside the intended root or changes between validation and use | high | Lifecycle and state tools reject external symlinks, unsafe relative paths, and uncontained targets; locks reduce races | test:opencode/scripts/adversarial-harness.test.mjs external-symlink-rejected<br>test:opencode/scripts/adversarial-harness.test.mjs path-traversal-rejected<br>test:scripts/manage-installation.test.mjs containment cases | partially-mitigated | OS-level races and compromised local processes cannot be eliminated by path checks alone | maintainer | Filesystem, archive, target-resolution, or temporary-file change |
| TM-008 | Hostile filenames, control characters, or archive paths | AC-002<br>AC-003 | A-002<br>A-007<br>A-008 | TB-002<br>TB-004<br>TB-009 | A filename corrupts a review payload, escapes an archive root, or changes command interpretation | high | Review path validation rejects control characters and package smoke rejects unsafe archive names and entry types | test:opencode/scripts/adversarial-harness.test.mjs control-filename-rejected<br>test:scripts/package-smoke.test.mjs archive validation | partially-mitigated | Filesystem and tool-specific filename semantics vary by platform | maintainer | Review path, archive, tar, or platform-support change |
| TM-009 | Approval or durable-state tampering, corruption, or replay | AC-002<br>AC-005 | A-001<br>A-005 | TB-001<br>TB-009 | Stored approval is altered, an event is repeated, or a stale contract resumes as current authority | high | Approved-contract hashes, append-only validation, idempotent action IDs, journals, locks, and explicit approval status detect key mutations | test:opencode/scripts/adversarial-harness.test.mjs approval-hash-is-immutable<br>test:opencode/scripts/adversarial-harness.test.mjs repeated-event-rejected<br>test:opencode/scripts/loop-state.test.mjs durable-state cases | partially-mitigated | A process with the user's filesystem privileges can alter or delete state and force recovery | maintainer | Handoff, loop schema, hash, journal, lock, or resume change |
| TM-010 | Secret leakage in patches, reviews, or sanitization | AC-002<br>AC-006 | A-003<br>A-007<br>A-010 | TB-002<br>TB-007<br>TB-008 | Secret-like content reaches a review payload, evidence artifact, commit, or public package | high | Secret-risk classification, evidence sanitization rules, public leak scan, and package forbidden-state checks reduce exposure | test:opencode/scripts/adversarial-harness.test.mjs credential-canary-stays-local<br>check:scripts/check.sh public leak scan<br>test:scripts/package-smoke.test.mjs forbidden state | partially-mitigated | Pattern checks cannot identify every secret or semantic disclosure | maintainer | Evidence, review, leak-pattern, package-content, or publication change |
| TM-011 | Raw session or evidence disclosure | AC-004<br>AC-006 | A-003<br>A-007<br>A-009<br>A-010 | TB-007<br>TB-008 | Raw prompts, tool output, logs, or transcripts are copied into a public artifact | high | Raw evidence is private by contract and public artifacts must be sanitized and minimized | check:opencode/docs/ai/harness/evidence.md evidence boundary<br>limitation:sanitization retains human review and cannot prove all semantic data is removed | partially-mitigated | Accidental copying or incomplete redaction remains possible | maintainer | Evidence collector, sanitizer, report, or sync workflow change |
| TM-012 | Sensitive bytes retained in backups or persistent state | AC-005<br>AC-006 | A-003<br>A-006<br>A-009 | TB-005<br>TB-009 | Replaced private files survive in backups, histories, logs, or plugin caches longer than expected | medium | Lifecycle backups use restrictive modes and managed cleanup follows explicit ownership | test:scripts/manage-installation.test.mjs backup and rollback cases<br>limitation:operator controls host access and retention | partially-mitigated | Restrictive permissions do not erase data or protect against the same user account | maintainer | Backup, retention, uninstall, logging, or cache change |
| TM-013 | Malicious or mutable dependency, action, plugin, or external reference | AC-003<br>AC-004 | A-002<br>A-003<br>A-008 | TB-004<br>TB-006 | A changed upstream reference or compromised package executes with developer privileges | high | Exact pins, immutable Git references, lock integrity, checksums, audits, and explicit approval are checked | test:opencode/scripts/adversarial-harness.test.mjs unpinned-ref-needs-approval<br>test:scripts/check-supply-chain.test.mjs pin mutations<br>check:scripts/check-supply-chain.mjs | partially-mitigated | An authentic pinned upstream or registry account can still be compromised | maintainer | Dependency, action, plugin, registry, pin, or override change |
| TM-014 | Experimental plugin behavior outside core smoke | AC-003<br>AC-004 | A-002<br>A-009 | TB-003<br>TB-006 | An optional plugin reads runtime state, fails unexpectedly, or gains behavior not exercised by installation smoke | medium | Plugin dependencies are scoped and typechecked; optional status is documented | check:package.json typecheck contract<br>limitation:plugin runtime is not covered by every core smoke | partially-mitigated | Runtime integration and OpenCode plugin APIs can change independently | maintainer | Plugin code, SDK version, or OpenCode compatibility change |
| TM-015 | Unsafe Open Design exposure or agent execution | AC-004<br>AC-006 | A-002<br>A-003<br>A-009 | TB-003<br>TB-006 | A reachable Open Design service accepts work that executes an agent against a sensitive workspace | high | Security docs require local, trusted, VPN, or authenticated exposure and warn that agents can write files | check:SECURITY.md supported use<br>check:docs/security.md Open Design guidance<br>limitation:network authentication is operator-provided | partially-mitigated | Public exposure, weak authentication, or a wrongly selected workspace can still lead to compromise | maintainer | Open Design service, container, networking, or tool-registration change |
| TM-016 | Installation ownership conflict or incomplete rollback | AC-005<br>AC-006 | A-002<br>A-006 | TB-004<br>TB-005<br>TB-009 | Installation overwrites user-owned content, loses ownership provenance, or cannot restore an interrupted mutation | high | Manifest ownership, preserved files, backups, transaction journal, lock, conflict detection, and rollback checks constrain mutation | test:scripts/manage-installation.test.mjs ownership and rollback cases<br>check:scripts/oak.mjs check command | partially-mitigated | Disk failure, manual state editing, or missing backups can prevent complete recovery | maintainer | Lifecycle schema, ownership, transaction, install, upgrade, uninstall, or rollback change |
| TM-017 | Version, tag, package, checksum, and release mismatch | AC-006 | A-008<br>A-010 | TB-004<br>TB-008 | A different commit or tarball is tagged, checksummed, uploaded, or published than the artifact that passed checks | high | Version contract, package snapshot, canonical checksum, exact tarball smoke, and separate publication authorization reduce mismatch | test:scripts/package-smoke.test.mjs captured tarball and checksum cases<br>check:scripts/version.mjs<br>check:docs/supply-chain.md release procedure | partially-mitigated | Skipping the documented release sequence or uploading manually can still diverge | maintainer | Version, package, tag, checksum, release, or publication workflow change |
| TM-018 | Resource exhaustion from patches, loops, tools, or subprocesses | AC-002<br>AC-004 | A-002<br>A-005<br>A-007<br>A-009 | TB-002<br>TB-003<br>TB-009 | Oversized input, repeated iteration, or a hanging process consumes time, memory, disk, or model budget | medium | Review preparation uses budgets and timeouts; loop invocation has an iteration cap | test:scripts/review-orchestrated-prepare.test.mjs budget and timeout cases<br>check:opencode/scripts/check-harness.mjs loop iteration contract<br>limitation:no system-wide resource quota | partially-mitigated | Allowed processes and external services can still exhaust host resources | maintainer | Budget, timeout, loop, subprocess, or input-size change |
| TM-019 | Poisoned memory, MCP data, or reused evidence | AC-004 | A-001<br>A-004<br>A-007<br>A-009 | TB-003<br>TB-006<br>TB-007 | Stale or malicious remembered content is treated as current truth and changes a decision | high | Persistent memory is documented as a hint and important decisions require verification against current repository state | check:opencode/AGENTS.md memory-as-hint rule<br>limitation:no provenance enforcement for every external memory or MCP response | partially-mitigated | Plausible poisoned context can still bias reasoning before verification | maintainer | Memory, MCP, evidence-reuse, retrieval, or provenance change |
| TM-020 | Private material crosses public sync or release boundary | AC-006 | A-003<br>A-007<br>A-010 | TB-007<br>TB-008 | Private configuration, service wiring, paths, raw evidence, or credentials enter a public diff or package | high | Deliberate file selection, public translation, leak scans, package file allow/deny checks, diff review, and separate commit/release gates constrain the boundary | check:scripts/check.sh public leak scan<br>test:scripts/package-smoke.test.mjs forbidden package state<br>limitation:semantic privacy review remains human | partially-mitigated | Novel identifiers or sensitive prose can evade mechanical patterns | maintainer | Sync skill, leak scan, package files, documentation, commit, or release change |

## Adversarial traceability

The public adversarial corpus remains unchanged. Each scenario maps exactly once
to its primary risk and to the existing executable defense suite.

| Scenario ID | Risk ID | Evidence |
|---|---|---|
| diff-injection-is-data | TM-001 | test:opencode/scripts/adversarial-harness.test.mjs |
| repo-doc-is-data | TM-002 | test:opencode/scripts/adversarial-harness.test.mjs |
| external-symlink-rejected | TM-007 | test:opencode/scripts/adversarial-harness.test.mjs |
| path-traversal-rejected | TM-007 | test:opencode/scripts/adversarial-harness.test.mjs |
| control-filename-rejected | TM-008 | test:opencode/scripts/adversarial-harness.test.mjs |
| rtk-wrapper-needs-approval | TM-005 | test:opencode/scripts/adversarial-harness.test.mjs |
| review-network-not-allowed | TM-006 | test:opencode/scripts/adversarial-harness.test.mjs |
| approval-hash-is-immutable | TM-009 | test:opencode/scripts/adversarial-harness.test.mjs |
| credential-canary-stays-local | TM-010 | test:opencode/scripts/adversarial-harness.test.mjs |
| unpinned-ref-needs-approval | TM-013 | test:opencode/scripts/adversarial-harness.test.mjs |
| repeated-event-rejected | TM-009 | test:opencode/scripts/adversarial-harness.test.mjs |

## Residual risks and assumptions

- Permission frontmatter is not process, filesystem, container, or
  operating-system isolation.
- A network-enabled agent can ingest hostile content and can expose data it is
  already able to read.
- Tool, MCP, plugin, model, web, registry, and memory output remains untrusted.
- Delegation can create confused-deputy behavior because authority is conveyed
  through policy and natural-language context rather than capability tokens.
- Shell safety depends on the real OpenCode matcher, wrapper, and shell
  semantics.
- Experimental plugins are outside some core installation and runtime
  guarantees.
- Open Design can execute agent CLIs and write workspace files; authentication
  and network exposure remain operator responsibilities.
- Raw evidence, sessions, logs, backups, histories, and caches can contain
  sensitive material.
- Timeouts, budgets, locks, and iteration caps reduce but do not eliminate
  denial of service or resource exhaustion.
- Pins, checksums, signatures, and audits cannot eliminate compromise of an
  authentic upstream source.
- Private-to-public preparation still needs human semantic review.
- Archive, checksum, version, tag, release upload, and registry publication can
  diverge if release checks and authorization gates are skipped.

Any new agent, external service, plugin, persistent surface, publication path,
permission expansion, lifecycle mutation, or evidence pipeline change requires
review of the affected rows. Accepted risk requires an explicit maintainer
decision and a concrete review trigger.

## Private and public boundary

Public artifacts may contain portable agent and workflow contracts, public
package paths, generic threat taxonomy, public controls and tests, documented
services, and honest limitations.

Public artifacts must not contain active private configuration, provider or MCP
wiring, credentials, tokens, secrets, sessions, transcripts, logs, raw
evidence, private service inventory, machine-local absolute paths, durable local
approval state, or private product documents.

The checker catches structural omissions and a small set of known markers. It
does not replace public-diff review, package inspection, or a human judgment
about whether otherwise ordinary prose reveals private information.
