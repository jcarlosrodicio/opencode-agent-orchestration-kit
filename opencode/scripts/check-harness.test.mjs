import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(scriptDir);

function makeFixture() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-harness-"));
  fs.cpSync(root, tmp, {
    recursive: true,
    filter: (source) => {
      const rel = path.relative(root, source);
      if (rel === ".git" || rel.startsWith(`.git${path.sep}`)) return false;
      if (rel === ".codegraph" || rel.startsWith(`.codegraph${path.sep}`)) return false;
      if (rel === "node_modules" || rel.startsWith(`node_modules${path.sep}`)) return false;
      return true;
    },
  });
  return tmp;
}

function runHarness(cwd) {
  return spawnSync(process.execPath, ["scripts/check-harness.mjs"], {
    cwd,
    encoding: "utf8",
  });
}

function write(rel, content, cwd) {
  fs.writeFileSync(path.join(cwd, rel), content);
}

function canonicalRouterScenario(overrides = {}) {
  return {
    schema_version: 1,
    id: "test-router-scenario",
    category: "trivial",
    prompt: "Apply a small direct fix.",
    command_path: "freeform",
    expected_root_agent: "lead",
    required_agents: ["developer"],
    forbidden_agents: ["evolver"],
    allowed_skills: [],
    forbidden_skills: [],
    write_before_spec_policy: "allowed",
    review_policy: "optional",
    expected_stop_condition: "task-completed",
    maximum_delegation_budget: 1,
    required_evidence: ["static_contract"],
    ...overrides,
  };
}

function writeRouterScenarios(cwd, scenarios) {
  write(
    "docs/ai/evolution/benchmarks/router-scenarios.jsonl",
    `${scenarios.map((scenario) => JSON.stringify(scenario)).join("\n")}\n`,
    cwd,
  );
}

const validLoopCommand = `---
description: Run a bounded and verifiable engineering loop.
agent: lead
---

approval_gate: explicit_before_writes
max_iterations_per_invocation: 3
completion_authority: reviewer_only
canonical_state_path: .opencode/loops/<slug>.json
history_path: .opencode/loops/<slug>.history.jsonl
lock_path: .opencode/loops/<slug>.lock
human_view_path: .opencode/loops/<slug>.md
worktree_mode: explicit_opt_in

developer -> reviewer -> developer (state sync)

## Phase 1

node scripts/loop-state.mjs inspect

## Phase 2

node scripts/loop-state.mjs resume

## Phase 3
`;

function writeLoopFixture(cwd, command) {
  write("commands/loop.md", command, cwd);
  const docsPath = path.join(cwd, "docs/ai/harness/commands.md");
  fs.appendFileSync(docsPath, "\n## `/loop`\n");
}

test("harness accepts prose evidence that mentions markdown filenames", () => {
  const cwd = makeFixture();
  try {
    const result = runHarness(cwd);
    assert.equal(result.status, 0, result.stderr);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("routing replay surface rejects a missing deterministic runner", () => {
  const cwd = makeFixture();
  try {
    fs.rmSync(path.join(cwd, "scripts/replay-routing.mjs"));
    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted a missing replay runner");
    assert.match(result.stderr, /scripts\/replay-routing\.mjs: missing regular file/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("routing replay surface rejects a missing metrics aggregator", () => {
  const cwd = makeFixture();
  try {
    fs.rmSync(path.join(cwd, "scripts/summarize-routing-metrics.mjs"));
    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted a missing metrics aggregator");
    assert.match(
      result.stderr,
      /scripts\/summarize-routing-metrics\.mjs: missing regular file/,
    );
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("routing replay surface rejects fixture IDs that differ from the corpus", () => {
  const cwd = makeFixture();
  try {
    const rel = "docs/ai/evolution/benchmarks/replay-fixtures.jsonl";
    const fixtures = fs.readFileSync(path.join(cwd, rel), "utf8");
    write(
      rel,
      fixtures.replace(
        '"scenario_id":"freeform-tiny-direct-fix"',
        '"scenario_id":"unknown-scenario"',
      ),
      cwd,
    );
    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted fixture/corpus ID drift");
    assert.match(
      result.stderr,
      /replay-fixtures\.jsonl: scenario IDs must equal .*router-scenarios\.jsonl IDs/,
    );
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("routing replay surface rejects docs without tri-state verdicts", () => {
  const cwd = makeFixture();
  try {
    const rel = "docs/ai/harness/evidence.md";
    write(
      rel,
      fs
        .readFileSync(path.join(cwd, rel), "utf8")
        .replace("`pass`, `fail`, or `inconclusive`", "`pass` or `fail`"),
      cwd,
    );
    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted docs without inconclusive");
    assert.match(result.stderr, /evidence\.md: missing routing replay token/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("routing replay surface rejects docs that put live replay in normal checks", () => {
  const cwd = makeFixture();
  try {
    const rel = "docs/ai/harness/evidence.md";
    write(
      rel,
      fs
        .readFileSync(path.join(cwd, rel), "utf8")
        .replace(
          /never runs as part of\s+normal checks or CI/,
          "runs as part of normal checks and CI",
        ),
      cwd,
    );
    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted live replay in normal checks");
    assert.match(result.stderr, /contradictory routing replay contract permits live in normal checks or CI/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects loop without approval before writes", () => {
  const cwd = makeFixture();
  try {
    writeLoopFixture(
      cwd,
      validLoopCommand.replace("approval_gate: explicit_before_writes", "approval_gate: automatic"),
    );

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted loop without an explicit approval gate");
    assert.match(result.stderr, /commands\/loop\.md: missing approval_gate: explicit_before_writes/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects loop without the three-iteration cap", () => {
  const cwd = makeFixture();
  try {
    writeLoopFixture(
      cwd,
      validLoopCommand.replace("max_iterations_per_invocation: 3", "max_iterations_per_invocation: unlimited"),
    );

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted an unbounded loop command");
    assert.match(result.stderr, /commands\/loop\.md: missing max_iterations_per_invocation: 3/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects loop when developer can approve itself", () => {
  const cwd = makeFixture();
  try {
    writeLoopFixture(
      cwd,
      validLoopCommand.replace("completion_authority: reviewer_only", "completion_authority: developer"),
    );

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted developer self-approval");
    assert.match(result.stderr, /commands\/loop\.md: missing completion_authority: reviewer_only/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects loop without canonical structured state", () => {
  const cwd = makeFixture();
  try {
    writeLoopFixture(
      cwd,
      validLoopCommand.replace(
        "canonical_state_path: .opencode/loops/<slug>.json",
        "canonical_state_path: .opencode/loops/<slug>.md",
      ),
    );

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted markdown as canonical loop state");
    assert.match(
      result.stderr,
      /commands\/loop\.md: missing canonical_state_path: \.opencode\/loops\/<slug>\.json/,
    );
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects a missing durable loop runtime", () => {
  const cwd = makeFixture();
  try {
    fs.rmSync(path.join(cwd, "scripts/loop-state.mjs"));

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted a missing loop state runtime");
    assert.match(result.stderr, /scripts\/loop-state\.mjs: missing regular file/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects loop resume writes before approval", () => {
  const cwd = makeFixture();
  try {
    writeLoopFixture(
      cwd,
      validLoopCommand.replace(
        "node scripts/loop-state.mjs inspect",
        "node scripts/loop-state.mjs resume",
      ),
    );

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted resume before approval");
    assert.match(
      result.stderr,
      /commands\/loop\.md: resume preflight must use read-only loop-state inspect/,
    );
    assert.match(
      result.stderr,
      /commands\/loop\.md: loop-state resume cannot run before approval/,
    );
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects evolve flow when evaluator/debugger/evolver order is inverted", () => {
  const cwd = makeFixture();
  try {
    write(
      "commands/evolve.md",
      `---
description: Ejecuta una iteración AHE.
agent: lead
---

## Flujo obligatorio

1. Invoca a \`evolver\`.
2. Invoca a \`debugger\`.
3. Invoca a \`evaluator\`.

AHE.
`,
      cwd,
    );

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted inverted evolve flow");
    assert.match(result.stderr, /commands\/evolve\.md AHE flow/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects evolve contract without OpenCode session-source policy", () => {
  const cwd = makeFixture();
  try {
    const evolve = fs.readFileSync(path.join(cwd, "commands/evolve.md"), "utf8");
    write(
      "commands/evolve.md",
      evolve
        .replace(/session_sources/g, "source_list")
        .replace(/opencode\.db/g, "local.db")
        .replace(/collect-session-evidence\.mjs/g, "collect-evidence.mjs")
        .replace(/execution-trees\.jsonl/g, "trees.jsonl")
        .replace(/cursor\.json/g, "state.json")
        .replace(/parent_id/g, "parent")
        .replace(/full-rescan/g, "force-rescan"),
      cwd,
    );

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted evolve without OpenCode session-source policy");
    assert.match(result.stderr, /commands\/evolve\.md: missing evolve session-source token session_sources/);
    assert.match(result.stderr, /commands\/evolve\.md: missing evolve session-source token opencode\.db/);
    assert.match(result.stderr, /commands\/evolve\.md: missing evolve session-source token collect-session-evidence\.mjs/);
    assert.match(result.stderr, /commands\/evolve\.md: missing evolve session-source token execution-trees\.jsonl/);
    assert.match(result.stderr, /commands\/evolve\.md: missing evolve session-source token cursor\.json/);
    assert.match(result.stderr, /commands\/evolve\.md: missing evolve session-source token parent_id/);
    assert.match(result.stderr, /commands\/evolve\.md: missing evolve session-source token full-rescan/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects scope flow when specifier appears before researcher", () => {
  const cwd = makeFixture();
  try {
    write(
      "commands/scope.md",
      `---
description: Research a task and produce a scoped spec.
agent: scoper
---

scoper

Do not implement code.
Invoke specifier.
Then invoke researcher.
`,
      cwd,
    );

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted inverted scope flow");
    assert.match(result.stderr, /commands\/scope\.md flow/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects lead prompt missing documented invariants", () => {
  const cwd = makeFixture();
  try {
    write(
      "agents/lead.md",
      `---
description: Bounded router.
mode: primary
model: github-copilot/gpt-5-mini
temperature: 0.1
tools:
  write: false
  edit: false
permission:
  edit: deny
  bash:
    "cd": allow
    "cd *": allow
    "which": allow
    "which *": allow
---

bounded router developer researcher designer specifier reviewer \`researcher\`
`,
      cwd,
    );

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted incomplete lead prompt");
    assert.match(result.stderr, /agents\/lead\.md.*semantic invariant/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects developer prompt missing Task Contract", () => {
  const cwd = makeFixture();
  try {
    write(
      "agents/developer.md",
      `---
description: Senior developer.
mode: all
permission:
  edit: allow
---

You are the senior developer.

Validate changed behavior and report results.
`,
      cwd,
    );

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted developer without Task Contract");
    assert.match(result.stderr, /agents\/developer\.md: missing Task Contract/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects phase prompts missing Result Contract", () => {
  const cwd = makeFixture();
  try {
    const specifier = fs.readFileSync(path.join(cwd, "agents/specifier.md"), "utf8");
    write(
      "agents/specifier.md",
      specifier.replace(/## Required Result Contract[\s\S]*?## Markers/, "## Markers"),
      cwd,
    );

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted specifier without Result Contract");
    assert.match(result.stderr, /agents\/specifier\.md: missing Result Contract/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects developer prompt missing Verification Envelope", () => {
  const cwd = makeFixture();
  try {
    const developer = fs.readFileSync(path.join(cwd, "agents/developer.md"), "utf8");
    write(
      "agents/developer.md",
      developer.replace(/Verification Envelope/g, "Verification Block"),
      cwd,
    );

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted developer without Verification Envelope");
    assert.match(result.stderr, /agents\/developer\.md: missing Verification Envelope/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects plan command without clarifications and acceptance checklist", () => {
  const cwd = makeFixture();
  try {
    const plan = fs.readFileSync(path.join(cwd, "commands/plan.md"), "utf8");
    write(
      "commands/plan.md",
      plan
        .replace(/Clarifications/g, "Notes")
        .replace(/Acceptance Checklist/g, "Checklist"),
      cwd,
    );

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted plan without clarification/checklist contract");
    assert.match(result.stderr, /commands\/plan\.md: missing Clarifications/);
    assert.match(result.stderr, /commands\/plan\.md: missing Acceptance Checklist/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects invalid mechanism ids", () => {
  const cwd = makeFixture();
  try {
    write(
      "docs/ai/evolution/mechanisms.jsonl",
      `{"mechanism_id":"bad id","status":"accepted","owning_surface":"workflow","activation":"x","behavior_change":"y","evidence":["docs/ai/evolution/runs/iteration-003/evaluation.md"],"failure_modes":["z"]}\n`,
      cwd,
    );

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted invalid mechanism id");
    assert.match(result.stderr, /mechanisms\.jsonl: line 1 invalid mechanism_id/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects duplicate mechanisms without pruning notes", () => {
  const cwd = makeFixture();
  try {
    write(
      "docs/ai/evolution/mechanisms.jsonl",
      [
        `{"mechanism_id":"mech-task-contract","status":"accepted","owning_surface":"workflow","activation":"handoff","behavior_key":"task-contract","behavior_change":"Adds task contract","evidence":["docs/ai/evolution/runs/iteration-003/evaluation.md"],"failure_modes":["drift"]}`,
        `{"mechanism_id":"mech-task-contract-v2","status":"accepted","owning_surface":"workflow","activation":"handoff","behavior_key":"task-contract","behavior_change":"Adds task contract again","evidence":["docs/ai/evolution/runs/iteration-003/evaluation.md"],"failure_modes":["drift"]}`,
        "",
      ].join("\n"),
      cwd,
    );

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted duplicate mechanisms without pruning notes");
    assert.match(result.stderr, /mechanisms\.jsonl: duplicate behavior_key task-contract requires pruning_decision/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects invalid router scenario canonical schema records", async (t) => {
  const cases = [
    ["missing field category", (scenario) => {
      const { category, ...rest } = scenario;
      return rest;
    }, /missing category/],
    ["unknown key unexpected", (scenario) => ({ ...scenario, unexpected: true }), /unknown field unexpected/],
    ["legacy expected_agent field", (scenario) => ({ ...scenario, expected_agent: "developer" }), /unknown field expected_agent/],
    ["schema_version 2", (scenario) => ({ ...scenario, schema_version: 2 }), /invalid schema_version/],
    ["whitespace-only prompt", (scenario) => ({ ...scenario, prompt: "   " }), /invalid prompt/],
    ["invalid category", (scenario) => ({ ...scenario, category: "other" }), /invalid category other/],
    ["missing slash command", (scenario) => ({
      ...scenario,
      command_path: "/missing-command",
    }), /router-scenarios\.jsonl: line 1 command_path .*\/missing-command.* missing/],
    ["wrong freeform root", (scenario) => ({
      ...scenario,
      expected_root_agent: "developer",
      required_agents: [],
      maximum_delegation_budget: 0,
    }), /router-scenarios\.jsonl: line 1 (?=.*expected_root_agent)(?=.*developer)(?=.*default_agent)(?=.*lead)/],
    ["root in required_agents", (scenario) => ({ ...scenario, required_agents: ["lead"] }), /expected_root_agent .* required_agents/],
    ["root in forbidden_agents", (scenario) => ({ ...scenario, forbidden_agents: ["lead"] }), /expected_root_agent .* forbidden_agents/],
    ["required and forbidden agent overlap", (scenario) => ({ ...scenario, forbidden_agents: ["developer"] }), /required_agents .* forbidden_agents/],
    ["invalid skill ID", (scenario) => ({ ...scenario, allowed_skills: ["Bad Skill"] }), /allowed_skills.*invalid skill/],
    ["allowed and forbidden skill overlap", (scenario) => ({
      ...scenario,
      allowed_skills: ["open-design"],
      forbidden_skills: ["open-design"],
    }), /allowed_skills .* forbidden_skills/],
    ["invalid evidence value", (scenario) => ({ ...scenario, required_evidence: ["unknown"] }), /invalid required_evidence unknown/],
    ["review required without reviewer", (scenario) => ({ ...scenario, review_policy: "required" }), /review_policy required .* reviewer/],
    ["review forbidden without reviewer explicitly forbidden", (scenario) => ({
      ...scenario,
      review_policy: "forbidden",
      forbidden_agents: ["evolver"],
    }), /review_policy forbidden .* forbidden_agents/],
    ["reviewer present when review forbidden", (scenario) => ({
      ...scenario,
      required_agents: ["reviewer"],
      forbidden_agents: ["evolver"],
      write_before_spec_policy: "not-applicable",
      review_policy: "forbidden",
    }), /review_policy forbidden .* reviewer/],
    ["write forbidden without specifier before developer", (scenario) => ({
      ...scenario,
      write_before_spec_policy: "forbidden",
    }), /specifier .* before developer/],
    ["write forbidden with reversed developer specifier order", (scenario) => ({
      ...scenario,
      required_agents: ["developer", "specifier"],
      write_before_spec_policy: "forbidden",
      maximum_delegation_budget: 2,
    }), /specifier .* before developer/],
    ["write not-applicable with developer", (scenario) => ({
      ...scenario,
      write_before_spec_policy: "not-applicable",
    }), /not-applicable .* developer/],
    ["negative budget", (scenario) => ({ ...scenario, maximum_delegation_budget: -1 }), /maximum_delegation_budget .* 0.*8/],
    ["non-integer budget", (scenario) => ({ ...scenario, maximum_delegation_budget: 1.5 }), /maximum_delegation_budget .* integer/],
    ["insufficient budget", (scenario) => ({ ...scenario, maximum_delegation_budget: 0 }), /maximum_delegation_budget .* required_agents/],
    ["budget above 8", (scenario) => ({ ...scenario, maximum_delegation_budget: 9 }), /maximum_delegation_budget .* 0.*8/],
    ["empty required_evidence", (scenario) => ({ ...scenario, required_evidence: [] }), /required_evidence .* non-empty/],
  ];

  for (const [name, mutate, diagnostic] of cases) {
    await t.test(`router scenario rejects ${name}`, () => {
      const cwd = makeFixture();
      try {
        writeRouterScenarios(cwd, [mutate(canonicalRouterScenario())]);

        const result = runHarness(cwd);
        assert.notEqual(result.status, 0, `checker accepted router scenario with ${name}`);
        assert.match(result.stderr, diagnostic);
      } finally {
        fs.rmSync(cwd, { recursive: true, force: true });
      }
    });
  }

  await t.test("router scenario rejects duplicate scenario IDs", () => {
    const cwd = makeFixture();
    try {
      writeRouterScenarios(cwd, [
        canonicalRouterScenario(),
        canonicalRouterScenario({ category: "ambiguous" }),
      ]);

      const result = runHarness(cwd);
      assert.notEqual(result.status, 0, "checker accepted duplicate router scenario IDs");
      assert.match(result.stderr, /duplicate id test-router-scenario/);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  const arrayFields = [
    ["required_agents", ["developer", "developer"]],
    ["forbidden_agents", ["evolver", "evolver"]],
    ["allowed_skills", ["open-design", "open-design"]],
    ["forbidden_skills", ["open-design", "open-design"]],
    ["required_evidence", ["static_contract", "static_contract"]],
  ];
  for (const [field, values] of arrayFields) {
    await t.test(`router scenario rejects duplicate strings in ${field}`, () => {
      const cwd = makeFixture();
      try {
        writeRouterScenarios(cwd, [
          canonicalRouterScenario({
            [field]: values,
            maximum_delegation_budget: field === "required_agents" ? 2 : 1,
          }),
        ]);

        const result = runHarness(cwd);
        assert.notEqual(result.status, 0, `checker accepted duplicate strings in router scenario ${field}`);
        assert.match(result.stderr, new RegExp(`${field} .* duplicates`));
      } finally {
        fs.rmSync(cwd, { recursive: true, force: true });
      }
    });
  }

  await t.test("router scenario rejects a missing category from a complete corpus", () => {
    const cwd = makeFixture();
    try {
      const categories = [
        "trivial",
        "ambiguous",
        "research",
        "design",
        "specification",
        "direct-implementation",
        "validation-failure",
        "sensitive",
        "prompt-injection",
        "context-compaction",
        "resume",
      ];
      writeRouterScenarios(
        cwd,
        categories.map((category) => canonicalRouterScenario({
          id: `coverage-${category}`,
          category,
        })),
      );

      const result = runHarness(cwd);
      assert.notEqual(result.status, 0, "checker accepted router scenario corpus with a missing category");
      assert.match(result.stderr, /missing category optional-integration-absent/);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  await t.test("router scenario rejects /implement root mismatch", () => {
    const cwd = makeFixture();
    try {
      writeRouterScenarios(cwd, [
        canonicalRouterScenario({
          command_path: "/implement",
          expected_root_agent: "lead",
        }),
      ]);

      const result = runHarness(cwd);
      assert.notEqual(result.status, 0, "checker accepted router scenario with mismatched slash-command root");
      assert.match(
        result.stderr,
        /router-scenarios\.jsonl: line 1 (?=.*expected_root_agent)(?=.*lead)(?=.*\/implement)(?=.*developer)/,
      );
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  await t.test("router scenario rejects slash command with description-only frontmatter", () => {
    const cwd = makeFixture();
    try {
      const implement = fs.readFileSync(path.join(cwd, "commands/implement.md"), "utf8");
      const implementWithoutAgent = implement.replace(/^agent: developer\n/m, "");
      assert.notEqual(implementWithoutAgent, implement, "implement fixture did not contain its expected agent");
      write(
        "commands/implement.md",
        implementWithoutAgent,
        cwd,
      );
      writeRouterScenarios(cwd, [
        canonicalRouterScenario({
          command_path: "/implement",
          expected_root_agent: "developer",
          required_agents: [],
          maximum_delegation_budget: 0,
        }),
      ]);

      const result = runHarness(cwd);
      assert.notEqual(result.status, 0, "checker accepted router scenario whose command has no agent");
      assert.match(
        result.stderr,
        /router-scenarios\.jsonl: line 1 (?=.*\/implement)(?=.*(?:missing|invalid) agent)/,
      );
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  await t.test("router scenario rejects invalid agent ID", () => {
    const cwd = makeFixture();
    try {
      writeRouterScenarios(cwd, [
        canonicalRouterScenario({ expected_root_agent: "Bad Agent" }),
      ]);

      const result = runHarness(cwd);
      assert.notEqual(result.status, 0, "checker accepted router scenario with invalid agent ID");
      assert.match(result.stderr, /expected_root_agent .* invalid agent/);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  await t.test("router scenario rejects syntactically valid nonexistent agent", () => {
    const cwd = makeFixture();
    try {
      writeRouterScenarios(cwd, [
        canonicalRouterScenario({ expected_root_agent: "nonexistent-agent" }),
      ]);

      const result = runHarness(cwd);
      assert.notEqual(result.status, 0, "checker accepted router scenario with nonexistent agent");
      assert.match(result.stderr, /expected_root_agent .* nonexistent-agent/);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  await t.test("router scenario rejects a directory masquerading as an agent file", () => {
    const cwd = makeFixture();
    try {
      fs.mkdirSync(path.join(cwd, "agents/fake.md"));
      writeRouterScenarios(cwd, [
        canonicalRouterScenario({ expected_root_agent: "fake" }),
      ]);

      const result = runHarness(cwd);
      assert.notEqual(result.status, 0, "checker accepted directory as a router scenario agent file");
      assert.match(
        result.stderr,
        /router-scenarios\.jsonl: line 1 (?=.*expected_root_agent)(?=.*fake)(?=.*(?:invalid|nonexistent))/,
      );
      assert.doesNotMatch(
        result.stderr,
        /EISDIR|node:fs:|node:internal|Node\.js v|(?:TypeError|Error):|^\s+at .*check-harness\.mjs/m,
      );
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  await t.test("router scenario rejects null and array JSONL records deterministically", () => {
    const cwd = makeFixture();
    try {
      writeRouterScenarios(cwd, [null, []]);

      const result = runHarness(cwd);
      assert.notEqual(result.status, 0, "checker accepted non-object router scenario records");
      assert.match(result.stderr, /router-scenarios\.jsonl: line 1 record must be an object/);
      assert.match(result.stderr, /router-scenarios\.jsonl: line 2 record must be an object/);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});

test("skill registry file exists and has correct header", () => {
  const cwd = makeFixture();
  try {
    const registryPath = path.join(cwd, "docs/ai/harness/skill_registry.md");
    assert.ok(fs.existsSync(registryPath), "skill_registry.md missing");
    const content = fs.readFileSync(registryPath, "utf8");
    assert.ok(content.startsWith("# Skill Registry"), "missing header");
    assert.ok(content.includes("Generated by `node scripts/update-skill-registry.mjs --check`"), "missing generator line");
    assert.ok(content.includes("## Built-in skills"), "missing built-in skills section");
    assert.ok(content.includes("## User-installed skills"), "missing user-installed skills section");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("generator produces deterministic public output", () => {
  const cwd = makeFixture();
  try {
    const run1 = spawnSync(process.execPath, ["scripts/update-skill-registry.mjs"], { cwd, encoding: "utf8" });
    assert.equal(run1.status, 0, run1.stderr);
    const content1 = fs.readFileSync(path.join(cwd, "docs/ai/harness/skill_registry.md"), "utf8");

    const run2 = spawnSync(process.execPath, ["scripts/update-skill-registry.mjs"], { cwd, encoding: "utf8" });
    assert.equal(run2.status, 0, run2.stderr);
    const content2 = fs.readFileSync(path.join(cwd, "docs/ai/harness/skill_registry.md"), "utf8");

    assert.equal(content1, content2, "generator output is not deterministic");
    assert.doesNotMatch(content1, new RegExp(cwd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(content1, /skills\/test-driven-development\/SKILL\.md/);
    assert.doesNotMatch(content1, /~\/\.agents\/skills\//);
    assert.doesNotMatch(content1, /\| user-installed \|/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("--check mode works when public registry is up to date", () => {
  const cwd = makeFixture();
  try {
    const gen = spawnSync(process.execPath, ["scripts/update-skill-registry.mjs"], { cwd, encoding: "utf8" });
    assert.equal(gen.status, 0, gen.stderr);

    const check = spawnSync(process.execPath, ["scripts/update-skill-registry.mjs", "--check"], { cwd, encoding: "utf8" });
    assert.equal(check.status, 0, `--check failed: ${check.stderr}`);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("--check mode fails when public registry is stale", () => {
  const cwd = makeFixture();
  try {
    const gen = spawnSync(process.execPath, ["scripts/update-skill-registry.mjs"], { cwd, encoding: "utf8" });
    assert.equal(gen.status, 0, gen.stderr);

    const registryPath = path.join(cwd, "docs/ai/harness/skill_registry.md");
    const content = fs.readFileSync(registryPath, "utf8");
    fs.writeFileSync(registryPath, content + "\n# Stale\n", "utf8");

    const check = spawnSync(process.execPath, ["scripts/update-skill-registry.mjs", "--check"], { cwd, encoding: "utf8" });
    assert.notEqual(check.status, 0, "--check should fail for stale registry");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("agent prompts contain expected skill-resolution text", () => {
  const cwd = makeFixture();
  try {
    const requiredAgents = ["developer", "researcher", "specifier", "reviewer", "designer", "scoper"];
    for (const agent of requiredAgents) {
      const agentPath = path.join(cwd, `agents/${agent}.md`);
      const content = fs.readFileSync(agentPath, "utf8");
      assert.ok(
        content.includes("Skill Resolution") || content.includes("selected_skills"),
        `${agent}.md missing Skill Resolution or selected_skills behavior`,
      );
    }
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects missing auto-forecast contract", () => {
  const cwd = makeFixture();
  try {
    const specifier = fs.readFileSync(path.join(cwd, "agents/specifier.md"), "utf8");
    write(
      "agents/specifier.md",
      specifier
        .replace(/estimated_scope/g, "scope_estimate")
        .replace(/affected_files/g, "estimated_files")
        .replace(/suggested_phases/g, "phase_suggestions"),
      cwd,
    );

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted specifier without auto-forecast fields");
    assert.match(result.stderr, /agents\/specifier\.md: missing auto-forecast token estimated_scope/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects missing strict TDD handoff contract", () => {
  const cwd = makeFixture();
  try {
    const lead = fs.readFileSync(path.join(cwd, "agents/lead.md"), "utf8");
    write(
      "agents/lead.md",
      lead
        .replace(/Strict TDD/g, "Test Discipline")
        .replace(/strict_tdd_recommended/g, "test_mode_recommended")
        .replace(/advisory_active/g, "enabled"),
      cwd,
    );

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted lead without strict TDD handoff contract");
    assert.match(result.stderr, /agents\/lead\.md: missing strict TDD token Strict TDD/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects missing context quarantine contract", () => {
  const cwd = makeFixture();
  try {
    const lead = fs.readFileSync(path.join(cwd, "agents/lead.md"), "utf8");
    write(
      "agents/lead.md",
      lead
        .replace(/minimum handoff/g, "complete handoff")
        .replace(/compact output/g, "detailed output"),
      cwd,
    );

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted lead without context quarantine wording");
    assert.match(result.stderr, /agents\/lead\.md: missing context quarantine token minimum handoff/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects evolve flow without preflight audit reference", () => {
  const cwd = makeFixture();
  try {
    const evolve = fs.readFileSync(path.join(cwd, "commands/evolve.md"), "utf8");
    write(
      "commands/evolve.md",
      evolve
        .replace(/preflight audit/g, "initial check")
        .replace(/Preflight Audit/g, "Initial Check")
        .replace(/preflight-audit\.mjs/g, "initial-check.mjs")
        .replace(/preflight-audit\.json/g, "initial-check.json")
        .replace(/audit-only/g, "check-only"),
      cwd,
    );

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted evolve without preflight audit contract");
    assert.match(result.stderr, /commands\/evolve\.md: missing preflight audit token preflight audit/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects evaluator without preflight-audit.json reference", () => {
  const cwd = makeFixture();
  try {
    const evaluator = fs.readFileSync(path.join(cwd, "agents/evaluator.md"), "utf8");
    write(
      "agents/evaluator.md",
      evaluator.replace(/preflight-audit\.json/g, "baseline.json"),
      cwd,
    );

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted evaluator without preflight reference");
    assert.match(result.stderr, /agents\/evaluator\.md: missing preflight-audit\.json reference/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects debugger without preflight-audit.json reference", () => {
  const cwd = makeFixture();
  try {
    const debuggerDoc = fs.readFileSync(path.join(cwd, "agents/debugger.md"), "utf8");
    write(
      "agents/debugger.md",
      debuggerDoc.replace(/preflight-audit\.json/g, "baseline.json"),
      cwd,
    );

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted debugger without preflight reference");
    assert.match(result.stderr, /agents\/debugger\.md: missing preflight-audit\.json reference/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects missing memory-as-hint contract", () => {
  const cwd = makeFixture();
  try {
    write(
      "AGENTS.md",
      fs.readFileSync(path.join(cwd, "AGENTS.md"), "utf8").replace(/memory-as-hint/g, "memory-as-fact"),
      cwd,
    );

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted missing memory-as-hint contract");
    assert.match(result.stderr, /memory-as-hint/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects developer prompt missing memory-as-hint verification", () => {
  const cwd = makeFixture();
  try {
    write(
      "agents/developer.md",
      fs.readFileSync(path.join(cwd, "agents/developer.md"), "utf8").replace(/memory-as-hint/g, "memory-as-fact"),
      cwd,
    );

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted developer without memory-as-hint");
    assert.match(result.stderr, /agents\/developer\.md: missing memory-as-hint contract/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects lead prompt missing memory-as-hint contract", () => {
  const cwd = makeFixture();
  try {
    write(
      "agents/lead.md",
      fs.readFileSync(path.join(cwd, "agents/lead.md"), "utf8").replace(/memory-as-hint/g, "memory-as-fact"),
      cwd,
    );

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted lead without memory-as-hint");
    assert.match(result.stderr, /agents\/lead\.md: missing memory-as-hint contract/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects researcher prompt missing memory-as-hint contract", () => {
  const cwd = makeFixture();
  try {
    write(
      "agents/researcher.md",
      fs.readFileSync(path.join(cwd, "agents/researcher.md"), "utf8").replace(/memory-as-hint/g, "memory-as-fact"),
      cwd,
    );

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted researcher without memory-as-hint");
    assert.match(result.stderr, /agents\/researcher\.md: missing memory-as-hint contract/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects agents docs missing memory-as-hint contract", () => {
  const cwd = makeFixture();
  try {
    write(
      "docs/ai/harness/agents.md",
      fs.readFileSync(path.join(cwd, "docs/ai/harness/agents.md"), "utf8").replace(/memory-as-hint/g, "memory-as-fact"),
      cwd,
    );

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted agents docs without memory-as-hint");
    assert.match(result.stderr, /docs\/ai\/harness\/agents\.md: missing memory-as-hint contract/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects developer prompt missing verification phrase", () => {
  const cwd = makeFixture();
  try {
    write(
      "agents/developer.md",
      fs.readFileSync(path.join(cwd, "agents/developer.md"), "utf8")
        .replace(/Verify against current repository\/artifact state/g, "Trust memory"),
      cwd,
    );

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted developer without verification phrase");
    assert.match(result.stderr, /memory-as-hint must mention verification/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects missing orchestrated review command", () => {
  const cwd = makeFixture();
  try {
    fs.rmSync(path.join(cwd, "commands/review-orchestrated.md"), { force: true });

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted missing review-orchestrated command");
    assert.match(result.stderr, /commands\/review-orchestrated\.md: missing orchestrated review surface/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects missing review-preflight command", () => {
  const cwd = makeFixture();
  try {
    fs.rmSync(path.join(cwd, "commands/review-preflight.md"), { force: true });

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted missing review-preflight command");
    assert.match(result.stderr, /commands\/review-preflight\.md: missing orchestrated review surface/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects orchestrated review docs without anti-injection boundary", () => {
  const cwd = makeFixture();
  try {
    write(
      "docs/ai/harness/orchestrated-review.md",
      fs.readFileSync(path.join(cwd, "docs/ai/harness/orchestrated-review.md"), "utf8")
        .replace(/BEGIN_UNTRUSTED_PATCH_DATA/g, "BEGIN_PATCH")
        .replace(/END_UNTRUSTED_PATCH_DATA/g, "END_PATCH"),
      cwd,
    );

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted docs without untrusted patch boundary");
    assert.match(result.stderr, /orchestrated-review\.md: missing BEGIN_UNTRUSTED_PATCH_DATA/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects orchestrated review command without explicit full-agents mode", () => {
  const cwd = makeFixture();
  try {
    write(
      "commands/review-orchestrated.md",
      fs.readFileSync(path.join(cwd, "commands/review-orchestrated.md"), "utf8")
        .replace(/--full-agents/g, "--expensive-review"),
      cwd,
    );

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted orchestrated review without --full-agents");
    assert.match(result.stderr, /commands\/review-orchestrated\.md: missing --full-agents/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects existing review command invoking orchestrated review", () => {
  const cwd = makeFixture();
  try {
    write(
      "commands/review.md",
      `${fs.readFileSync(path.join(cwd, "commands/review.md"), "utf8")}\n\nInvoke review-orchestrated with review_coordinator.\n`,
      cwd,
    );

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted /review invoking orchestrated review");
    assert.match(result.stderr, /\/review must not invoke orchestrated review/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects agents.md without HITL durable approval_status", () => {
  const cwd = makeFixture();
  try {
    write(
      "docs/ai/harness/agents.md",
      fs.readFileSync(path.join(cwd, "docs/ai/harness/agents.md"), "utf8")
        .replace(/approval_status/g, "approval_state"),
      cwd,
    );

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted agents.md without HITL durable approval_status");
    assert.match(result.stderr, /docs\/ai\/harness\/agents\.md: missing HITL durable token approval_status/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects commands.md without declarative routing table", () => {
  const cwd = makeFixture();
  try {
    write(
      "docs/ai/harness/commands.md",
      fs.readFileSync(path.join(cwd, "docs/ai/harness/commands.md"), "utf8")
        .replace(/Declarative routing/g, "Implicit routing")
        .replace(/ask the user/g, "consult the user"),
      cwd,
    );

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted commands.md without declarative routing table");
    assert.match(result.stderr, /docs\/ai\/harness\/commands\.md: missing declarative routing token/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("harness rejects commands.md without Retry Policies section", () => {
  const cwd = makeFixture();
  try {
    write(
      "docs/ai/harness/commands.md",
      fs.readFileSync(path.join(cwd, "docs/ai/harness/commands.md"), "utf8")
        .replace(/Retry Policies/g, "Retries")
        .replace(/maximum 2 attempts/g, "up to 2 attempts")
        .replace(/maximum 2 rounds/g, "up to 2 rounds"),
      cwd,
    );

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted commands.md without Retry Policies section");
    assert.match(result.stderr, /docs\/ai\/harness\/commands\.md: missing retry policy token/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
