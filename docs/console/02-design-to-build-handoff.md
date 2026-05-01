# OpenCode Orchestration Console Design-to-Build Handoff

## 1. Executive summary

This document translates the validated dark mission-control mockup into a production-oriented web UI handoff for the OpenCode Orchestration Kit console. It is a design-to-build handoff only. It does not implement the product, does not define backend execution internals, and does not replace a later implementation spec.

Confirmed decisions:

- The console is run-centric and observability-centric. The home experience starts from active runs, recent runs, approvals, tool health, artifacts, validation, elapsed time, and token usage.
- The console must preserve this repository's true workflow contracts:
  - direct message -> `developer`
  - `/feature` -> `lead -> designer if applicable -> researcher -> specifier -> developer -> reviewer`
  - `/scope` -> `scoper -> researcher -> scoper synthesis -> specifier`
  - `/mvp-spec` -> `/scope` flow, strict MVP, 1-2 hour tasks, explicit out of scope
  - `/design` -> `designer -> open-design`
  - `/research` -> `researcher`
  - `/spec` -> `specifier`
  - `/implement` -> `developer`
  - `/review` -> `reviewer`
  - `/evolve` -> `evaluator -> debugger -> evolver -> lead approval -> developer -> evaluator -> debugger -> reviewer`
- A normal free-form request must not be visually or behaviorally forced into the full feature pipeline. The repository's default agent is `developer`.
- AHE sidecars are visible but not normalized into every run. They are first-class in `/evolve`, optional elsewhere only when evidence/debugging is relevant.
- The validated mockup establishes the main visual direction: deep navy technical console, left navigation, active runs strip, recent runs table, workflow launcher, per-agent model assignment, live flow graph, stage timeline, agent detail panel, logs/thinking/final output/artifacts/config tabs, and a stop-run control.

Assumptions:

- The future console will be added as an app within this repository, likely under `console/`, without mutating the shipped `opencode/` config during normal UI use.
- The first build should use mocked read-models and simulated event streams before connecting real OpenCode execution.
- `docs/console/00-codex-design-prompt.md` and `docs/console/01-console-implementation-spec.md` were requested as source material but were not present in this repository before this handoff. The source materials actually present and used are `README.md`, `docs/workflows.md`, `docs/agents.md`, `docs/commands.md`, `docs/configuration.md`, `docs/models.md`, `opencode/opencode.json`, `opencode/AGENTS.md`, command files, agent files, the Open Design skill, and the validated mockup image.

Open questions:

- Whether the real runner will expose structured JSON events, PTY text, or both.
- Whether model availability should be loaded from OpenCode/provider metadata or remain environment-variable driven in the MVP.
- Whether MCP references are execution-ready in v1 or metadata-only until a registry is introduced.

## 2. Why SvelteKit + TypeScript + Tailwind is the recommended UI foundation

Recommended foundation:

- SvelteKit
- TypeScript
- Tailwind CSS
- minimal local component library
- lightweight chart primitives such as `layercake`, `chart.js`, `uplot`, or custom SVG where the chart is simple
- native Server-Sent Events or WebSocket adapter later for run streaming

Why this fits the product:

- The console is an operational UI with dense state, not a marketing site and not a generic chat app. Svelte's fine-grained reactivity is a good match for live run state, streaming logs, status pills, timers, and per-agent panels without bringing a large enterprise framework.
- SvelteKit keeps routes, server endpoints, static mocks, and later adapter boundaries simple. It can start as a frontend-first app and grow into a local web console with API endpoints.
- TypeScript is necessary because the product depends on domain concepts that should not drift: `Run`, `Workflow`, `Stage`, `AgentSession`, `Artifact`, `Barrier`, `Approval`, `ConfigSnapshot`, and `MetricSnapshot`.
- Tailwind supports the compact console visual system efficiently while keeping the component layer small. Use design tokens and semantic utility composition; avoid turning the UI into arbitrary one-off class soup.
- A minimal component approach avoids the weight and visual defaults of heavy enterprise UI frameworks. The mockup needs custom density, timeline, graph, log viewer, and matrix controls. Generic admin kits would fight the design.

Do not choose a heavier stack unless a later implementation proves a hard need for:

- multi-user real-time collaboration,
- enterprise table virtualization at very high scale,
- complex graph editing rather than graph viewing,
- a pre-existing internal design system tied to another framework.

## 3. Bounded contexts and UI ownership map

Use these bounded contexts as the UI ownership map. They are product capabilities, not folders by technical layer.

| Bounded context | Owns | Primary UI surfaces | Does not own |
| --- | --- | --- | --- |
| Runs | run lifecycle, status, run summary, start/stop intent | `/runs`, `/runs/:runId`, status footer | raw OpenCode process parsing details |
| Launch / Run Creation | workflow selection, prompt, config snapshot request, preset application | `/runs/new`, launch drawer/card | live execution state after run starts |
| Orchestration Timeline | workflow stages, graph nodes, barriers, handoffs, approvals | flow graph, stage timeline, barrier banners | model catalog and skill registry |
| Agent Sessions | per-agent session state, model used, skills/tools attached, logs/output by agent | agent side panel, agent detail drawer, `/agents` | aggregate run metrics |
| Artifacts | specs, reviews, design handoffs, manifests, generated files, links | `/artifacts`, run artifact tab, Open Design handoff panel | execution control |
| Presets & Configuration | reusable launch presets, environment model references, skills, tools, MCP metadata | `/presets`, `/models`, `/skills`, `/mcps-tools`, `/settings` | run status transitions |
| Observability & Metrics | token/cost/duration read-models, validation state, distribution charts, tool health | dashboard charts, metrics cards, footer health strip | workflow command semantics |

Context relationships:

- Launch / Run Creation depends on Presets & Configuration as upstream reference data.
- Runs publishes state consumed by Orchestration Timeline, Agent Sessions, Artifacts, and Observability & Metrics projections.
- Orchestration Timeline consumes workflow definitions but should not redefine them.
- Observability & Metrics consumes projections/read-models, not raw terminal output.

## 4. Route map for the web app

| Route | Name | Primary bounded context | Purpose |
| --- | --- | --- | --- |
| `/runs` | Runs dashboard | Runs + Observability & Metrics | Home screen for active and historical runs |
| `/runs/new` | New Run | Launch / Run Creation | Configure and launch a new run |
| `/runs/:runId` | Run Detail | Runs + Orchestration Timeline + Agent Sessions | Follow a live or completed run |
| `/presets` | Presets | Presets & Configuration | Save, edit, duplicate, and launch from reusable configs |
| `/artifacts` | Artifacts | Artifacts | Search and inspect outputs across runs |
| `/agents` | Agents | Agent Sessions + Presets & Configuration | Browse agent roles, permissions, default models, skills |
| `/models` | Models | Presets & Configuration | View env-backed model assignments and per-role overrides |
| `/skills` | Skills | Presets & Configuration | View local and referenced skills such as `open-design` and Superpowers |
| `/mcps-tools` | MCPs / Tools | Presets & Configuration | View tools/MCP metadata and health, including Open Design tools |
| `/settings` | Settings | Presets & Configuration | Local console preferences and integration settings |

Optional later routes:

- `/runs/:runId/artifacts/:artifactId`
- `/runs/:runId/events`
- `/evolution`
- `/settings/workdirs`

## 5. App shell design

Left sidebar navigation:

- Fixed width: `72px` compact or `232px` expanded later.
- Primary items: Runs, New Run, Agents, Workflows, Artifacts, Approvals, MCPs / Tools, Models, Skills, Settings.
- Bottom cluster: Environment, Config file, Open Design status, Superpowers status, current user/local profile.
- Use icons plus labels in desktop. Collapse to icons at narrower tablet widths.
- The active route uses cyan border and subtle background, not a large filled pill.

Top context/header behavior:

- `/runs`: title, summary metrics, New Run button, active stream count.
- `/runs/new`: title, selected workflow badge, unsaved preset indicator, launch readiness.
- `/runs/:runId`: run id, title, workflow badge, status, elapsed, tokens, stop-run action.
- Secondary tabs should live below the page header, not inside nested cards.

Content column strategy:

- Desktop target: `1440 x 1024`.
- Main content uses a 12-column grid with 24px page padding and 16px gutters.
- Dashboard: primary table spans 8 columns; right/bottom widgets fill remaining columns.
- Launch: left 7 columns for workflow/prompt; right 5 columns for stage preview and model matrix.
- Run detail: graph/logs center, stage timeline left or center-secondary, agent detail panel right.

Persistent run status areas:

- Active run strip on `/runs`.
- Mini status footer across all pages with live connection, active runs, Open Design health, Superpowers plugin status, MCP/tool health, and local config source.
- A stopped/failed run should remain inspectable. The status footer must not disappear because the stream ended.

Footer/system status strip:

- Height: 32-40px.
- Contents: live transport state, active run count, MCP/tool health count, Superpowers enabled, `OPENCODE_ENV` or local mode, app version.
- Use green/cyan for healthy, amber for degraded, red for failed.

## 6. Page-by-page layout spec

### `/runs`

Purpose:

- Home and operational overview for the console.

Primary user questions:

- What is running now?
- Which runs failed, passed validation, or are blocked?
- Which workflow types are being used?
- What artifacts and approvals need attention?
- Are tools and integrations healthy?

Layout regions:

- Header with `Runs`, short subtitle, New Run button.
- Active Runs strip with cards for active or recently active runs.
- Recent Runs table.
- Bottom/side analytics: workflow distribution, validation status, resource overview, recent artifacts, approvals, MCPs/tools health.
- Persistent footer status strip.

Core components:

- `ActiveRunCard`
- `RecentRunsTable`
- `WorkflowDistributionChart`
- `ValidationStatusChart`
- `ResourceOverviewCard`
- `RecentArtifactsList`
- `ApprovalsWidget`
- `ToolHealthWidget`

Data shown:

- Run id, title, workflow, active agent, status, validation, elapsed, tokens, cost estimate/reported flag, artifact count, approvals.
- Workflow buckets: direct, `/feature`, `/scope`, `/mvp-spec`, `/design`, `/research`, `/spec`, `/implement`, `/review`, `/evolve`.
- Tool health: filesystem, git, HTTP, Open Design, Superpowers, MCPs.

Empty states:

- "No runs yet" with actions: `Launch direct message`, `Create /scope`, `Create /feature`.
- Empty approvals: "No approvals pending."
- Empty artifacts: "Artifacts will appear when agents produce specs, reviews, design handoffs, or manifests."

Loading states:

- Skeleton active cards.
- Table row skeletons.
- Chart placeholders with axis/grid visible, not blank empty blocks.

Interaction details:

- Clicking an active card opens `/runs/:runId`.
- Clicking a workflow chart segment filters the table.
- Clicking approval opens the relevant run detail with the barrier highlighted.
- Tool-health item opens `/mcps-tools` filtered to that integration.

### `/runs/new`

Purpose:

- Launch a run from a prompt, workflow, model assignments, skills, tools/MCPs, and optional preset.

Primary user questions:

- Which workflow should this prompt use?
- Which agents will participate?
- Which model, skills, and tools will each agent use?
- Is this run ready to launch?

Layout regions:

- Workflow picker grid.
- Prompt composer.
- Advanced run options.
- Per-agent model assignment matrix.
- Skills and MCP/tool selection.
- Stage preview timeline.
- Footer actions: Save as Preset, Reset, Launch Run.

Core components:

- `WorkflowPicker`
- `PromptComposer`
- `AgentAssignmentMatrix`
- `SkillSelectionPanel`
- `McpToolSelectionPanel`
- `StagePreview`
- `LaunchReadinessPanel`

Data shown:

- Workflow description and stage plan.
- Prompt character count.
- Agent rows with model env variable values: `OPENCODE_LEAD_MODEL`, `OPENCODE_SCOPER_MODEL`, `OPENCODE_DESIGNER_MODEL`, `OPENCODE_RESEARCHER_MODEL`, `OPENCODE_SPECIFIER_MODEL`, `OPENCODE_DEVELOPER_MODEL`, `OPENCODE_REVIEWER_MODEL`, `OPENCODE_EVALUATOR_MODEL`, `OPENCODE_DEBUGGER_MODEL`, `OPENCODE_EVOLVER_MODEL`.
- Skills: `open-design`, Superpowers plugin, Impeccable optional if available.
- Tools: Open Design tools, filesystem, git, HTTP/web fetch/search, MCP metadata.

Empty states:

- No presets: "Save this setup after launch readiness is valid."
- No MCP registry: "No MCP registry configured; tool references can be added as metadata later."

Loading states:

- Workflow catalog loads from static repo-derived definitions.
- Model list shows env variable placeholders before real resolution.

Interaction details:

- Selecting a workflow changes stage preview and eligible agent rows.
- `/scope` and `/mvp-spec` disable designer, developer, and reviewer rows.
- `/design` emphasizes `designer` and `open-design`; Open Design health becomes prominent.
- `/evolve` exposes AHE sidecar lane and lead approval.
- Launch is disabled when prompt is empty, workflow is invalid, or required integration status is blocking.
- Save preset captures workflow, prompt template, agent model overrides, skills/tools selections, thinking visibility, and runner preference.

### `/runs/:runId`

Purpose:

- Live and historical inspection of one orchestration run.

Primary user questions:

- Where is this run now?
- Which stage or barrier is active?
- What did each agent do?
- What outputs/artifacts exist?
- What did the run cost in time/tokens?
- Can I stop it safely?

Layout regions:

- Run header with id, title, workflow, status, elapsed, tokens, stop-run action.
- Tabs: Overview, Timeline, Agents, Artifacts, Logs, Config.
- Flow graph.
- Stage timeline.
- Agent detail panel/drawer.
- Lower log/output region.
- Metrics side panel.

Core components:

- `RunHeader`
- `FlowGraph`
- `StageTimeline`
- `AgentDetailPanel`
- `RunTabs`
- `LogViewer`
- `ThinkingViewer`
- `FinalOutputPanel`
- `ArtifactPanel`
- `ConfigSnapshotPanel`
- `StopRunButton`

Data shown:

- Stage status: queued, running, completed, failed, blocked, skipped, stopped.
- Agent status, current step, model, tokens, duration, tools called.
- Logs grouped by event kind and filterable by agent/stage.
- Thinking/process traces only when available and user-visible.
- Final output per agent.
- Artifacts with origin agent/stage and timestamp.
- Config snapshot with workflow, prompt, models, skills, tools/MCPs, runner mode.

Empty states:

- No artifacts yet: "Artifacts appear when agents produce specs, reviews, handoffs, manifests, or generated design links."
- No thinking: "Thinking/process traces are not available for this runner/provider."
- No final output: "This agent has not emitted a final output yet."

Loading states:

- Live connection pending: show timeline skeleton and "Waiting for first run event."
- Historical replay loading: show read-model skeletons but keep run header visible.

Interaction details:

- Clicking graph node opens agent detail.
- Clicking stage timeline item filters logs to that stage.
- Stop Run opens confirmation and maps to a use case, not a local UI toggle.
- Logs auto-scroll while live unless the user scrolls up or toggles pause.
- Config tab is read-only for completed/active runs.

### `/presets`

Purpose:

- Manage reusable launch configurations.

Primary user questions:

- Which setup should I reuse?
- What workflow and agent models does it use?
- When was it last used?

Layout regions:

- Header with New Preset action.
- Preset cards/table.
- Detail side panel for selected preset.

Core components:

- `PresetList`
- `PresetCard`
- `PresetDetailPanel`
- `PresetLaunchButton`
- `PresetDiffSummary`

Data shown:

- Name, workflow, prompt template excerpt, agent overrides, skills/tools, last used, created/updated timestamps.

Empty states:

- "No presets yet. Create one from the New Run panel after choosing a workflow."

Loading states:

- Preset table skeleton and disabled launch buttons.

Interaction details:

- Launch from preset opens `/runs/new` prefilled, not immediate execution unless a later quick-launch feature is explicitly added.
- Editing a preset never mutates existing run config snapshots.

### `/artifacts`

Purpose:

- Cross-run artifact browser.

Primary user questions:

- What specs, reviews, design handoffs, manifests, or validation evidence exist?
- Which run and agent produced them?

Layout regions:

- Filter bar.
- Artifact table/list.
- Preview panel.

Core components:

- `ArtifactFilters`
- `ArtifactList`
- `ArtifactPreview`
- `ArtifactOriginBadge`

Data shown:

- Artifact type, title/path/link, run, workflow, agent, stage, timestamp, status.

Empty states:

- "No artifacts captured yet."

Loading states:

- List skeleton with preview placeholder.

Interaction details:

- Filter by workflow, agent, artifact type, status.
- Click origin opens run detail at the producing event.

### `/agents`

Purpose:

- Browse agent roles, permissions, default model references, and workflow participation.

Primary user questions:

- What does each agent do?
- Which workflows use it?
- Which model variable configures it?
- Which skills/tools can it access?

Layout regions:

- Agent list/table.
- Role detail panel.
- Workflow participation matrix.

Core components:

- `AgentCatalogTable`
- `AgentRolePanel`
- `WorkflowParticipationMatrix`
- `PermissionSummary`

Data shown:

- `lead`, `scoper`, `designer`, `researcher`, `specifier`, `developer`, `reviewer`, `evaluator`, `debugger`, `evolver`.
- Mode, description, model env variable, skills/tools, command participation.

Empty states:

- Should not be empty if repository config loads. If config load fails, show parse/read error.

Loading states:

- Agent rows skeleton.

Interaction details:

- Click agent to open role detail.
- Workflow filter highlights relevant agents.

### `/models`

Purpose:

- Inspect model configuration and per-agent model assignment.

Primary user questions:

- Which env var controls each agent?
- Which model is currently resolved?
- Are required env vars missing?

Layout regions:

- Model summary.
- Per-agent model table.
- Environment diagnostics.

Core components:

- `ModelAssignmentTable`
- `EnvironmentVariableStatus`
- `ModelResolutionBadge`

Data shown:

- `OPENCODE_MODEL`, `OPENCODE_SMALL_MODEL`, role-specific env vars, resolved or unresolved status, temperature.

Empty states:

- Missing env values: show unresolved but valid placeholder state, not a hard UI failure.

Loading states:

- Model resolution pending.

Interaction details:

- Copy env var name.
- Later: test provider availability or refresh models.

### `/skills`

Purpose:

- Catalog local and referenced skills.

Primary user questions:

- Is `open-design` available?
- Is Superpowers enabled?
- Is Impeccable installed or only optional?

Layout regions:

- Skill cards.
- Source/status filters.
- Detail panel.

Core components:

- `SkillCatalog`
- `SkillStatusBadge`
- `SkillDetailPanel`

Data shown:

- Local skill path, plugin source, compatibility, status, commands/agents that reference the skill.

Empty states:

- If no optional skills are detected, show local `open-design` plus guidance that Impeccable is optional.

Loading states:

- Skill scan pending.

Interaction details:

- Open detail shows source, description, allowed agents, and setup notes.

### `/mcps-tools`

Purpose:

- Show tools, MCPs, and integration health.

Primary user questions:

- Is Open Design reachable?
- Which tools are available?
- Which MCP references are configured?

Layout regions:

- Health summary.
- Tool list.
- MCP metadata list.
- Open Design health card.

Core components:

- `ToolHealthGrid`
- `McpRegistryTable`
- `OpenDesignHealthCard`
- `ToolPermissionSummary`

Data shown:

- Open Design tools: `open_design_health`, `open_design_list_agents`, `open_design_list_skills`, `open_design_list_design_systems`, `open_design_create_project`, `open_design_run_design`.
- Status of filesystem/git/http/web permissions as configured.
- MCP registry entries when available.

Empty states:

- "No MCP registry configured yet. Tool health is still available from repository config."

Loading states:

- Health checks pending with stale status if known.

Interaction details:

- Run health check later as an explicit action.
- Link Open Design failures to setup docs.

### `/settings`

Purpose:

- Local console preferences and integration settings.

Primary user questions:

- Which config source is the console reading?
- What is the local workdir?
- How should logs/thinking visibility behave by default?

Layout regions:

- Config source.
- Preferences.
- Safety/permissions summary.
- About/version.

Core components:

- `ConfigSourcePanel`
- `ConsolePreferencesForm`
- `SafetySummary`
- `AboutPanel`

Data shown:

- Path to repo/config, `OPEN_DESIGN_URL` status, default thinking visibility, auto-scroll behavior, retention policy later.

Empty states:

- Missing optional integration is degraded, not fatal.

Loading states:

- Config read pending.

Interaction details:

- Settings should not mutate `opencode/opencode.json` silently.
- Any write to repository config must be explicit and previewed.

## 7. Component inventory

Core layout:

- `AppShell`
- `SidebarNav`
- `TopContextHeader`
- `SystemStatusFooter`
- `PageSection`
- `Panel`
- `MetricCard`

Runs:

- `ActiveRunCard`
- `RecentRunsTable`
- `RunStatusPill`
- `WorkflowBadge`
- `ValidationBadge`
- `TokenCostSummary`

Launch:

- `WorkflowPicker`
- `WorkflowCard`
- `PromptComposer`
- `AgentAssignmentMatrix`
- `AgentModelSelect`
- `SkillMultiSelect`
- `McpToolPicker`
- `StagePreview`
- `LaunchReadinessPanel`

Timeline and live run:

- `FlowGraph`
- `FlowNode`
- `FlowEdge`
- `StageTimeline`
- `BarrierNode`
- `ApprovalBanner`
- `AgentDetailPanel`
- `RunTabs`

Logs and outputs:

- `LogViewer`
- `LogFilterBar`
- `ThinkingViewer`
- `FinalOutputPanel`
- `ArtifactList`
- `ConfigSnapshotViewer`

Configuration:

- `PresetCard`
- `PresetDetailPanel`
- `AgentCatalogTable`
- `ModelAssignmentTable`
- `SkillCatalog`
- `ToolHealthGrid`

Charts:

- `WorkflowDistributionChart`
- `ValidationStatusChart`
- `ResourceOverviewChart`

## 8. Interaction model

Selecting a workflow:

- User clicks a workflow card.
- The card becomes active.
- Stage preview updates immediately.
- Agent assignment matrix enables/disables rows according to the workflow.
- Launch readiness recalculates.
- If workflow is `/design`, Open Design health becomes a visible requirement warning if unavailable.
- If workflow is `/evolve`, AHE sidecar lane becomes visible and lead approval appears in the preview.

Switching tabs:

- Tabs should preserve local scroll state per tab.
- Logs tab keeps stream subscription active if the run is live.
- Config snapshot is read-only and should not be confused with editable settings.

Opening agent detail:

- Click an agent card, flow node, timeline row, or log agent badge.
- Detail panel opens on the right.
- The selected agent is highlighted in graph and timeline.
- Panel can remain open during live updates.

Following a live run stream:

- Live events append to run projections.
- Header timer updates every second while running.
- Flow graph and stage timeline update on normalized stage/agent events.
- Logs auto-scroll only while pinned to bottom.

Pausing auto-scroll in logs:

- If user scrolls upward, auto-scroll pauses and shows "Resume live".
- `Resume live` scrolls to latest event and re-enables auto-scroll.
- Filters should not reset auto-scroll unexpectedly.

Showing/hiding thinking traces:

- Thinking is controlled by a run-level preference and a per-view toggle.
- If unavailable, show an explicit unavailable state.
- Thinking traces must be separated from final output and raw logs.

Filtering logs by agent/stage:

- Filters: agent, stage, event kind, severity, text search.
- Clicking graph/timeline can set filters.
- Active filters appear as removable chips.

Saving and reusing presets:

- Save from `/runs/new` after valid launch configuration.
- Preset stores workflow, prompt template, model overrides, skill/tool selections, thinking preference, runner preference.
- Reusing a preset pre-populates `/runs/new`.
- Existing runs keep their immutable config snapshot.

Exposing approvals and barriers:

- Barriers use amber graph nodes and timeline markers.
- Approval banners describe owner, reason, required action, and downstream blocked stages.
- Approvals appear on `/runs`, `/runs/:runId`, and footer/status strip when urgent.

## 9. Visual tokens and design system guidance

Color tokens:

- `color-bg-root`: `#050B16`
- `color-bg-shell`: `#071120`
- `color-surface-1`: `#0B1524`
- `color-surface-2`: `#101D2E`
- `color-surface-raised`: `#13243A`
- `color-border-subtle`: `#203149`
- `color-border-strong`: `#33506F`
- `color-text-primary`: `#E6F0FF`
- `color-text-secondary`: `#93A8C4`
- `color-text-muted`: `#61738F`
- `color-accent-active`: `#35C6F4`
- `color-accent-success`: `#35D08A`
- `color-accent-warning`: `#F3B74F`
- `color-accent-danger`: `#F06464`
- `color-accent-ahe`: `#C66BFF`

Typography:

- Use a compact, readable sans for UI.
- Use tabular numerals for metrics, timers, costs, tokens, and table numeric columns.
- Avoid hero-scale type inside operational panels.
- Log surfaces use a monospace font with tight line-height.

Spacing:

- Base grid: 4px.
- Panel padding: 12px to 16px.
- Page padding desktop: 24px.
- Card gap: 12px to 16px.
- Dense table rows: 36px to 44px.

Shape:

- Radius max 8px for cards/panels/buttons.
- Small pills can use full radius.
- Avoid nested cards unless the nested element is a true tool surface, drawer, modal, or repeated item.

Iconography:

- Use simple line icons.
- Icons support recognition but labels remain visible in desktop navigation.

Charts:

- Keep charts small and operational.
- Use donut charts only where the mockup already establishes distribution/status.
- Avoid decorative charting that does not answer an operational question.

## 10. State model per page

`/runs` state:

- `runSummaries`
- `activeRuns`
- `workflowDistribution`
- `validationSummary`
- `resourceOverview`
- `recentArtifacts`
- `pendingApprovals`
- `toolHealth`
- `tableFilters`
- `sort`

`/runs/new` state:

- `selectedWorkflowId`
- `prompt`
- `title`
- `selectedPresetId`
- `agentAssignments`
- `skillSelections`
- `mcpToolSelections`
- `thinkingVisibility`
- `captureRawTranscript`
- `runnerModePreference`
- `launchReadiness`

`/runs/:runId` state:

- `run`
- `stageTimeline`
- `flowGraph`
- `agentSessions`
- `events`
- `artifacts`
- `metrics`
- `selectedTab`
- `selectedAgentId`
- `logFilters`
- `autoScroll`
- `thinkingVisible`
- `streamConnectionState`
- `stopRunConfirmation`

`/presets` state:

- `presets`
- `selectedPreset`
- `filters`
- `dirtyDraft`

`/artifacts` state:

- `artifacts`
- `filters`
- `selectedArtifact`
- `previewState`

`/agents` state:

- `agentCatalog`
- `selectedAgent`
- `workflowFilter`

`/models` state:

- `modelAssignments`
- `envResolution`
- `providerHealth`

`/skills` state:

- `skillCatalog`
- `selectedSkill`
- `sourceFilter`

`/mcps-tools` state:

- `toolHealth`
- `mcpRegistry`
- `openDesignStatus`
- `selectedTool`

`/settings` state:

- `configSource`
- `consolePreferences`
- `integrationStatuses`
- `safetySummary`

## 11. Responsive behavior rules

Primary target:

- Desktop-first. Optimize for 1280px and above.

Breakpoints:

- `>= 1440px`: full three-column run detail and dense dashboard widgets.
- `1200px - 1439px`: keep sidebar compact; run detail can reduce right panel width.
- `900px - 1199px`: collapse dashboard widgets below table; run detail moves agent detail into drawer overlay.
- `< 900px`: inspection mode only. The console remains usable, but complex launch/config matrices stack vertically.

Rules:

- Do not hide critical run status, stop action, or active barrier state on smaller screens.
- Tables may become horizontally scrollable before columns are dropped.
- The flow graph can switch to vertical layout below 900px.
- Logs should keep readable line lengths and allow horizontal scrolling for long raw output.
- The footer status strip can collapse to icons plus tooltips below 900px.

## 12. Accessibility and keyboard interaction rules

General:

- All controls must be keyboard reachable.
- Visible focus states use cyan outline with sufficient contrast.
- Status should not rely on color alone. Include text labels or icons.
- Motion must respect `prefers-reduced-motion`.
- Log viewer should expose text content to assistive technologies where practical.

Keyboard:

- `g r`: go to Runs.
- `g n`: go to New Run.
- `g a`: go to Artifacts.
- `/`: focus log/search filter when present.
- `Esc`: close drawer/modal or clear transient focus.
- `Tab`/`Shift+Tab`: predictable focus order.
- Arrow keys navigate workflow cards and tabs.
- `Enter` opens selected card/node.

Run detail:

- Graph nodes must be buttons with accessible names such as "developer, in progress, 15 minutes".
- Timeline items must expose stage status.
- Stop Run requires confirmation and should not be bound to a single accidental keypress.

Logs:

- Pause/resume auto-scroll button must be reachable.
- Filters must have labels.
- Thinking visibility toggle must announce state and availability.

## 13. Motion and transition rules

Use motion to clarify state changes, not to decorate.

Allowed:

- Subtle active stage pulse.
- Stage transition highlight.
- Drawer slide-in under 180ms.
- Tab content fade under 120ms.
- New log row brief background flash.
- Barrier node amber pulse while blocked.

Avoid:

- Long animated graph rearrangements during live runs.
- Decorative background motion.
- Chart animations that delay comprehension.
- Motion that makes logs harder to read.

Reduced motion:

- Replace pulses with static outlines.
- Disable row flash.
- Keep instant layout changes.

## 14. Empty / loading / streaming / error / stopped-run states

Empty:

- Dashboard empty: offer three launch paths: direct message, `/scope`, `/feature`.
- Artifact empty: explain which artifacts will be captured.
- Presets empty: prompt user to save from New Run.
- MCP registry empty: show tools health separately from future MCP registry.

Loading:

- Use skeletons that preserve final layout dimensions.
- Header context should load first.
- Charts show labeled placeholders instead of blank panels.

Streaming:

- Live badge in header and footer.
- Event counters update without reflow.
- Logs append incrementally.
- Graph updates from normalized events.
- If stream disconnects, show degraded state and keep last known data.

Error:

- Config parse/read error should name the file and surface.
- Open Design health error should explain `OPEN_DESIGN_URL` expectations.
- Runner error should preserve raw transcript and mark parse confidence if relevant.
- Unknown event chunks must remain visible as raw logs.

Stopped run:

- Status becomes `stopped`.
- Stop button becomes disabled or "Stopped".
- Timeline marks active stage as stopped, not failed.
- Artifacts/config/logs remain inspectable.
- Metrics show endedAt and duration up to stop.

## 15. Design-to-domain mapping for DDD + hexagonal architecture

Dependency rule:

- UI components render read-models and dispatch commands.
- Application services own use cases.
- Domain objects own workflow and run invariants.
- Infrastructure adapters handle OpenCode execution, event parsing, storage, filesystem, Open Design, and provider/model probing.

Runs context:

- Domain concepts: `Run`, `RunStatus`, `RunId`, `RunLifecycle`, `StopReason`.
- Use cases: `StartRun`, `StopRun`, `GetRun`, `ListRuns`, `ReconstructRunFromEvents`.
- Inbound ports: `RunCommandPort`, `RunQueryPort`.
- Outbound ports: `RunRepositoryPort`, `RunEventStorePort`, `RunExecutionPort`.
- Adapters later: HTTP/SvelteKit endpoints, SQLite repository, OpenCode runner adapter, mock runner adapter.

Launch / Run Creation context:

- Domain concepts: `LaunchRequest`, `WorkflowSelection`, `Prompt`, `RunConfigSnapshot`, `AgentAssignment`.
- Use cases: `PrepareLaunch`, `ValidateLaunch`, `CreateRunFromLaunch`, `CreateRunFromPreset`.
- Inbound ports: `LaunchCommandPort`, `LaunchValidationPort`.
- Outbound ports: `WorkflowCatalogPort`, `ConfigSnapshotWriterPort`, `PresetRepositoryPort`.
- Adapters later: static repo workflow catalog, environment config reader, in-memory mock catalog.

Orchestration Timeline context:

- Domain concepts: `Workflow`, `Stage`, `Barrier`, `Handoff`, `Approval`, `StageStatus`.
- Use cases: `BuildTimelineProjection`, `MarkBarrier`, `ResolveApproval`, `GetWorkflowDefinition`.
- Inbound ports: `TimelineQueryPort`, `ApprovalCommandPort`.
- Outbound ports: `WorkflowDefinitionPort`, `RunEventReaderPort`, `ApprovalRepositoryPort`.
- Adapters later: static workflow adapter from repo contracts, event-store projection adapter.

Agent Sessions context:

- Domain concepts: `AgentSession`, `AgentRole`, `AgentStatus`, `AgentOutput`, `ToolCall`.
- Use cases: `GetAgentSession`, `ListAgentSessionsForRun`, `AppendAgentEvent`, `GetAgentFinalOutput`.
- Inbound ports: `AgentSessionQueryPort`.
- Outbound ports: `AgentSessionRepositoryPort`, `EventNormalizerPort`.
- Adapters later: event parser, projection store, mock stream generator.

Artifacts context:

- Domain concepts: `Artifact`, `ArtifactType`, `ArtifactOrigin`, `ArtifactLink`, `OpenDesignHandoff`.
- Use cases: `ListArtifacts`, `GetArtifact`, `AttachArtifactToRun`, `OpenArtifactOrigin`.
- Inbound ports: `ArtifactQueryPort`, `ArtifactCommandPort`.
- Outbound ports: `ArtifactRepositoryPort`, `FilePreviewPort`, `OpenDesignProjectPort`.
- Adapters later: local filesystem adapter, Open Design adapter, SQLite metadata adapter.

Presets & Configuration context:

- Domain concepts: `ConfigPreset`, `ModelAssignment`, `SkillReference`, `McpToolReference`, `EnvironmentModelRef`.
- Use cases: `SavePreset`, `ApplyPreset`, `ListPresets`, `ResolveModelAssignments`, `ListSkills`, `ListTools`.
- Inbound ports: `PresetCommandPort`, `ConfigQueryPort`.
- Outbound ports: `PresetRepositoryPort`, `ConfigReaderPort`, `SkillCatalogPort`, `ToolRegistryPort`.
- Adapters later: local JSON/SQLite adapter, repo scanner, environment reader.

Observability & Metrics context:

- Domain concepts: `MetricSnapshot`, `TokenUsage`, `Duration`, `CostEstimate`, `ValidationStatus`, `ToolHealth`.
- Use cases: `GetDashboardMetrics`, `GetRunMetrics`, `ProjectMetricsFromEvents`, `CheckToolHealth`.
- Inbound ports: `MetricsQueryPort`, `HealthQueryPort`.
- Outbound ports: `MetricsProjectionPort`, `ToolHealthPort`, `CostModelPort`.
- Adapters later: projection store, Open Design health adapter, model cost config adapter.

Surface mapping:

- `/runs`: Runs + Observability & Metrics read-models.
- `/runs/new`: Launch / Run Creation + Presets & Configuration.
- `/runs/:runId`: Runs + Orchestration Timeline + Agent Sessions + Artifacts + Observability & Metrics.
- `/presets`: Presets & Configuration.
- `/artifacts`: Artifacts.
- `/agents`: Agent Sessions + Presets & Configuration.
- `/models`: Presets & Configuration.
- `/skills`: Presets & Configuration.
- `/mcps-tools`: Presets & Configuration + Observability & Metrics.
- `/settings`: Presets & Configuration.

Important architecture rule:

- Charts consume projections/read-models. They do not parse raw process output.
- `Stop Run` is an application use case, not a UI-only state mutation.
- Config snapshots are immutable value objects once a run starts.
- OpenCode runner integration is an outbound adapter behind a port.

## 16. Build priority order for frontend-only implementation

1. App shell and design tokens.
2. Static workflow catalog from repository contracts.
3. Mock data model for runs, stages, agents, artifacts, presets, metrics.
4. `/runs` dashboard with active cards, recent table, charts, widgets, footer.
5. `/runs/new` workflow picker, prompt composer, agent assignment matrix, stage preview.
6. `/runs/:runId` static detail view with graph, timeline, agent panel, tabs.
7. Simulated live stream that updates run detail and dashboard state.
8. Presets page using local mock/in-memory data.
9. Artifacts, agents, models, skills, MCPs/tools pages.
10. Accessibility and keyboard pass.
11. Visual QA against the validated mockup.
12. Only then add real API/runner adapter design.

## 17. What should be mocked first vs what requires real backend integration

Mock first:

- Workflow catalog.
- Run summaries.
- Active run stream.
- Stage status updates.
- Agent logs/thinking/final output.
- Artifacts.
- Token/cost/duration metrics.
- Presets.
- Tool health states.
- Open Design handoff object.
- Model env var names and unresolved/resolved statuses.

Requires real backend integration later:

- Starting real OpenCode runs.
- Stopping a real process safely.
- Capturing structured OpenCode events or PTY transcript.
- Persisting run event streams.
- Reading actual environment variables securely.
- Checking real Open Design health through `OPEN_DESIGN_URL`.
- Resolving provider model catalogs.
- Writing config snapshots and artifacts to disk.
- MCP/tool registry and real execution integration.
- Cost calculation if provider usage metadata is not emitted directly.

Backend integration boundary:

- Frontend should call use-case endpoints or ports, not process adapters directly.
- Mock adapters should match the same read-model contracts that real adapters will later serve.

## 18. Risks, tradeoffs, and open questions

Risks, tradeoffs, and open questions:

- Risk: overbuilding execution before the UI language is stable. Mitigation: frontend-only mock stream first.
- Risk: accidentally turning the console into a chat app. Mitigation: keep prompt composer limited to launch, and make run observability the dominant surface.
- Risk: workflow drift from repository contracts. Mitigation: centralize workflow definitions and test them against docs/commands fixtures later.
- Risk: charts reading raw logs. Mitigation: introduce projection/read-model contracts from the first frontend slice.
- Risk: MCPs are not yet a fully modeled registry. Mitigation: represent MCPs/tools as metadata in v1 and keep execution integration behind ports.
- Tradeoff: SvelteKit gives speed and low weight, but the team must build some custom components instead of importing an enterprise dashboard kit.
- Open question: should the console live under `console/` in this repo or be packaged as a separate app consuming the kit?
- Open question: should config presets be SQLite-backed in MVP or local JSON first?
- Open question: should the first live transport be SSE, WebSocket, or a file/event polling adapter?

## Frontend-first implementation sequence

Realistic frontend-first build order:

1. Create `console/` SvelteKit app with TypeScript and Tailwind.
2. Add semantic design tokens, app shell, sidebar, top header, and footer status strip.
3. Define TypeScript read-models for `RunSummary`, `WorkflowDefinition`, `StageView`, `AgentSessionView`, `ArtifactView`, `MetricSnapshot`, `ConfigPresetView`, and `ToolHealthView`.
4. Add a static workflow catalog matching repository commands exactly.
5. Build `/runs` with mocked dashboard data and responsive layout.
6. Build `/runs/new` with mocked workflow selection, agent assignment matrix, skills/tools selection, and stage preview.
7. Build `/runs/:runId` with static run detail, tabs, graph, timeline, logs, agent detail panel, artifacts, metrics, and stop-run confirmation UI.
8. Add a mock streaming adapter that emits deterministic run events into the same read-models.
9. Build `/presets`, `/artifacts`, `/agents`, `/models`, `/skills`, `/mcps-tools`, and `/settings` using the same mocked catalogs.
10. Run visual QA against the validated mockup at desktop widths.
11. Run accessibility and keyboard QA for primary flows.
12. Freeze frontend read-model contracts before real OpenCode execution integration begins.
