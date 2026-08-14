import assert from "node:assert/strict";
import test from "node:test";
import { classifyShellExport } from "./shell-export-policy.mjs";

const sensitiveApiKeyName = ["OPENAI", "API_KEY"].join("_");

const cases = [
  {
    name: "blocks bare export",
    command: "export",
    expected: { blocked: true, rule: "shell-export-environment-enumeration" },
  },
  {
    name: "blocks export -p",
    command: "export -p",
    expected: { blocked: true, rule: "shell-export-environment-enumeration" },
  },
  {
    name: "blocks a sensitive export name",
    command: `export ${sensitiveApiKeyName}=literal`,
    expected: { blocked: true, rule: "shell-export-sensitive-name" },
  },
  {
    name: "blocks a secret source after a separator",
    command: "printf x; export TOKEN=\"$(cat ~/.token)\"",
    expected: { blocked: true, rule: "shell-export-sensitive-name" },
  },
  {
    name: "blocks printenv of a sensitive variable",
    command: `export VALUE="$(printenv ${sensitiveApiKeyName})"`,
    expected: { blocked: true, rule: "shell-export-secret-source" },
  },
  {
    name: "allows PATH setup",
    command: 'export PATH="$PATH:/tool/bin"',
    expected: { blocked: false, rule: null },
  },
  {
    name: "allows NODE_ENV setup",
    command: "export NODE_ENV=test",
    expected: { blocked: false, rule: null },
  },
  {
    name: "allows a non-secret derived value",
    command: 'export BUILD_ID="$(git rev-parse HEAD)"',
    expected: { blocked: false, rule: null },
  },
  {
    name: "ignores quoted prose",
    command: 'echo "export TOKEN=..."',
    expected: { blocked: false, rule: null },
  },
  {
    name: "ignores source-language export",
    command: 'node -e "export const value = 1"',
    expected: { blocked: false, rule: null },
  },
  {
    name: "ignores the Pi session export flag",
    command: "pi --export session.html",
    expected: { blocked: false, rule: null },
  },
  {
    name: "recognizes export after then",
    command: "if true; then export API_TOKEN=literal; fi",
    expected: { blocked: true, rule: "shell-export-sensitive-name" },
  },
  {
    name: "ignores export text in a comment",
    command: "echo ready # export API_TOKEN=literal",
    expected: { blocked: false, rule: null },
  },
  {
    name: "ignores export text after a real assignment comment",
    command: "export BUILD_CHANNEL=staging # export API_TOKEN=literal",
    expected: { blocked: false, rule: null },
  },
  {
    name: "does not block a non-sensitive exported variable",
    command: "export BUILD_CHANNEL=staging",
    expected: { blocked: false, rule: null },
  },
];

for (const { name, command, expected } of cases) {
  test(name, () => {
    const decision = classifyShellExport(command);
    assert.deepEqual(decision, expected);
    assert.equal(Object.hasOwn(decision, "command"), false);
  });
}

test("returns a safe decision for non-string input", () => {
  assert.deepEqual(classifyShellExport(null), { blocked: false, rule: null });
  assert.deepEqual(classifyShellExport({}), { blocked: false, rule: null });
});
