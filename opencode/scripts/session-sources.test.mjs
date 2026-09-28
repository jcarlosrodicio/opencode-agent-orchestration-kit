import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { sessionQueries } from "./session-sources.mjs";

function query(dbPath, sql) {
  const result = spawnSync("sqlite3", ["-json", dbPath, sql], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim() ? JSON.parse(result.stdout) : [];
}

// Tool output makes up most of a real OpenCode 1 database, and the collector
// only reads message roles and text parts, so the queries must not load the rest.
test("OpenCode 1 queries load only message roles and text parts", (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "session-sources-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const dbPath = path.join(tmp, "opencode.db");
  const sql = `
    create table message (id text, session_id text, time_created integer, time_updated integer, data text);
    create table part (id text, message_id text, session_id text, time_created integer, time_updated integer, data text);
    insert into message values ('m1', 's1', 1, 1, '{"role":"assistant","big":"${"x".repeat(1000)}"}');
    insert into part values
      ('p1', 'm1', 's1', 1, 1, '{"type":"tool","output":"${"y".repeat(1000)}"}'),
      ('p2', 'm1', 's1', 1, 1, '{"type":"text","text":"summary"}'),
      ('p3', 'm1', 's1', 1, 1, '{"type":"reasoning","text":"hidden"}');
  `;
  assert.equal(spawnSync("sqlite3", [dbPath, sql]).status, 0);

  const queries = sessionQueries("v1", { cutoffFilter: "" });
  assert.deepEqual(query(dbPath, queries.messages), [
    { id: "m1", session_id: "s1", time_created: 1, time_updated: 1, role: "assistant" },
  ]);
  assert.deepEqual(query(dbPath, queries.parts).map((row) => row.id), ["p2"]);
});

test("OpenCode 2 message queries never load message data", () => {
  assert.doesNotMatch(sessionQueries("v2", { cutoffFilter: "" }).messages, /\bdata\b/);
});
