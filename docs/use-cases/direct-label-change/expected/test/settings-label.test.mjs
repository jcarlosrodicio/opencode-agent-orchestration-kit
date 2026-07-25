import assert from "node:assert/strict";
import test from "node:test";

import { settingsLabel } from "../src/settings-label.mjs";

test("exports the account settings label", () => {
  assert.equal(settingsLabel, "Account settings");
});
