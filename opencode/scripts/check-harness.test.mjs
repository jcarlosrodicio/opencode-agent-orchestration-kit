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
