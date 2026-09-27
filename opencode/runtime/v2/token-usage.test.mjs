import assert from "node:assert/strict";
import test from "node:test";
import { familyUsage, formatTokens } from "./token-usage.mjs";

const tokens = (input, output, reasoning = 0) => ({ input, output, reasoning, cache: { read: 999, write: 999 } });

test("sums the viewed session and all of its descendants, excluding cache tokens", () => {
  const sessions = [
    { id: "root", tokens: tokens(100, 50) },
    { id: "child", parentID: "root", tokens: tokens(10, 5, 1) },
    { id: "grandchild", parentID: "child", tokens: tokens(1, 1) },
    { id: "sibling-root", tokens: tokens(7, 7) },
  ];
  assert.deepEqual(familyUsage("root", sessions), { lead: 150, subagents: 18, sessions: 2 });
  assert.deepEqual(familyUsage("child", sessions), { lead: 16, subagents: 2, sessions: 1 });
});

test("tolerates missing tokens and cycles", () => {
  const sessions = [
    { id: "a", parentID: "b" },
    { id: "b", parentID: "a", tokens: tokens(1, 1) },
  ];
  assert.deepEqual(familyUsage("a", sessions), { lead: 0, subagents: 2, sessions: 1 });
});

test("formats token counts like the OpenCode 1 sidebar", () => {
  assert.equal(formatTokens(999), "999");
  assert.equal(formatTokens(12_400), "12k");
  assert.equal(formatTokens(3_250_000), "3.3M");
});
