import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runSqliteJson } from "./collect-session-evidence.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(scriptDir);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0) throw new Error(result.stderr);
  return result;
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "public-collect-session-evidence-"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value), "utf8");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readJsonl(file) {
  const text = fs.readFileSync(file, "utf8").trim();
  if (!text) return [];
  return text.split("\n").map((line) => JSON.parse(line));
}

function createFixtureDb(dbPath) {
  run("sqlite3", [
    dbPath,
    `
    create table session (id text primary key, parent_id text, directory text not null, title text not null, version text not null, time_created integer not null, time_updated integer not null, path text, agent text, model text, cost real default 0 not null, tokens_input integer default 0 not null, tokens_output integer default 0 not null, tokens_reasoning integer default 0 not null, tokens_cache_read integer default 0 not null, tokens_cache_write integer default 0 not null);
    create table message (id text primary key, session_id text not null, time_created integer not null, time_updated integer not null, data text not null);
    create table part (id text primary key, message_id text not null, session_id text not null, time_created integer not null, time_updated integer not null, data text not null);
    insert into session values
      ('ses_root_1', null, '/tmp/repo', 'Investigate harness issue', '1.15.12', 1000, 2000, '', 'lead', '{"id":"gpt-5.4","providerID":"openai","variant":"medium"}', 1.5, 120, 45, 3, 10, 0),
      ('ses_child_1', 'ses_root_1', '/tmp/repo', 'Research harness issue (@researcher subagent)', '1.15.12', 1100, 2100, '', 'researcher', '{"id":"gpt-5.4","providerID":"openai","variant":"medium"}', 0.5, 50, 10, 1, 0, 0),
      ('ses_root_2', null, '/tmp/repo', 'Independent direct session', '1.15.12', 3000, 3000, '', 'developer', '{"id":"gpt-5.4","providerID":"openai","variant":"medium"}', 0.75, 90, 20, 0, 0, 0);
    insert into message values
      ('msg_user_root_1', 'ses_root_1', 1000, 1000, '{"role":"user"}'),
      ('msg_assistant_root_1', 'ses_root_1', 1200, 1300, '{"role":"assistant"}'),
      ('msg_user_child_1', 'ses_child_1', 1100, 1100, '{"role":"user"}'),
      ('msg_assistant_child_1', 'ses_child_1', 1400, 1500, '{"role":"assistant"}'),
      ('msg_user_root_2', 'ses_root_2', 3000, 3000, '{"role":"user"}'),
      ('msg_assistant_root_2', 'ses_root_2', 3200, 3300, '{"role":"assistant"}');
    insert into part values
      ('prt_user_root_1', 'msg_user_root_1', 'ses_root_1', 1000, 1000, '{"type":"text","text":"Investigate the harness issue carefully."}'),
      ('prt_assistant_root_1', 'msg_assistant_root_1', 'ses_root_1', 1200, 1300, '{"type":"text","text":"Lead summary for the harness issue."}'),
      ('prt_user_child_1', 'msg_user_child_1', 'ses_child_1', 1100, 1100, '{"type":"text","text":"Research the harness issue in depth."}'),
      ('prt_assistant_child_1', 'msg_assistant_child_1', 'ses_child_1', 1400, 1500, '{"type":"text","text":"Research findings for the harness issue."}'),
      ('prt_user_root_2', 'msg_user_root_2', 'ses_root_2', 3000, 3000, '{"type":"text","text":"Implement a direct fix."}'),
      ('prt_assistant_root_2', 'msg_assistant_root_2', 'ses_root_2', 3200, 3300, '{"type":"text","text":"Direct fix implemented."}');
    `,
  ]);
}

test("collector stages execution trees, per-session detail, and cursor artifacts", () => {
  const tmp = makeTempDir();
  const dbPath = path.join(tmp, "opencode.db");
  const rawDir = path.join(tmp, "raw");
  const outDir = path.join(tmp, "out");
  fs.mkdirSync(rawDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  createFixtureDb(dbPath);
  writeJson(path.join(rawDir, "ses_root_1.json"), [{ file: "lib/example.dart", patch: "Index: lib/example.dart" }]);
  fs.writeFileSync(path.join(rawDir, "ses_noise.json"), "[]", "utf8");

  const result = spawnSync(process.execPath, ["scripts/collect-session-evidence.mjs", "--output-dir", outDir, "--source", dbPath, "--source", rawDir], {
    cwd: root,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  const summary = readJson(path.join(outDir, "session-sources.summary.json"));
  const sessions = readJsonl(path.join(outDir, "normalized-sessions.jsonl"));
  const trees = readJsonl(path.join(outDir, "execution-trees.jsonl"));
  const cursor = readJson(path.join(outDir, "cursor.json"));

  assert.equal(summary.sources[0].format, "opencode-sqlite");
  assert.equal(summary.sources[1].skip_reasons.empty_array, 1);
  assert.equal(sessions.length, 3);
  assert.equal(trees.length, 2);
  assert.equal(trees[0].execution_tree_id, "ses_root_1");
  assert.equal(trees[0].session_count, 2);
  assert.deepEqual(trees[0].supplemental_raw_session_ids, ["ses_root_1"]);
  assert.equal(cursor.cursor_mode, "execution_tree_incremental");
});

test("runSqliteJson reports spawn and sqlite runtime failures separately", () => {
  const spawnBufferError = () => ({
    error: Object.assign(new Error("stdout maxBuffer length exceeded"), { code: "ENOBUFS" }),
    status: null,
    signal: "SIGTERM",
    stderr: "",
    stdout: "",
  });
  assert.throws(
    () => runSqliteJson("/tmp/opencode.db", "select 1;", { spawnImpl: spawnBufferError }),
    /sqlite3 spawn\/buffer error .*ENOBUFS.*maxBuffer length exceeded/,
  );
});
