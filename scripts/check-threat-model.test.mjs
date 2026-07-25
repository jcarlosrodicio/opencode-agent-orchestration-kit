import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  parseMarkdownTable,
  validateThreatModel,
} from "./check-threat-model.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const AGENTS = [
  "debugger",
  "designer",
  "developer",
  "evaluator",
  "evolver",
  "lead",
  "researcher",
  "review_api",
  "review_coordinator",
  "review_quality",
  "review_security",
  "review_tests",
  "reviewer",
  "scoper",
  "specifier",
];
const SCENARIOS = [
  "diff-injection-is-data",
  "repo-doc-is-data",
  "external-symlink-rejected",
  "path-traversal-rejected",
  "control-filename-rejected",
  "rtk-wrapper-needs-approval",
  "review-network-not-allowed",
  "approval-hash-is-immutable",
  "credential-canary-stays-local",
  "unpinned-ref-needs-approval",
  "repeated-event-rejected",
];

function table(heading, headers, rows) {
  return [
    `## ${heading}`,
    "",
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
    "",
  ].join("\n");
}

function validModel() {
  const actors = Array.from({ length: 6 }, (_, index) => [
    `AC-${String(index + 1).padStart(3, "0")}`,
    "Actor",
    "untrusted",
    "Capability",
  ]);
  const assets = Array.from({ length: 10 }, (_, index) => [
    `A-${String(index + 1).padStart(3, "0")}`,
    "Asset",
    "integrity",
  ]);
  const boundaries = Array.from({ length: 9 }, (_, index) => [
    `TB-${String(index + 1).padStart(3, "0")}`,
    "Boundary",
    "Flow",
  ]);
  const risks = Array.from({ length: 20 }, (_, index) => [
    `TM-${String(index + 1).padStart(3, "0")}`,
    "Risk",
    "AC-002",
    "A-001",
    "TB-001",
    "Concrete abuse",
    "medium",
    "Existing control",
    "limitation:fixture evidence",
    "partially-mitigated",
    "Residual remains",
    "maintainer",
    "permission or runtime change",
  ]);
  const agentRows = AGENTS.map((agent) => [
    agent,
    "deny",
    "ask",
    "deny",
    "deny",
    "none",
    "role",
    `opencode/agents/${agent}.md`,
  ]);
  const scenarioRows = SCENARIOS.map((scenario) => [
    scenario,
    "TM-001",
    "test:opencode/scripts/adversarial-harness.test.mjs",
  ]);
  return [
    "# Threat Model",
    "## Scope and security objectives",
    "Portable fixture.",
    table("Actors", ["ID", "Actor", "Trust", "Capabilities"], actors),
    table("Assets", ["ID", "Asset", "Protection"], assets),
    table("Trust boundaries", ["ID", "Boundary", "Flow"], boundaries),
    table(
      "Agent capabilities",
      [
        "Agent",
        "Edit",
        "Shell",
        "Network",
        "External directory",
        "Delegation",
        "Role",
        "Source",
      ],
      agentRows,
    ),
    table(
      "External surfaces",
      ["Surface", "Boundary", "Controls or limitations"],
      [["Registry", "TB-006", "Pinned references"]],
    ),
    table(
      "Persistence surfaces",
      [
        "Surface",
        "Owner",
        "Sensitivity",
        "Lifecycle",
        "Controls or limitations",
      ],
      [["State", "operator", "private", "create/read/delete", "limited access"]],
    ),
    "## Data flows",
    "1. Request -> agent -> tool.",
    table(
      "Risk register",
      [
        "ID",
        "Title",
        "Actor or input",
        "Assets",
        "Boundaries",
        "Abuse",
        "Severity",
        "Controls",
        "Evidence",
        "Status",
        "Residual",
        "Authority",
        "Review trigger",
      ],
      risks,
    ),
    table(
      "Adversarial traceability",
      ["Scenario ID", "Risk ID", "Evidence"],
      scenarioRows,
    ),
    "## Residual risks and assumptions",
    "The policy layer is not an operating-system sandbox.",
    "## Private and public boundary",
    "Only portable mechanisms are public.",
  ].join("\n\n");
}

test("parseMarkdownTable returns strict named columns", () => {
  assert.deepEqual(
    parseMarkdownTable(
      table(
        "Assets",
        ["ID", "Asset", "Protection"],
        [["A-001", "Intent", "integrity"]],
      ),
      "Assets",
      ["ID", "Asset", "Protection"],
    ),
    [{ ID: "A-001", Asset: "Intent", Protection: "integrity" }],
  );
});

test("the minimal complete model validates", () => {
  assert.doesNotThrow(() =>
    validateThreatModel(validModel(), {
      agentIds: AGENTS,
      scenarioIds: SCENARIOS,
    }),
  );
});

for (const [label, mutate, pattern] of [
  [
    "missing section",
    (text) => text.replace("## Data flows", "## Missing"),
    /Data flows/,
  ],
  [
    "duplicate asset",
    (text) => text.replace("A-002 | Asset", "A-001 | Asset"),
    /duplicate.*A-001/i,
  ],
  [
    "bad severity",
    (text) => text.replace("| medium |", "| critical |"),
    /severity/i,
  ],
  [
    "bad status",
    (text) =>
      text.replace("| partially-mitigated |", "| unknown |"),
    /status/i,
  ],
  [
    "unknown asset",
    (text) => text.replace("| A-001 | TB-001 |", "| A-999 | TB-001 |"),
    /A-999/,
  ],
  [
    "unknown boundary",
    (text) =>
      text.replace("| TB-001 | Concrete", "| TB-999 | Concrete"),
    /TB-999/,
  ],
  [
    "bad evidence",
    (text) =>
      text.replace("limitation:fixture evidence", "fixture evidence"),
    /evidence/i,
  ],
  [
    "missing agent",
    (text) => text.replace(/\| debugger \|[^\n]+\n/, ""),
    /debugger/,
  ],
  [
    "duplicate scenario",
    (text) =>
      text.replace("repo-doc-is-data", "diff-injection-is-data"),
    /scenario/i,
  ],
  [
    "private path",
    (text) =>
      `${text}\n${["", "Users", "example", "private"].join("/")}\n`,
    /private marker/i,
  ],
]) {
  test(`validateThreatModel rejects ${label}`, () => {
    assert.throws(
      () =>
        validateThreatModel(mutate(validModel()), {
          agentIds: AGENTS,
          scenarioIds: SCENARIOS,
        }),
      pattern,
    );
  });
}

test("accepted risks require maintainer authority and a review trigger", () => {
  const accepted = validModel()
    .replace("partially-mitigated", "accepted")
    .replace(
      "| maintainer | permission or runtime change |",
      "| team | none |",
    );
  assert.throws(
    () =>
      validateThreatModel(accepted, {
        agentIds: AGENTS,
        scenarioIds: SCENARIOS,
      }),
    /accepted.*maintainer.*review trigger/i,
  );
});

test("the canonical repository model validates", () => {
  const text = fs.readFileSync(path.join(ROOT, "docs/threat-model.md"), "utf8");
  const agentIds = fs
    .readdirSync(path.join(ROOT, "opencode/agents"))
    .filter((name) => name.endsWith(".md"))
    .map((name) => path.basename(name, ".md"))
    .sort();
  const scenarioIds = fs
    .readFileSync(
      path.join(
        ROOT,
        "opencode/docs/ai/evolution/benchmarks/adversarial-scenarios.jsonl",
      ),
      "utf8",
    )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line).id)
    .sort();
  assert.doesNotThrow(() =>
    validateThreatModel(text, { agentIds, scenarioIds }),
  );
});
