import assert from "node:assert/strict";
import test from "node:test";

import { normalizeTags } from "../src/normalize-tags.mjs";

test("returns a new array without mutating the input", () => {
  const input = ["Alpha", " Beta "];
  const result = normalizeTags(input);

  assert.deepEqual(result, input);
  assert.notEqual(result, input);
  assert.deepEqual(input, ["Alpha", " Beta "]);
});
