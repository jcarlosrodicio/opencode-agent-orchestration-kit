import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { scanPublicLeaks, validatePublicBoundary } from "./check-public-boundary.mjs";

test("the checked-out public boundary is complete and leak-free", () => {
  assert.doesNotThrow(() => validatePublicBoundary());
});

test("the boundary scan reports a private marker without echoing its value", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "public-boundary-"));
  try {
    const leaked = ["/", "Users", "example", "secret"].join("/");
    fs.writeFileSync(path.join(root, "leak.txt"), leaked);
    const findings = scanPublicLeaks(root);
    assert.deepEqual(findings, [{ path: "leak.txt", marker: "private-marker" }]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("missing boundary documentation fails closed", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "public-boundary-missing-"));
  try {
    assert.throws(() => validatePublicBoundary(root), /docs\/sync-boundary\.md/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
