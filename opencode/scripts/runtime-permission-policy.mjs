const DECISIONS = Object.freeze(["allow", "ask", "deny"]);

export const AGENT_IDS = Object.freeze([
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

export const POLICY_OPERATIONS = Object.freeze([
  "read",
  "write",
  "shell",
  "network",
  "commit",
  "push",
  "deploy",
  "delegate",
]);

const common = {
  read: "allow",
  shell: "ask",
  commit: "deny",
  push: "deny",
  deploy: "deny",
};

export const AGENT_POLICIES = Object.freeze({
  debugger: Object.freeze({ ...common, repository_write: "unspecified", task_default: "unspecified", write: "ask", network: "allow", delegate_to: [] }),
  designer: Object.freeze({ ...common, repository_write: "ask", task_default: "unspecified", write: "ask", network: "allow", delegate_to: [] }),
  developer: Object.freeze({ ...common, repository_write: "allow", task_default: "unspecified", write: "allow", network: "ask", commit: "ask", delegate_to: [] }),
  evaluator: Object.freeze({ ...common, repository_write: "unspecified", task_default: "unspecified", write: "ask", network: "ask", delegate_to: [] }),
  evolver: Object.freeze({ ...common, repository_write: "unspecified", task_default: "unspecified", write: "ask", network: "ask", delegate_to: [] }),
  lead: Object.freeze({ ...common, repository_write: "deny", task_default: "deny", write: "deny", network: "allow", delegate_to: ["debugger", "designer", "developer", "evaluator", "evolver", "researcher", "reviewer", "specifier"] }),
  researcher: Object.freeze({ ...common, repository_write: "ask", task_default: "unspecified", write: "ask", network: "allow", delegate_to: [] }),
  review_api: Object.freeze({ ...common, repository_write: "deny", task_default: "unspecified", write: "deny", network: "deny", delegate_to: [] }),
  review_coordinator: Object.freeze({ ...common, repository_write: "deny", task_default: "deny", write: "deny", network: "deny", delegate_to: ["review_api", "review_quality", "review_security", "review_tests"] }),
  review_quality: Object.freeze({ ...common, repository_write: "deny", task_default: "unspecified", write: "deny", network: "deny", delegate_to: [] }),
  review_security: Object.freeze({ ...common, repository_write: "deny", task_default: "unspecified", write: "deny", network: "deny", delegate_to: [] }),
  review_tests: Object.freeze({ ...common, repository_write: "deny", task_default: "unspecified", write: "deny", network: "deny", delegate_to: [] }),
  reviewer: Object.freeze({ ...common, repository_write: "deny", task_default: "unspecified", write: "deny", network: "ask", delegate_to: [] }),
  scoper: Object.freeze({ ...common, repository_write: "unspecified", task_default: "deny", write: "ask", network: "allow", delegate_to: ["debugger", "researcher", "specifier"] }),
  specifier: Object.freeze({ ...common, repository_write: "ask", task_default: "unspecified", write: "ask", network: "allow", delegate_to: [] }),
});

function isDecision(value) {
  return DECISIONS.includes(value);
}

export function decideToolAccess({ agentId, operation, target } = {}) {
  const policy = AGENT_POLICIES[agentId];
  if (!policy || !POLICY_OPERATIONS.includes(operation)) return "deny";

  if (operation === "delegate") {
    return policy.delegate_to.includes(target) ? "allow" : "deny";
  }

  const decision = policy[operation];
  return isDecision(decision) ? decision : "deny";
}
