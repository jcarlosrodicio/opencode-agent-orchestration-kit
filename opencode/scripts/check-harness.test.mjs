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
      return rel !== ".git" && !rel.startsWith(`.git${path.sep}`);
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

test("harness accepts prose evidence that mentions markdown filenames", () => {
  const cwd = makeFixture();
  try {
    const result = runHarness(cwd);
    assert.equal(result.status, 0, result.stderr);
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

test("harness rejects invalid router scenarios", () => {
  const cwd = makeFixture();
  try {
    write(
      "docs/ai/evolution/benchmarks/router-scenarios.jsonl",
      `{"id":"bad-router","prompt":"x","expected_agent":"wizard","command_path":"feature","allowed_skills":"none","forbidden_sidecars":[],"required_evidence":["static_contract"]}\n`,
      cwd,
    );

    const result = runHarness(cwd);
    assert.notEqual(result.status, 0, "checker accepted invalid router scenario");
    assert.match(result.stderr, /router-scenarios\.jsonl: line 1 invalid expected_agent/);
    assert.match(result.stderr, /router-scenarios\.jsonl: line 1 allowed_skills must be an array/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
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
