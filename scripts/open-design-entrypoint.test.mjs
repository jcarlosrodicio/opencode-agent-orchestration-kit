import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { daemonArguments, parsePort } from "../docker/open-design/entrypoint.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ENTRYPOINT = path.join(ROOT, "docker/open-design/entrypoint.mjs");
const DOCKERFILE = path.join(ROOT, "docker/open-design/Dockerfile");

test("[OD001] parsePort accepts decimal ports in the valid range", () => {
  for (const [raw, expected] of [["1", 1], ["7456", 7456], ["65535", 65535], ["07456", 7456]]) {
    assert.equal(parsePort(raw), expected, raw);
  }
});

for (const raw of ["", "0", "65536", "7456 ", " 7456", "+7456", "7456; touch marker", "7456\n--help"]) {
  test(`[OD002] parsePort rejects unsafe value ${JSON.stringify(raw)}`, () => {
    assert.throws(() => parsePort(raw), /OD_PORT.*1 and 65535/);
  });
}

test("[OD003] daemon arguments keep the port as one argument", () => {
  assert.deepEqual(daemonArguments(parsePort("7456")), [
    "apps/daemon/dist/cli.js",
    "--port",
    "7456",
    "--no-open",
  ]);
});

test("[OD004] a shell metacharacter fails before any daemon can start", () => {
  const marker = path.join(os.tmpdir(), `open-design-entrypoint-${process.pid}-marker`);
  const result = spawnSync(process.execPath, [ENTRYPOINT], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, OD_PORT: `7456; touch ${marker}` },
  });

  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /OD_PORT/);
  assert.equal(fs.existsSync(marker), false);
});

test("[OD005] Docker uses an exec-form Node entrypoint without shell interpolation", () => {
  const dockerfile = fs.readFileSync(DOCKERFILE, "utf8");
  assert.match(dockerfile, /COPY entrypoint\.mjs \/usr\/local\/bin\/open-design-entrypoint\.mjs/);
  assert.match(dockerfile, /ENTRYPOINT \["node", "\/usr\/local\/bin\/open-design-entrypoint\.mjs"\]/);
  assert.doesNotMatch(dockerfile, /sh\s+-lc|\$\{OD_PORT/);
});
