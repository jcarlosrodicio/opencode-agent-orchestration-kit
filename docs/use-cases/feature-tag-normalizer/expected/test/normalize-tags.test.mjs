import assert from "node:assert/strict";
import test from "node:test";

import { normalizeTags } from "../src/normalize-tags.mjs";

test("normalizes values and preserves first occurrence order", () => {
  const input = [" Alpha ", "beta", "", "ALPHA", " Beta ", "gamma"];

  assert.deepEqual(normalizeTags(input), ["alpha", "beta", "gamma"]);
});

test("does not mutate the input", () => {
  const input = [" Alpha ", "beta"];

  normalizeTags(input);

  assert.deepEqual(input, [" Alpha ", "beta"]);
});
