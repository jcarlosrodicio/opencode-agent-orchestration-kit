import assert from "node:assert/strict";
import test from "node:test";
import { BLOCK_MESSAGE, assertShellCallAllowed } from "./shell-export-guard-core.mjs";

test("blocks environment enumeration from the OpenCode 1 bash tool", () => {
  assert.throws(
    () => assertShellCallAllowed("bash", { command: "export -p" }),
    /^Error: \[shell-export-guard:shell-export-environment-enumeration\] /,
  );
});

test("blocks environment enumeration from the OpenCode 2 shell tool", () => {
  assert.throws(
    () => assertShellCallAllowed("shell", { command: "export" }),
    /\[shell-export-guard:shell-export-environment-enumeration\]/,
  );
});

test("matches tool names case-insensitively", () => {
  assert.throws(() => assertShellCallAllowed("Bash", { command: "export -p" }), /shell-export-guard/);
});

test("allows safe exports", () => {
  assert.doesNotThrow(() => assertShellCallAllowed("shell", { command: "export NODE_ENV=test" }));
});

test("ignores other tools and malformed input", () => {
  for (const [tool, args] of [
    ["read", { command: "export" }],
    ["shell", null],
    ["shell", { command: 42 }],
    [undefined, undefined],
  ]) {
    assert.doesNotThrow(() => assertShellCallAllowed(tool, args));
  }
});

test("never echoes the command in the error", () => {
  assert.throws(
    () => assertShellCallAllowed("bash", { command: "export -p" }),
    (error) => error.message.endsWith(BLOCK_MESSAGE) && !error.message.includes("export -p"),
  );
});
