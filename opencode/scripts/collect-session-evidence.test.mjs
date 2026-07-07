import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

// collect-session-evidence.mjs exposes only async streamSqliteJson; sync runSqliteJson was removed.

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(scriptDir);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}\n${result.stderr}`);
  }
  return result;
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "collect-session-evidence-"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value), "utf8");
}

function createFixtureDb(dbPath) {
  run("sqlite3", [
    dbPath,
    `
    create table session (
      id text primary key,
      project_id text not null,
      parent_id text,
      slug text not null,
      directory text not null,
      title text not null,
      version text not null,
      share_url text,
      summary_additions integer,
      summary_deletions integer,
      summary_files integer,
      summary_diffs text,
      revert text,
      permission text,
      time_created integer not null,
      time_updated integer not null,
      time_compacting integer,
      time_archived integer,
      workspace_id text,
      path text,
      agent text,
      model text,
      cost real default 0 not null,
      tokens_input integer default 0 not null,
      tokens_output integer default 0 not null,
      tokens_reasoning integer default 0 not null,
      tokens_cache_read integer default 0 not null,
      tokens_cache_write integer default 0 not null
    );
    create table message (
      id text primary key,
      session_id text not null,
      time_created integer not null,
      time_updated integer not null,
      data text not null
    );
    create table part (
      id text primary key,
      message_id text not null,
      session_id text not null,
      time_created integer not null,
      time_updated integer not null,
      data text not null
    );

    insert into session (
      id, project_id, parent_id, slug, directory, title, version, time_created, time_updated, path, agent, model, cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write
    ) values
      ('ses_root_1', 'proj_1', null, 'steady-otter', '/tmp/repo', 'Investigate harness issue', '1.15.12', 1000, 2000, '', 'lead', '{"id":"gpt-5.4","providerID":"openai","variant":"medium"}', 1.5, 120, 45, 3, 10, 0),
      ('ses_child_1', 'proj_1', 'ses_root_1', 'curious-otter', '/tmp/repo', 'Research harness issue (@researcher subagent)', '1.15.12', 1100, 2100, '', 'researcher', '{"id":"gpt-5.4","providerID":"openai","variant":"medium"}', 0.5, 50, 10, 1, 0, 0),
      ('ses_grandchild_1', 'proj_1', 'ses_child_1', 'quiet-otter', '/tmp/repo', 'Review harness issue (@reviewer subagent)', '1.15.12', 1150, 2200, '', 'reviewer', '{"id":"gpt-5.4","providerID":"openai","variant":"medium"}', 0.25, 25, 15, 2, 0, 0),
      ('ses_root_2', 'proj_1', null, 'brisk-otter', '/tmp/repo', 'Independent direct session', '1.15.12', 3000, 3000, '', 'developer', '{"id":"gpt-5.4","providerID":"openai","variant":"medium"}', 0.75, 90, 20, 0, 0, 0);

    insert into message (id, session_id, time_created, time_updated, data) values
      ('msg_user_root_1', 'ses_root_1', 1000, 1000, '{"role":"user","time":{"created":1000}}'),
      ('msg_assistant_root_1', 'ses_root_1', 1200, 1300, '{"role":"assistant","time":{"created":1200,"completed":1300},"finish":"stop"}'),
      ('msg_user_child_1', 'ses_child_1', 1100, 1100, '{"role":"user","time":{"created":1100}}'),
      ('msg_assistant_child_1', 'ses_child_1', 1400, 1500, '{"role":"assistant","time":{"created":1400,"completed":1500},"finish":"stop"}'),
      ('msg_user_grandchild_1', 'ses_grandchild_1', 1150, 1150, '{"role":"user","time":{"created":1150}}'),
      ('msg_assistant_grandchild_1', 'ses_grandchild_1', 1500, 1600, '{"role":"assistant","time":{"created":1500,"completed":1600},"finish":"stop"}'),
      ('msg_user_root_2', 'ses_root_2', 3000, 3000, '{"role":"user","time":{"created":3000}}'),
      ('msg_assistant_root_2', 'ses_root_2', 3200, 3300, '{"role":"assistant","time":{"created":3200,"completed":3300},"finish":"stop"}');

    insert into part (id, message_id, session_id, time_created, time_updated, data) values
      ('prt_user_root_1', 'msg_user_root_1', 'ses_root_1', 1000, 1000, '{"type":"text","text":"Investigate the harness issue carefully."}'),
      ('prt_assistant_root_1', 'msg_assistant_root_1', 'ses_root_1', 1200, 1300, '{"type":"text","text":"Lead summary for the harness issue."}'),
      ('prt_user_child_1', 'msg_user_child_1', 'ses_child_1', 1100, 1100, '{"type":"text","text":"Research the harness issue in depth."}'),
      ('prt_assistant_child_1', 'msg_assistant_child_1', 'ses_child_1', 1400, 1500, '{"type":"text","text":"Research findings for the harness issue."}'),
      ('prt_user_grandchild_1', 'msg_user_grandchild_1', 'ses_grandchild_1', 1150, 1150, '{"type":"text","text":"Review the harness issue findings."}'),
      ('prt_assistant_grandchild_1', 'msg_assistant_grandchild_1', 'ses_grandchild_1', 1500, 1600, '{"type":"text","text":"Reviewer findings for the harness issue."}'),
      ('prt_user_root_2', 'msg_user_root_2', 'ses_root_2', 3000, 3000, '{"type":"text","text":"Implement a direct fix."}'),
      ('prt_assistant_root_2', 'msg_assistant_root_2', 'ses_root_2', 3200, 3300, '{"type":"text","text":"Direct fix implemented."}');
    `,
  ]);
}

function createLargeFixtureDb(dbPath, repeatCount = 400000) {
  const chunk = "Evidence payload ";
  const targetLength = chunk.length * repeatCount;
  run("sqlite3", [
    dbPath,
    `
    create table session (
      id text primary key,
      project_id text not null,
      parent_id text,
      slug text not null,
      directory text not null,
      title text not null,
      version text not null,
      share_url text,
      summary_additions integer,
      summary_deletions integer,
      summary_files integer,
      summary_diffs text,
      revert text,
      permission text,
      time_created integer not null,
      time_updated integer not null,
      time_compacting integer,
      time_archived integer,
      workspace_id text,
      path text,
      agent text,
      model text,
      cost real default 0 not null,
      tokens_input integer default 0 not null,
      tokens_output integer default 0 not null,
      tokens_reasoning integer default 0 not null,
      tokens_cache_read integer default 0 not null,
      tokens_cache_write integer default 0 not null
    );
    create table message (
      id text primary key,
      session_id text not null,
      time_created integer not null,
      time_updated integer not null,
      data text not null
    );
    create table part (
      id text primary key,
      message_id text not null,
      session_id text not null,
      time_created integer not null,
      time_updated integer not null,
      data text not null
    );
    insert into session (
      id, project_id, parent_id, slug, directory, title, version, time_created, time_updated, path, agent, model, cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write
    ) values (
      'ses_large_1', 'proj_1', null, 'steady-otter', '/tmp/repo', 'Large evidence session', '1.15.12', 1000, 2000, '', 'developer',
      '{"id":"gpt-5.4","providerID":"openai","variant":"medium"}', 0, 120, 45, 3, 10, 0
    );
    insert into message (id, session_id, time_created, time_updated, data) values
      ('msg_user_large_1', 'ses_large_1', 1100, 1100, '{"role":"user","time":{"created":1100}}'),
      ('msg_assistant_large_1', 'ses_large_1', 1200, 1300, '{"role":"assistant","time":{"created":1200,"completed":1300},"finish":"stop"}');
    with large_text(value) as (
      select substr(replace(hex(zeroblob(${repeatCount})), '00', '${chunk}'), 1, ${targetLength})
    )
    insert into part (id, message_id, session_id, time_created, time_updated, data) values
      ('prt_user_large_1', 'msg_user_large_1', 'ses_large_1', 1100, 1100, json_object('type', 'text', 'text', (select value from large_text))),
      ('prt_assistant_large_1', 'msg_assistant_large_1', 'ses_large_1', 1200, 1300, json_object('type', 'text', 'text', (select value from large_text)));
    `,
  ]);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readJsonl(file) {
  const text = fs.readFileSync(file, "utf8").trim();
  if (!text) return [];
  return text.split("\n").map((line) => JSON.parse(line));
}

test("collector stages execution trees, per-session detail, and cursor artifacts", () => {
  const tmp = makeTempDir();
  const dbPath = path.join(tmp, "opencode.db");
  const rawDir = path.join(tmp, "raw");
  const outDir = path.join(tmp, "out");
  fs.mkdirSync(rawDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  createFixtureDb(dbPath);
  writeJson(path.join(rawDir, "ses_root_1.json"), [
    {
      file: "lib/example.dart",
      patch: "Index: lib/example.dart",
    },
  ]);
  fs.writeFileSync(path.join(rawDir, "ses_noise.json"), "[]", "utf8");

  const result = spawnSync(
    process.execPath,
    [
      "scripts/collect-session-evidence.mjs",
      "--output-dir",
      outDir,
      "--source",
      dbPath,
      "--source",
      rawDir,
    ],
    {
      cwd: root,
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);

  const summary = readJson(path.join(outDir, "session-sources.summary.json"));
  const sessions = readJsonl(path.join(outDir, "normalized-sessions.jsonl"));
  const trees = readJsonl(path.join(outDir, "execution-trees.jsonl"));
  const cursor = readJson(path.join(outDir, "cursor.json"));

  assert.equal(summary.sources.length, 2);
  assert.equal(summary.sources[0].format, "opencode-sqlite");
  assert.equal(summary.sources[0].accepted, 4);
  assert.equal(summary.sources[1].format, "opencode-raw-json");
  assert.equal(summary.sources[1].accepted, 1);
  assert.equal(summary.sources[1].skipped, 1);
  assert.equal(summary.sources[1].skip_reasons.empty_array, 1);

  assert.equal(sessions.length, 4);
  assert.deepEqual(
    sessions.map((row) => row.session_id).sort(),
    ["ses_child_1", "ses_grandchild_1", "ses_root_1", "ses_root_2"],
  );

  assert.equal(trees.length, 2);
  const treeOne = trees.find((row) => row.execution_tree_id === "ses_root_1");
  const treeTwo = trees.find((row) => row.execution_tree_id === "ses_root_2");
  assert.ok(treeOne);
  assert.ok(treeTwo);

  assert.equal(treeOne.session_count, 3);
  assert.deepEqual(treeOne.participating_agents, ["lead", "researcher", "reviewer"]);
  assert.equal(treeOne.tree_time_created_min, 1000);
  assert.equal(treeOne.tree_time_updated_max, 2200);
  assert.equal(treeOne.aggregate_cost, 2.25);
  assert.equal(treeOne.aggregate_tokens.input, 195);
  assert.equal(treeOne.aggregate_tokens.output, 70);
  assert.equal(treeOne.root_session.session_id, "ses_root_1");
  assert.equal(treeOne.child_sessions.length, 2);
  assert.deepEqual(
    treeOne.child_sessions.map((row) => row.session_id),
    ["ses_child_1", "ses_grandchild_1"],
  );
  assert.equal(treeOne.representative_user_prompt, "Investigate the harness issue carefully.");
  assert.equal(treeOne.representative_assistant_summary, "Reviewer findings for the harness issue.");
  assert.deepEqual(treeOne.supplemental_raw_session_ids, ["ses_root_1"]);

  assert.equal(treeTwo.session_count, 1);
  assert.deepEqual(treeTwo.participating_agents, ["developer"]);
  assert.equal(treeTwo.tree_time_updated_max, 3000);
  assert.deepEqual(treeTwo.supplemental_raw_session_ids, []);

  assert.equal(cursor.cursor_mode, "execution_tree_incremental");
  assert.equal(cursor.cursor_start, null);
  assert.equal(cursor.cursor_end_time_updated_max, 3000);
  assert.equal(cursor.cursor_end_root_session_id, "ses_root_2");
  assert.equal(cursor.trees_discovered, 2);
  assert.equal(cursor.trees_accepted, 2);
  assert.equal(cursor.trees_skipped, 0);
  assert.equal(cursor.supplemental_raw_summary.accepted, 1);
  assert.equal(cursor.supplemental_raw_summary.unmatched, 0);
});

test("collector uses prior iteration cursor to ingest only updated execution trees", () => {
  const tmp = makeTempDir();
  const dbPath = path.join(tmp, "opencode.db");
  const runsDir = path.join(tmp, "docs", "ai", "evolution", "runs");
  const iterationOne = path.join(runsDir, "iteration-001", "raw");
  const iterationTwo = path.join(runsDir, "iteration-002", "raw");
  fs.mkdirSync(iterationOne, { recursive: true });
  fs.mkdirSync(iterationTwo, { recursive: true });

  createFixtureDb(dbPath);

  const firstRun = spawnSync(
    process.execPath,
    [
      path.join(root, "scripts", "collect-session-evidence.mjs"),
      "--iteration",
      "iteration-001",
      "--source",
      dbPath,
    ],
    {
      cwd: tmp,
      encoding: "utf8",
    },
  );
  assert.equal(firstRun.status, 0, firstRun.stderr);

  run("sqlite3", [
    dbPath,
    `
    update session set time_updated = 3400 where id = 'ses_child_1';
    insert into session (
      id, project_id, parent_id, slug, directory, title, version, time_created, time_updated, path, agent, model, cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write
    ) values (
      'ses_root_3', 'proj_1', null, 'fresh-otter', '/tmp/repo', 'Brand new orchestration', '1.15.12', 4000, 4000, '', 'lead',
      '{"id":"gpt-5.4","providerID":"openai","variant":"medium"}', 1.0, 30, 5, 0, 0, 0
    );
    insert into message (id, session_id, time_created, time_updated, data) values
      ('msg_user_root_3', 'ses_root_3', 4000, 4000, '{"role":"user","time":{"created":4000}}'),
      ('msg_assistant_root_3', 'ses_root_3', 4100, 4200, '{"role":"assistant","time":{"created":4100,"completed":4200},"finish":"stop"}');
    insert into part (id, message_id, session_id, time_created, time_updated, data) values
      ('prt_user_root_3', 'msg_user_root_3', 'ses_root_3', 4000, 4000, '{"type":"text","text":"Investigate the newest run."}'),
      ('prt_assistant_root_3', 'msg_assistant_root_3', 'ses_root_3', 4100, 4200, '{"type":"text","text":"Newest run summarized."}');
    `,
  ]);

  const secondRun = spawnSync(
    process.execPath,
    [
      path.join(root, "scripts", "collect-session-evidence.mjs"),
      "--iteration",
      "iteration-002",
      "--source",
      dbPath,
    ],
    {
      cwd: tmp,
      encoding: "utf8",
    },
  );
  assert.equal(secondRun.status, 0, secondRun.stderr);

  const trees = readJsonl(path.join(iterationTwo, "execution-trees.jsonl"));
  const cursor = readJson(path.join(iterationTwo, "cursor.json"));

  assert.equal(trees.length, 2);
  assert.deepEqual(
    trees.map((row) => row.execution_tree_id).sort(),
    ["ses_root_1", "ses_root_3"],
  );

  const updatedTree = trees.find((row) => row.execution_tree_id === "ses_root_1");
  assert.equal(updatedTree.tree_time_updated_max, 3400);
  assert.deepEqual(
    updatedTree.child_sessions.map((row) => row.session_id),
    ["ses_child_1", "ses_grandchild_1"],
  );

  // M1 guard: a re-activated tree whose sessions were created before the cursor
  // has its messages/parts dropped by the SQL cutoff filter. The collector must
  // mark this explicitly so consumers don't trust incomplete content:
  //   - message_count is null (not 0) for filtered sessions
  //   - content_filtered: true on the row and the tree
  //   - representative prompts stay null
  // Without this guard, message_count: 0 reads as "no messages" instead of
  // "filtered by cutoff", silently degrading evidence.
  const sessions = readJsonl(path.join(iterationTwo, "normalized-sessions.jsonl"));
  const reactivatedSessionIds = ["ses_root_1", "ses_child_1", "ses_grandchild_1"];
  const reactivatedRows = sessions.filter((row) => reactivatedSessionIds.includes(row.session_id));
  assert.equal(reactivatedRows.length, 3);
  for (const row of reactivatedRows) {
    assert.equal(row.content_filtered, true, `${row.session_id} should be content_filtered`);
    assert.equal(row.message_count, null, `${row.session_id} message_count should be null, not 0`);
    assert.equal(row.user_prompt, null);
    assert.equal(row.assistant_summary, null);
  }
  assert.equal(updatedTree.content_filtered, true);
  assert.equal(updatedTree.representative_user_prompt, null);
  assert.equal(updatedTree.representative_assistant_summary, null);

  // ses_root_3 was created after the cursor: content is complete, not filtered.
  const freshTree = trees.find((row) => row.execution_tree_id === "ses_root_3");
  assert.ok(freshTree);
  assert.equal(freshTree.content_filtered, false);
  assert.equal(freshTree.representative_user_prompt, "Investigate the newest run.");
  const freshSession = sessions.find((row) => row.session_id === "ses_root_3");
  assert.equal(freshSession.content_filtered, false);
  assert.equal(freshSession.message_count, 2);

  assert.deepEqual(cursor.cursor_start, {
    time_updated_max: 3000,
    root_session_id: "ses_root_2",
  });
  assert.equal(cursor.cursor_end_time_updated_max, 4000);
  assert.equal(cursor.cursor_end_root_session_id, "ses_root_3");
  assert.equal(cursor.trees_discovered, 3);
  assert.equal(cursor.trees_accepted, 2);
  assert.equal(cursor.trees_skipped, 1);
  assert.equal(cursor.tree_skip_reasons.before_cursor, 1);
});

test("collector handles larger sqlite JSON payloads without buffer failure", () => {
  const tmp = makeTempDir();
  const dbPath = path.join(tmp, "opencode.db");
  const outDir = path.join(tmp, "out");
  fs.mkdirSync(outDir, { recursive: true });

  createLargeFixtureDb(dbPath);

  const result = spawnSync(process.execPath, ["scripts/collect-session-evidence.mjs", "--output-dir", outDir, "--source", dbPath], {
    cwd: root,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  const trees = readJsonl(path.join(outDir, "execution-trees.jsonl"));
  assert.equal(trees.length, 1);
  assert.equal(trees[0].execution_tree_id, "ses_large_1");
  assert.match(trees[0].representative_user_prompt, /^Evidence payload /);
});

test("streamSqliteJson rejects on sqlite3 runtime error (non-zero exit)", async () => {
  // Invoke the collector with a DB that has no session table — sqlite3 will exit 1.
  const tmp = makeTempDir();
  const dbPath = path.join(tmp, "empty.db");
  run("sqlite3", [dbPath, "create table dummy(id text);"]);
  const outDir = path.join(tmp, "out");
  fs.mkdirSync(outDir, { recursive: true });

  const result = spawnSync(
    process.execPath,
    ["scripts/collect-session-evidence.mjs", "--output-dir", outDir, "--source", dbPath],
    { cwd: root, encoding: "utf8" },
  );

  // The script should exit non-zero because the session table is missing.
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /sqlite3 runtime error|session/);
});
