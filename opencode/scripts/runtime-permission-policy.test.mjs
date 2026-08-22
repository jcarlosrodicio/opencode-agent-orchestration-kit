import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_IDS,
  POLICY_OPERATIONS,
  decideToolAccess,
} from "./runtime-permission-policy.mjs";

test("policy covers every configured agent and operation", () => {
  assert.deepEqual(AGENT_IDS, [
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
  ]);
  assert.deepEqual(POLICY_OPERATIONS, [
    "read",
    "write",
    "shell",
    "network",
    "commit",
    "push",
    "deploy",
    "delegate",
  ]);
});

test("role policy denies lead and reviewer implementation writes", () => {
  assert.equal(decideToolAccess({ agentId: "lead", operation: "write" }), "deny");
  assert.equal(decideToolAccess({ agentId: "reviewer", operation: "write" }), "deny");
  assert.equal(decideToolAccess({ agentId: "developer", operation: "write" }), "allow");
  assert.equal(decideToolAccess({ agentId: "designer", operation: "write" }), "ask");
});

test("delegation is restricted to the declared task allowlist", () => {
  assert.equal(
    decideToolAccess({ agentId: "lead", operation: "delegate", target: "developer" }),
    "allow",
  );
  assert.equal(
    decideToolAccess({ agentId: "lead", operation: "delegate", target: "unknown" }),
    "deny",
  );
  assert.equal(
    decideToolAccess({ agentId: "scoper", operation: "delegate", target: "researcher" }),
    "allow",
  );
  assert.equal(
    decideToolAccess({ agentId: "reviewer", operation: "delegate", target: "developer" }),
    "deny",
  );
  assert.equal(
    decideToolAccess({ agentId: "review_coordinator", operation: "delegate", target: "review_security" }),
    "allow",
  );
});

test("publication and deployment operations are denied for every role", () => {
  for (const agentId of AGENT_IDS) {
    assert.equal(decideToolAccess({ agentId, operation: "push" }), "deny", agentId);
    assert.equal(decideToolAccess({ agentId, operation: "deploy" }), "deny", agentId);
  }
});

test("unknown identities and operations never receive implicit allow", () => {
  assert.equal(decideToolAccess({ agentId: "not-an-agent", operation: "write" }), "deny");
  assert.equal(decideToolAccess({ agentId: "developer", operation: "not-an-operation" }), "deny");
  assert.equal(decideToolAccess({ agentId: "developer", operation: "delegate", target: "reviewer" }), "deny");
});

test("specialist reviewers cannot write, delegate, or use network tools", () => {
  for (const agentId of ["review_api", "review_quality", "review_security", "review_tests"]) {
    assert.equal(decideToolAccess({ agentId, operation: "write" }), "deny", agentId);
    assert.equal(decideToolAccess({ agentId, operation: "delegate", target: "developer" }), "deny", agentId);
    assert.equal(decideToolAccess({ agentId, operation: "network" }), "deny", agentId);
  }
});
