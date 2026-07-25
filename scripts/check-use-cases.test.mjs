import assert from "node:assert/strict";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  loadAndValidateUseCases,
  validateCaseManifest,
} from "./check-use-cases.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function copyRoot(t) {
  const root = mkdtempSync(join(tmpdir(), "oak-use-cases-"));
  mkdirSync(join(root, "docs"), { recursive: true });
  cpSync(join(ROOT, "docs", "use-cases"), join(root, "docs", "use-cases"), {
    recursive: true,
  });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function manifestPath(root, id = "direct-label-change") {
  return join(root, "docs", "use-cases", id, "case.json");
}

function mutateManifest(t, mutate, id = "direct-label-change") {
  const root = copyRoot(t);
  const path = manifestPath(root, id);
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  mutate(manifest);
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  return root;
}

function structuralCheck(root) {
  return loadAndValidateUseCases(root, { runFixtures: false });
}

test("canonical use cases pass", () => {
  assert.deepEqual(loadAndValidateUseCases(ROOT), {
    cases: 2,
    variants: 4,
    fixtureRepositories: 4,
  });
});

test("validateCaseManifest accepts a canonical manifest", () => {
  const manifest = JSON.parse(readFileSync(manifestPath(ROOT), "utf8"));
  assert.doesNotThrow(() =>
    validateCaseManifest(manifest, { caseId: "direct-label-change" }),
  );
});

test("rejects a missing case", (t) => {
  const root = copyRoot(t);
  rmSync(join(root, "docs", "use-cases", "direct-label-change"), {
    recursive: true,
  });
  assert.throws(() => structuralCheck(root), /case directories/);
});

test("rejects a symlink below a fixture", (t) => {
  const root = copyRoot(t);
  const source = join(
    root,
    "docs",
    "use-cases",
    "direct-label-change",
    "before",
    "src",
    "settings-label.mjs",
  );
  rmSync(source);
  symlinkSync("../package.json", source);
  assert.throws(() => structuralCheck(root), /symlink/);
});

test("rejects invalid JSON", (t) => {
  const root = copyRoot(t);
  writeFileSync(manifestPath(root), "{");
  assert.throws(() => structuralCheck(root), /valid JSON/);
});

test("rejects an unknown top-level key", (t) => {
  const root = mutateManifest(t, (manifest) => {
    manifest.extra = true;
  });
  assert.throws(() => structuralCheck(root), /unknown keys/);
});

test("rejects a missing or duplicate variant", (t) => {
  const missing = mutateManifest(t, (manifest) => {
    manifest.variants.pop();
  });
  assert.throws(() => structuralCheck(missing), /variant IDs/);

  const duplicate = mutateManifest(t, (manifest) => {
    manifest.variants[1].id = "harness";
  });
  assert.throws(() => structuralCheck(duplicate), /variant IDs/);
});

test("rejects a forbidden flag", (t) => {
  const root = mutateManifest(t, (manifest) => {
    manifest.variants[0].command.splice(-1, 0, "--auto");
  });
  assert.throws(() => structuralCheck(root), /command shape|forbidden flag/);
});

test("rejects a prompt mismatch", (t) => {
  const root = mutateManifest(t, (manifest) => {
    manifest.variants[0].command[manifest.variants[0].command.length - 1] =
      "Different prompt";
  });
  assert.throws(() => structuralCheck(root), /prompt/);
});

test("rejects an unknown agent", (t) => {
  const root = mutateManifest(t, (manifest) => {
    manifest.variants[0].observed_agents.push("unknown-agent");
  });
  assert.throws(() => structuralCheck(root), /unknown agent/);
});

test("rejects an invalid result", (t) => {
  const root = mutateManifest(t, (manifest) => {
    manifest.variants[0].result = "maybe";
  });
  assert.throws(() => structuralCheck(root), /result/);
});

test("rejects an incomplete validation result", (t) => {
  const root = mutateManifest(t, (manifest) => {
    manifest.variants[0].validation_results.pop();
  });
  assert.throws(() => structuralCheck(root), /validation results/);
});

test("rejects inconsistent token evidence", (t) => {
  const root = mutateManifest(t, (manifest) => {
    manifest.variants[0].tokens.value = 1;
  });
  assert.throws(() => structuralCheck(root), /token/);
});

test("rejects a private marker", (t) => {
  const root = mutateManifest(t, (manifest) => {
    manifest.objective = ["", "Users", "private", "repo"].join("/");
  });
  assert.throws(() => structuralCheck(root), /private marker/);
});

test("rejects fixture dependencies", (t) => {
  const root = copyRoot(t);
  const path = join(
    root,
    "docs",
    "use-cases",
    "direct-label-change",
    "before",
    "package.json",
  );
  const pkg = JSON.parse(readFileSync(path, "utf8"));
  pkg.dependencies = { example: "1.0.0" };
  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
  assert.throws(() => structuralCheck(root), /dependencies/);
});

test("rejects the wrong fixture test script", (t) => {
  const root = copyRoot(t);
  const path = join(
    root,
    "docs",
    "use-cases",
    "direct-label-change",
    "before",
    "package.json",
  );
  const pkg = JSON.parse(readFileSync(path, "utf8"));
  pkg.scripts.test = "node test";
  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
  assert.throws(() => structuralCheck(root), /node --test/);
});

test("rejects a failing fixture test", (t) => {
  const root = copyRoot(t);
  const path = join(
    root,
    "docs",
    "use-cases",
    "direct-label-change",
    "before",
    "src",
    "settings-label.mjs",
  );
  writeFileSync(path, 'export const settingsLabel = "Broken";\n');
  assert.throws(() => loadAndValidateUseCases(root), /fixture tests failed/);
});

test("rejects a missing README heading", (t) => {
  const root = copyRoot(t);
  const path = join(
    root,
    "docs",
    "use-cases",
    "direct-label-change",
    "README.md",
  );
  writeFileSync(
    path,
    readFileSync(path, "utf8").replace("## Cleanup", "## Removed"),
  );
  assert.throws(() => structuralCheck(root), /README heading/);
});
