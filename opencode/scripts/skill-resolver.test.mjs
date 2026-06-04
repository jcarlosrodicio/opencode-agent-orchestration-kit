#!/usr/bin/env node
/**
 * Skill Resolver Tests
 *
 * Validates the two-stage skill resolution: prefilter + ranking + shortlist output.
 * Uses node:assert — no external dependencies.
 *
 * Usage:
 *   node scripts/skill-resolver.test.mjs
 */

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import {
  loadRegistry,
  loadSnapshot,
  filterByAgent,
  filterByPhase,
  filterByDomains,
  filterByStacks,
  rankCandidates,
  generateShortlist,
  formatShortlist,
} from "./skill-resolver.mjs";

// ── Test fixtures ────────────────────────────────────────────────────────

const FIXTURE_REGISTRY = {
  generated_at: "2026-06-03T00:00:00Z",
  schema_version: 2,
  skills: [
    {
      name: "test-driven-development",
      source: "built-in",
      phase: "verify",
      domains: ["testing", "debugging"],
      stacks: ["any"],
      allowed_agents: ["developer", "reviewer", "specifier", "lead"],
      surfaces: ["code-implementation", "bug-fix"],
      skill_source: "built-in",
      status: "active",
      description: "Drives development with tests.",
      load_path: "skills/test-driven-development/SKILL.md",
      origin: null,
    },
    {
      name: "security-and-hardening",
      source: "built-in",
      phase: "build",
      domains: ["security"],
      stacks: ["any"],
      allowed_agents: ["developer", "researcher", "designer", "specifier", "reviewer", "scoper", "lead"],
      surfaces: ["input-validation", "auth"],
      skill_source: "built-in",
      status: "active",
      description: "Hardens code against vulnerabilities.",
      load_path: "skills/security-and-hardening/SKILL.md",
      origin: null,
    },
    {
      name: "code-review-and-quality",
      source: "built-in",
      phase: "review",
      domains: ["review", "security", "testing", "performance"],
      stacks: ["any"],
      allowed_agents: ["reviewer", "lead", "developer"],
      surfaces: ["diff-review"],
      skill_source: "built-in",
      status: "active",
      description: "Conducts multi-axis code review.",
      load_path: "skills/code-review-and-quality/SKILL.md",
      origin: null,
    },
    {
      name: "debugging-and-error-recovery",
      source: "built-in",
      phase: "verify",
      domains: ["debugging", "testing"],
      stacks: ["any"],
      allowed_agents: ["developer", "lead", "reviewer"],
      surfaces: ["bug-fix"],
      skill_source: "built-in",
      status: "active",
      description: "Guides systematic root-cause debugging.",
      load_path: "skills/debugging-and-error-recovery/SKILL.md",
      origin: null,
    },
    {
      name: "open-design",
      source: "built-in",
      phase: "build",
      domains: ["ui-ux"],
      stacks: ["open-design"],
      allowed_agents: ["designer", "lead", "developer"],
      surfaces: ["visual-design"],
      skill_source: "built-in",
      status: "active",
      description: "Use the Open Design workbench for visual designs.",
      load_path: "skills/open-design/SKILL.md",
      origin: null,
    },
    {
      name: "flutter-accessibility-audit",
      source: "user-installed",
      phase: "unknown",
      domains: [],
      stacks: ["any"],
      allowed_agents: ["developer", "researcher", "designer", "specifier", "reviewer", "scoper", "lead"],
      surfaces: [],
      skill_source: "user-installed",
      status: "active",
      description: "Triggers an accessibility scan for Flutter widgets.",
      load_path: "~/.agents/skills/flutter-accessibility-audit/SKILL.md",
      origin: null,
    },
    {
      name: "deprecated-skill",
      source: "built-in",
      phase: "build",
      domains: ["testing"],
      stacks: ["any"],
      allowed_agents: ["developer"],
      surfaces: [],
      skill_source: "built-in",
      status: "deprecated",
      description: "An old deprecated skill.",
      load_path: "skills/deprecated-skill/SKILL.md",
      origin: null,
    },
    {
      name: "no-phase-skill",
      source: "user-installed",
      phase: "unknown",
      domains: [],
      stacks: ["any"],
      allowed_agents: ["developer", "lead"],
      surfaces: [],
      skill_source: "user-installed",
      status: "active",
      description: "A skill without specific phase.",
      load_path: "~/.agents/skills/no-phase-skill/SKILL.md",
      origin: null,
    },
    {
      name: "no-agents-skill",
      source: "user-installed",
      phase: "build",
      domains: ["testing"],
      stacks: ["any"],
      allowed_agents: [],
      surfaces: [],
      skill_source: "user-installed",
      status: "active",
      description: "A skill without allowed_agents defined.",
      load_path: "~/.agents/skills/no-agents-skill/SKILL.md",
      origin: null,
    },
    {
      name: "meta-skill",
      source: "built-in",
      phase: "meta",
      domains: ["orchestration"],
      stacks: ["any"],
      allowed_agents: ["lead", "developer"],
      surfaces: [],
      skill_source: "built-in",
      status: "active",
      description: "Helps discover and select other skills.",
      load_path: "skills/meta-skill/SKILL.md",
      origin: null,
    },
    {
      name: "operate-skill",
      source: "built-in",
      phase: "operate",
      domains: ["orchestration"],
      stacks: ["harness"],
      allowed_agents: ["lead", "developer"],
      surfaces: [],
      skill_source: "built-in",
      status: "active",
      description: "Operates harness runtime loops.",
      load_path: "skills/operate-skill/SKILL.md",
      origin: null,
    },
    {
      name: "experimental-skill",
      source: "built-in",
      phase: "build",
      domains: ["testing"],
      stacks: ["any"],
      allowed_agents: ["developer"],
      surfaces: [],
      skill_source: "built-in",
      status: "experimental",
      description: "An experimental skill.",
      load_path: "skills/experimental-skill/SKILL.md",
      origin: null,
    },
    {
      name: "flutter-only-skill",
      source: "user-installed",
      phase: "build",
      domains: ["ui-ux", "mobile"],
      stacks: ["flutter"],
      allowed_agents: ["developer", "designer"],
      surfaces: [],
      skill_source: "user-installed",
      status: "active",
      description: "Flutter specific UI skill.",
      load_path: "~/.agents/skills/flutter-only-skill/SKILL.md",
      origin: null,
    },
  ],
};

const FIXTURE_SNAPSHOT = {
  schema_version: 1,
  repo_root: "/tmp/opencode",
  stacks_detected: [
    { id: "node", confidence: "high", evidence: ["package.json"] },
    { id: "typescript", confidence: "high", evidence: ["tsconfig.json"] },
  ],
  domains_detected: [
    { id: "orchestration", confidence: "high", evidence: ["docs/ai/harness/**"] },
    { id: "testing", confidence: "high", evidence: ["**/*.test.*"] },
    { id: "documentation", confidence: "high", evidence: ["docs/**/*.md"] },
    { id: "specification", confidence: "high", evidence: ["docs/ai/specs/**"] },
  ],
  surfaces_detected: [
    { id: "harness", confidence: "high", evidence: ["AGENTS.md"] },
  ],
  unknowns: [],
  generated_by: "lead prefilter",
  generated_at: "2026-06-03T00:00:00Z",
};

// ── Helpers ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err });
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

function assertIncludes(arr, name, msg) {
  assert.ok(
    arr.some((s) => s.name === name),
    msg || `Expected shortlist to include "${name}"`,
  );
}

function assertExcludes(arr, name, msg) {
  assert.ok(
    !arr.some((s) => s.name === name),
    msg || `Expected shortlist to NOT include "${name}"`,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────

console.log("\n=== Skill Resolver Tests ===\n");

// ── T1: developer + build → shortlist includes build-phase skills, excludes Flutter ──

console.log("T1: developer + build");

test("includes security-and-hardening (build phase, security domain match via taskDomains)", () => {
  const shortlist = generateShortlist({
    targetAgent: "developer",
    taskPhase: "build",
    taskDomains: ["security", "testing"],
    registry: FIXTURE_REGISTRY,
    snapshot: FIXTURE_SNAPSHOT,
  });
  assertIncludes(shortlist.candidates, "security-and-hardening");
});

test("excludes no-agents-skill (empty allowed_agents = no agents allowed)", () => {
  const shortlist = generateShortlist({
    targetAgent: "developer",
    taskPhase: "build",
    taskDomains: ["security", "testing"],
    registry: FIXTURE_REGISTRY,
    snapshot: FIXTURE_SNAPSHOT,
  });
  assertExcludes(shortlist.candidates, "no-agents-skill", "Empty allowed_agents means no agents allowed");
});

test("excludes test-driven-development (phase verify != build, not meta/operate)", () => {
  const shortlist = generateShortlist({
    targetAgent: "developer",
    taskPhase: "build",
    taskDomains: ["security", "testing"],
    registry: FIXTURE_REGISTRY,
    snapshot: FIXTURE_SNAPSHOT,
  });
  assertExcludes(shortlist.candidates, "test-driven-development", "verify phase excluded from build");
});

test("excludes flutter-only-skill (stack mismatch: flutter vs node/typescript)", () => {
  const shortlist = generateShortlist({
    targetAgent: "developer",
    taskPhase: "build",
    taskDomains: ["security", "testing"],
    registry: FIXTURE_REGISTRY,
    snapshot: FIXTURE_SNAPSHOT,
  });
  assertExcludes(shortlist.candidates, "flutter-only-skill");
});

test("excludes code-review-and-quality (phase review != build)", () => {
  const shortlist = generateShortlist({
    targetAgent: "developer",
    taskPhase: "build",
    taskDomains: ["security", "testing"],
    registry: FIXTURE_REGISTRY,
    snapshot: FIXTURE_SNAPSHOT,
  });
  assertExcludes(shortlist.candidates, "code-review-and-quality");
});

// ── T2: reviewer + review → prioritizes review skills ──

console.log("\nT2: reviewer + review");

test("includes code-review-and-quality (review phase, reviewer agent)", () => {
  const shortlist = generateShortlist({
    targetAgent: "reviewer",
    taskPhase: "review",
    taskDomains: ["review"],
    registry: FIXTURE_REGISTRY,
    snapshot: FIXTURE_SNAPSHOT,
  });
  assertIncludes(shortlist.candidates, "code-review-and-quality");
});

test("excludes test-driven-development (phase verify != review)", () => {
  const shortlist = generateShortlist({
    targetAgent: "reviewer",
    taskPhase: "review",
    taskDomains: ["review"],
    registry: FIXTURE_REGISTRY,
    snapshot: FIXTURE_SNAPSHOT,
  });
  assertExcludes(shortlist.candidates, "test-driven-development", "verify phase excluded from review");
});

test("code-review-and-quality has high confidence for reviewer+review", () => {
  const shortlist = generateShortlist({
    targetAgent: "reviewer",
    taskPhase: "review",
    taskDomains: ["review"],
    registry: FIXTURE_REGISTRY,
    snapshot: FIXTURE_SNAPSHOT,
  });
  const crq = shortlist.candidates.find((s) => s.name === "code-review-and-quality");
  assert.ok(crq, "code-review-and-quality should be in candidates");
  assert.equal(crq.confidence, "high", "Should have high confidence");
});

// ── T3: agent not allowed → empty shortlist ──

console.log("\nT3: agent not allowed");

test("returns empty candidates for non-existent agent", () => {
  const shortlist = generateShortlist({
    targetAgent: "nonexistent-agent",
    taskPhase: "build",
    taskDomains: ["testing"],
    registry: FIXTURE_REGISTRY,
    snapshot: FIXTURE_SNAPSHOT,
  });
  assert.equal(shortlist.candidates.length, 0, "Should have 0 candidates");
});

// ── T4: 0 matches → empty shortlist + full omitted_summary ──

console.log("\nT4: 0 matches");

test("omitted_summary has filtered_by_agent count when no agent matches", () => {
  const shortlist = generateShortlist({
    targetAgent: "nonexistent-agent",
    taskPhase: "build",
    taskDomains: ["testing"],
    registry: FIXTURE_REGISTRY,
    snapshot: FIXTURE_SNAPSHOT,
  });
  assert.ok(
    shortlist.omitted_summary.filtered_by_agent >= 0,
    "Should have filtered_by_agent count",
  );
  assert.equal(shortlist.candidates.length, 0);
});

// ── T5: phase unknown → no phase filtering ──

console.log("\nT5: phase unknown");

test("does not filter by phase when taskPhase is unknown", () => {
  const shortlist = generateShortlist({
    targetAgent: "developer",
    taskPhase: "unknown",
    taskDomains: [],
    registry: FIXTURE_REGISTRY,
    snapshot: FIXTURE_SNAPSHOT,
  });
  // With unknown phase, more skills should pass through
  assert.ok(shortlist.candidates.length > 3, "Should have more candidates with unknown phase");
});

// ── T6: output format → contains expected sections ──

console.log("\nT6: output format");

test("formatShortlist contains all required sections", () => {
  const shortlist = generateShortlist({
    targetAgent: "developer",
    taskPhase: "build",
    taskDomains: ["testing"],
    registry: FIXTURE_REGISTRY,
    snapshot: FIXTURE_SNAPSHOT,
  });
  const output = formatShortlist(shortlist);
  assert.ok(output.includes("=== Skill Shortlist ==="), "Missing header");
  assert.ok(output.includes("Target Agent:"), "Missing target agent");
  assert.ok(output.includes("Task Phase:"), "Missing task phase");
  assert.ok(output.includes("--- Candidates"), "Missing candidates section");
  assert.ok(output.includes("--- Omitted Summary ---"), "Missing omitted summary");
  assert.ok(output.includes("--- Recommendation ---"), "Missing recommendation");
  assert.ok(output.includes("filtered_by_agent:"), "Missing filtered_by_agent");
  assert.ok(output.includes("filtered_by_phase:"), "Missing filtered_by_phase");
  assert.ok(output.includes("filtered_by_domain:"), "Missing filtered_by_domain");
  assert.ok(output.includes("filtered_by_stack:"), "Missing filtered_by_stack");
  assert.ok(output.includes("suggested_final_selection:"), "Missing suggested_final_selection");
});

test("formatShortlist includes Reasons for each candidate", () => {
  const shortlist = generateShortlist({
    targetAgent: "developer",
    taskPhase: "build",
    taskDomains: ["testing"],
    registry: FIXTURE_REGISTRY,
    snapshot: FIXTURE_SNAPSHOT,
  });
  const output = formatShortlist(shortlist);
  assert.ok(output.includes("Reasons:"), "Missing Reasons section");
  assert.ok(output.includes("Load:"), "Missing Load path");
});

// ── T7: max 8 candidates ──

console.log("\nT7: max 8 candidates");

test("never returns more than 8 candidates", () => {
  const shortlist = generateShortlist({
    targetAgent: "developer",
    taskPhase: "unknown",
    taskDomains: [],
    registry: FIXTURE_REGISTRY,
    snapshot: FIXTURE_SNAPSHOT,
  });
  assert.ok(
    shortlist.candidates.length <= 8,
    `Expected at most 8 candidates, got ${shortlist.candidates.length}`,
  );
});

// ── T8: deprecated not appearing ──

console.log("\nT8: deprecated excluded");

test("deprecated skills are excluded from candidates", () => {
  const shortlist = generateShortlist({
    targetAgent: "developer",
    taskPhase: "build",
    taskDomains: ["testing"],
    registry: FIXTURE_REGISTRY,
    snapshot: FIXTURE_SNAPSHOT,
  });
  assertExcludes(shortlist.candidates, "deprecated-skill", "Deprecated skill should be excluded");
});

// ── T9: confidence levels ──

console.log("\nT9: confidence levels");

test("high confidence for exact phase + domain + agent match", () => {
  const shortlist = generateShortlist({
    targetAgent: "developer",
    taskPhase: "build",
    taskDomains: ["security"],
    registry: FIXTURE_REGISTRY,
    snapshot: FIXTURE_SNAPSHOT,
  });
  const sec = shortlist.candidates.find((s) => s.name === "security-and-hardening");
  assert.ok(sec, "security-and-hardening should be in candidates");
  assert.equal(sec.confidence, "high", "Should have high confidence");
});

// ── T10: reasons are populated ──

console.log("\nT10: reasons populated");

test("each candidate has at least one reason", () => {
  const shortlist = generateShortlist({
    targetAgent: "developer",
    taskPhase: "build",
    taskDomains: ["security", "testing"],
    registry: FIXTURE_REGISTRY,
    snapshot: FIXTURE_SNAPSHOT,
  });
  for (const candidate of shortlist.candidates) {
    assert.ok(
      candidate.reasons.length > 0,
      `${candidate.name} should have at least one reason`,
    );
  }
});

// ── T11: meta/operate phase filtering ──

console.log("\nT11: meta/operate phase filtering");

test("meta skills included when task_phase is build (meta/operate pass through)", () => {
  const shortlist = generateShortlist({
    targetAgent: "developer",
    taskPhase: "build",
    taskDomains: ["testing"],
    registry: FIXTURE_REGISTRY,
    snapshot: FIXTURE_SNAPSHOT,
  });
  // meta-skill has phase=meta, should pass through the phase filter
  assertIncludes(shortlist.candidates, "meta-skill");
});

test("operate skills included when task_phase is build (meta/operate pass through)", () => {
  const shortlist = generateShortlist({
    targetAgent: "developer",
    taskPhase: "build",
    taskDomains: ["testing"],
    registry: FIXTURE_REGISTRY,
    snapshot: FIXTURE_SNAPSHOT,
  });
  // operate-skill has phase=operate, allowed_agents=[lead, developer], stacks=[harness]
  // It passes agent filter (developer) and phase filter (operate passes through)
  // But stacks=[harness] and snapshot has node/typescript, not harness → filtered by stack
  assertExcludes(shortlist.candidates, "operate-skill", "operate skill filtered by stack mismatch");
});

// ── T12: empty registry ──

console.log("\nT12: edge cases");

test("empty registry produces empty shortlist", () => {
  const shortlist = generateShortlist({
    targetAgent: "developer",
    taskPhase: "build",
    taskDomains: ["testing"],
    registry: { skills: [] },
    snapshot: FIXTURE_SNAPSHOT,
  });
  assert.equal(shortlist.candidates.length, 0);
});

test("missing snapshot still works (empty domains/stacks)", () => {
  const shortlist = generateShortlist({
    targetAgent: "developer",
    taskPhase: "build",
    taskDomains: ["testing"],
    registry: FIXTURE_REGISTRY,
    snapshot: null,
  });
  // Should still find skills by agent + phase + domain match
  assert.ok(shortlist.candidates.length > 0, "Should have candidates even without snapshot");
});

// ── T13: external skills integration ─────────────────────────────────────

console.log("\nT13: external skills integration");

// Add external skills to the fixture for these tests
const EXTERNAL_SKILLS = [
  {
    name: "context-engineering",
    source: "external",
    phase: "build",
    domains: ["context-management", "orchestration"],
    stacks: ["any"],
    allowed_agents: ["lead", "researcher", "specifier", "developer"],
    surfaces: ["session-setup", "context-loading"],
    skill_source: "external",
    status: "active",
    description: "Optimizes agent context setup.",
    load_path: "skills/context-engineering/SKILL.md",
    origin: "addyosmani/agent-skills",
  },
  {
    name: "iterative-retrieval",
    source: "external",
    phase: "operate",
    domains: ["orchestration", "context-management", "research"],
    stacks: ["any", "harness"],
    allowed_agents: ["lead", "researcher", "developer"],
    surfaces: ["context-loading", "multi-agent-orchestration"],
    skill_source: "external",
    status: "active",
    description: "Pattern for progressively refining context retrieval.",
    load_path: "skills/iterative-retrieval/SKILL.md",
    origin: "affaan-m/ecc",
  },
  {
    name: "doubt-driven-development",
    source: "external",
    phase: "review",
    domains: ["review", "debugging", "security"],
    stacks: ["any"],
    allowed_agents: ["lead", "developer", "reviewer"],
    surfaces: ["code-implementation", "adversarial-review"],
    skill_source: "external",
    status: "active",
    description: "Subjects every non-trivial decision to adversarial review.",
    load_path: "skills/doubt-driven-development/SKILL.md",
    origin: "addyosmani/agent-skills",
  },
  {
    name: "verification-loop",
    source: "external",
    phase: "verify",
    domains: ["testing", "evaluation", "release"],
    stacks: ["any"],
    allowed_agents: ["lead", "developer", "reviewer", "evaluator"],
    surfaces: ["quality-gates", "pre-pr-checks"],
    skill_source: "external",
    status: "active",
    description: "Comprehensive multi-phase verification system.",
    load_path: "skills/verification-loop/SKILL.md",
    origin: "affaan-m/ecc",
  },
  {
    name: "using-agent-skills",
    source: "external",
    phase: "meta",
    domains: ["orchestration", "specification"],
    stacks: ["any", "harness"],
    allowed_agents: ["lead", "researcher", "specifier"],
    surfaces: ["skill-discovery", "orchestration"],
    skill_source: "external",
    status: "active",
    description: "Discovers and invokes agent skills.",
    load_path: "skills/using-agent-skills/SKILL.md",
    origin: "addyosmani/agent-skills",
  },
  {
    name: "autonomous-loops",
    source: "external",
    phase: "operate",
    domains: ["orchestration", "evolution", "release"],
    stacks: ["any", "harness"],
    allowed_agents: ["lead", "evolver"],
    surfaces: ["autonomous-orchestration", "ci-cd-pipelines"],
    skill_source: "external",
    status: "active",
    description: "Patterns and architectures for autonomous loops.",
    load_path: "skills/autonomous-loops/SKILL.md",
    origin: "affaan-m/ecc",
  },
];

const REGISTRY_WITH_EXTERNAL = {
  ...FIXTURE_REGISTRY,
  skills: [...FIXTURE_REGISTRY.skills, ...EXTERNAL_SKILLS],
};

test("context-engineering appears in shortlist for developer + build", () => {
  const shortlist = generateShortlist({
    targetAgent: "developer",
    taskPhase: "build",
    taskDomains: ["context-management"],
    registry: REGISTRY_WITH_EXTERNAL,
    snapshot: FIXTURE_SNAPSHOT,
  });
  assertIncludes(shortlist.candidates, "context-engineering");
});

test("using-agent-skills appears in shortlist for lead + meta", () => {
  const shortlist = generateShortlist({
    targetAgent: "lead",
    taskPhase: "meta",
    taskDomains: ["orchestration"],
    registry: REGISTRY_WITH_EXTERNAL,
    snapshot: FIXTURE_SNAPSHOT,
  });
  assertIncludes(shortlist.candidates, "using-agent-skills");
});

test("doubt-driven-development appears for reviewer + review", () => {
  const shortlist = generateShortlist({
    targetAgent: "reviewer",
    taskPhase: "review",
    taskDomains: ["review"],
    registry: REGISTRY_WITH_EXTERNAL,
    snapshot: FIXTURE_SNAPSHOT,
  });
  assertIncludes(shortlist.candidates, "doubt-driven-development");
});

test("verification-loop appears for developer + verify", () => {
  const shortlist = generateShortlist({
    targetAgent: "developer",
    taskPhase: "verify",
    taskDomains: ["testing"],
    registry: REGISTRY_WITH_EXTERNAL,
    snapshot: FIXTURE_SNAPSHOT,
  });
  assertIncludes(shortlist.candidates, "verification-loop");
});

test("all external skills have skill_source=external and origin set", () => {
  for (const skill of EXTERNAL_SKILLS) {
    assert.equal(skill.skill_source, "external", `${skill.name} should have skill_source=external`);
    assert.ok(skill.origin, `${skill.name} should have origin set`);
    assert.ok(skill.origin.length > 0, `${skill.name} origin should not be empty`);
  }
});

test("external skills have required metadata fields", () => {
  const requiredFields = ["name", "phase", "domains", "stacks", "allowed_agents", "skill_source", "origin", "status"];
  for (const skill of EXTERNAL_SKILLS) {
    for (const field of requiredFields) {
      assert.ok(field in skill, `${skill.name} should have field '${field}'`);
    }
  }
});

test("autonomous-loops appears for lead + operate", () => {
  const shortlist = generateShortlist({
    targetAgent: "lead",
    taskPhase: "operate",
    taskDomains: ["orchestration"],
    registry: REGISTRY_WITH_EXTERNAL,
    snapshot: FIXTURE_SNAPSHOT,
  });
  assertIncludes(shortlist.candidates, "autonomous-loops");
});

test("iterative-retrieval appears for lead + operate", () => {
  const shortlist = generateShortlist({
    targetAgent: "lead",
    taskPhase: "operate",
    taskDomains: ["orchestration", "context-management"],
    registry: REGISTRY_WITH_EXTERNAL,
    snapshot: FIXTURE_SNAPSHOT,
  });
  assertIncludes(shortlist.candidates, "iterative-retrieval");
});

// ── Summary ──────────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);

if (failed > 0) {
  console.log("Failures:");
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.error.message}`);
  }
  process.exit(1);
}

process.exit(0);
