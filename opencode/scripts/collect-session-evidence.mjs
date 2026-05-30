#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const SQLITE_JSON_MAX_BUFFER = 256 * 1024 * 1024;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function formatSqliteProcessError(dbPath, result) {
  const error = result.error;
  if (!error) return null;
  const details = [error.code, error.message].filter(Boolean).join(": ");
  if (error.code === "ENOBUFS") {
    return `sqlite3 spawn/buffer error for ${dbPath}: ${details || "output exceeded maxBuffer"}`;
  }
  return `sqlite3 spawn error for ${dbPath}: ${details || "unknown child process failure"}`;
}

export function runSqliteJson(dbPath, sql, options = {}) {
  const { spawnImpl = spawnSync, maxBuffer = SQLITE_JSON_MAX_BUFFER } = options;
  const result = spawnImpl("sqlite3", ["-json", dbPath, sql], { encoding: "utf8", maxBuffer });
  const processError = formatSqliteProcessError(dbPath, result);
  if (processError) {
    throw new Error(processError);
  }
  if (result.status !== 0) {
    const details = result.stderr.trim() || result.stdout.trim() || `sqlite3 failed for ${dbPath}`;
    throw new Error(`sqlite3 runtime error for ${dbPath}: ${details}`);
  }
  return JSON.parse(result.stdout || "[]");
}

function parseArgs(argv) {
  const args = { sources: [], fullRescan: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--iteration") args.iteration = argv[++i];
    else if (token === "--output-dir") args.outputDir = argv[++i];
    else if (token === "--source") args.sources.push(argv[++i]);
    else if (token === "--full-rescan") args.fullRescan = true;
    else fail(`Unknown argument: ${token}`);
  }
  return args;
}

function defaultSources() {
  const sources = [path.join(os.homedir(), ".local", "share", "opencode", "opencode.db")];
  const envRaw = process.env.RAW_SESSIONS_DIR;
  const fallbackRaw = "/raw-sessions";
  if (envRaw && fs.existsSync(envRaw)) sources.push(envRaw);
  else if (fs.existsSync(fallbackRaw)) sources.push(fallbackRaw);
  return sources;
}

function resolveOutputDir(args) {
  if (args.outputDir) return path.resolve(args.outputDir);
  if (args.iteration) return path.resolve("docs/ai/evolution/runs", args.iteration, "raw");
  fail("Pass --output-dir or --iteration.");
}

function detectSource(sourcePath) {
  const stat = fs.statSync(sourcePath);
  if (stat.isFile() && path.basename(sourcePath) === "opencode.db") return "opencode-sqlite";
  if (stat.isDirectory()) return "opencode-raw-json";
  throw new Error(`Unsupported source: ${sourcePath}`);
}

function parseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error };
  }
}

function firstTextPart(parts) {
  for (const part of parts) {
    const data = parseJson(part.data);
    if (data.ok && data.value?.type === "text" && typeof data.value.text === "string" && data.value.text.trim()) {
      return data.value.text.trim();
    }
  }
  return null;
}

function loadPreviousCursor(iteration, outputDir) {
  if (!iteration) return null;
  const runsDir = path.dirname(path.dirname(outputDir));
  if (!fs.existsSync(runsDir)) return null;
  const priorIterations = fs
    .readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("iteration-") && entry.name < iteration)
    .map((entry) => entry.name)
    .sort()
    .reverse();

  for (const candidate of priorIterations) {
    const cursorPath = path.join(runsDir, candidate, "raw", "cursor.json");
    if (!fs.existsSync(cursorPath)) continue;
    const parsed = parseJson(fs.readFileSync(cursorPath, "utf8"));
    if (!parsed.ok) continue;
    if (
      parsed.value?.cursor_mode === "execution_tree_incremental" &&
      typeof parsed.value?.cursor_end_time_updated_max === "number" &&
      typeof parsed.value?.cursor_end_root_session_id === "string"
    ) {
      return parsed.value;
    }
  }

  return null;
}

function summarizeSqlite(dbPath) {
  const sessions = runSqliteJson(
    dbPath,
    "select id, parent_id, directory, title, version, time_created, time_updated, path, agent, model, cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write from session order by time_updated desc, id desc;",
  );
  const messages = runSqliteJson(
    dbPath,
    "select id, session_id, time_created, time_updated, data from message order by session_id, time_created, id;",
  );
  const parts = runSqliteJson(
    dbPath,
    "select id, message_id, session_id, time_created, time_updated, data from part order by session_id, time_created, id;",
  );

  const messagesBySession = new Map();
  for (const message of messages) {
    const list = messagesBySession.get(message.session_id) || [];
    list.push(message);
    messagesBySession.set(message.session_id, list);
  }

  const partsByMessage = new Map();
  for (const part of parts) {
    const list = partsByMessage.get(part.message_id) || [];
    list.push(part);
    partsByMessage.set(part.message_id, list);
  }

  const normalized = [];
  for (const session of sessions) {
    if (!session.id) continue;
    const sessionMessages = messagesBySession.get(session.id) || [];
    const firstUser = sessionMessages.find((message) => {
      const parsed = parseJson(message.data);
      return parsed.ok && parsed.value?.role === "user";
    });
    const assistantMessages = sessionMessages.filter((message) => {
      const parsed = parseJson(message.data);
      return parsed.ok && parsed.value?.role === "assistant";
    });
    const lastAssistant = assistantMessages.at(-1);
    const parsedModel = typeof session.model === "string" && session.model ? parseJson(session.model) : null;

    normalized.push({
      source_label: "local-opencode-db",
      source_format: "opencode-sqlite",
      session_id: session.id,
      parent_session_id: session.parent_id || null,
      title: session.title || null,
      agent: session.agent || null,
      model: parsedModel?.ok ? parsedModel.value : null,
      directory: session.directory || null,
      path: session.path || "",
      version: session.version || null,
      time_created: session.time_created ?? null,
      time_updated: session.time_updated ?? null,
      tokens: {
        input: session.tokens_input ?? 0,
        output: session.tokens_output ?? 0,
        reasoning: session.tokens_reasoning ?? 0,
        cache: {
          read: session.tokens_cache_read ?? 0,
          write: session.tokens_cache_write ?? 0,
        },
      },
      cost: session.cost ?? 0,
      user_prompt: firstUser ? firstTextPart(partsByMessage.get(firstUser.id) || []) : null,
      assistant_summary: lastAssistant ? firstTextPart(partsByMessage.get(lastAssistant.id) || []) : null,
      message_count: sessionMessages.length,
    });
  }

  return {
    source: {
      label: "local-opencode-db",
      path: dbPath,
      format: "opencode-sqlite",
      discovered: sessions.length,
      accepted: normalized.length,
      skipped: 0,
      skip_reasons: {},
    },
    normalized,
  };
}

function summarizeRawDir(dirPath) {
  const files = fs.readdirSync(dirPath).filter((file) => file.startsWith("ses_") && file.endsWith(".json")).sort();
  const normalized = [];
  const skipReasons = {};
  let skipped = 0;

  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const parsed = parseJson(fs.readFileSync(fullPath, "utf8"));
    if (!parsed.ok) {
      skipped += 1;
      skipReasons.invalid_json = (skipReasons.invalid_json || 0) + 1;
      continue;
    }
    if (Array.isArray(parsed.value) && parsed.value.length === 0) {
      skipped += 1;
      skipReasons.empty_array = (skipReasons.empty_array || 0) + 1;
      continue;
    }
    const info = !Array.isArray(parsed.value) ? parsed.value?.info : null;
    const sessionId = info?.id || path.basename(file, ".json");
    if (!sessionId) {
      skipped += 1;
      skipReasons.missing_session_id = (skipReasons.missing_session_id || 0) + 1;
      continue;
    }
    normalized.push({
      source_label: "external-opencode-raw",
      source_format: "opencode-raw-json",
      session_id: sessionId,
      parent_session_id: null,
      title: info?.title || null,
      agent: info?.agent || null,
      model: info?.model || null,
      directory: info?.directory || null,
      path: info?.path || "",
      version: info?.version || null,
      time_created: null,
      time_updated: null,
      tokens: info?.tokens || null,
      cost: info?.cost ?? 0,
      user_prompt: null,
      assistant_summary: null,
      message_count: null,
      raw_path: fullPath,
      raw_shape: Array.isArray(parsed.value) ? "array" : "object",
    });
  }

  return {
    source: {
      label: "external-opencode-raw",
      path: dirPath,
      format: "opencode-raw-json",
      discovered: files.length,
      accepted: normalized.length,
      skipped,
      skip_reasons: skipReasons,
    },
    normalized,
  };
}

function sortSessions(rows) {
  return [...rows].sort((a, b) => {
    const timeDelta = (a.time_created ?? Number.MAX_SAFE_INTEGER) - (b.time_created ?? Number.MAX_SAFE_INTEGER);
    if (timeDelta !== 0) return timeDelta;
    return a.session_id.localeCompare(b.session_id);
  });
}

function resolveRootId(row, sessionMap) {
  if (row.source_format !== "opencode-sqlite") return row.session_id;
  if (!row.parent_session_id) return row.session_id;

  const seen = new Set([row.session_id]);
  let current = row;
  while (current.parent_session_id) {
    const parent = sessionMap.get(current.parent_session_id);
    if (!parent || parent.source_format !== "opencode-sqlite") return row.session_id;
    if (seen.has(parent.session_id)) return row.session_id;
    seen.add(parent.session_id);
    current = parent;
  }
  return current.session_id;
}

function treeRepresentativeSummary(sessions) {
  const withSummary = sessions.filter((row) => row.assistant_summary);
  if (withSummary.length === 0) return null;
  return [...withSummary]
    .sort((a, b) => (a.time_updated ?? 0) - (b.time_updated ?? 0) || a.session_id.localeCompare(b.session_id))
    .at(-1).assistant_summary;
}

function buildExecutionTrees(sqliteRows, rawRows, previousCursor, fullRescan) {
  const sqliteMap = new Map(sqliteRows.map((row) => [row.session_id, row]));
  const rawBySessionId = new Map(rawRows.map((row) => [row.session_id, row]));
  const grouped = new Map();

  for (const row of sqliteRows) {
    const rootId = resolveRootId(row, sqliteMap);
    const list = grouped.get(rootId) || [];
    list.push(row);
    grouped.set(rootId, list);
  }

  const trees = [];
  const skipReasons = {};
  let skipped = 0;
  let unmatchedRaw = 0;

  for (const [rootId, rows] of grouped.entries()) {
    const sortedRows = sortSessions(rows);
    const rootSession = sqliteMap.get(rootId) || sortedRows[0];
    const childSessions = sortedRows.filter((row) => row.session_id !== rootSession.session_id);
    const participatingAgents = [...new Set(sortedRows.map((row) => row.agent).filter(Boolean))].sort();
    const timeCreatedValues = sortedRows.map((row) => row.time_created).filter((value) => typeof value === "number");
    const timeUpdatedValues = sortedRows.map((row) => row.time_updated).filter((value) => typeof value === "number");
    const matchedRawIds = sortedRows.filter((row) => rawBySessionId.has(row.session_id)).map((row) => row.session_id);

    const aggregateTokens = sortedRows.reduce(
      (acc, row) => {
        acc.input += row.tokens?.input ?? 0;
        acc.output += row.tokens?.output ?? 0;
        acc.reasoning += row.tokens?.reasoning ?? 0;
        acc.cache.read += row.tokens?.cache?.read ?? 0;
        acc.cache.write += row.tokens?.cache?.write ?? 0;
        return acc;
      },
      { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    );

    const tree = {
      execution_tree_id: rootSession.session_id,
      root_session_id: rootSession.session_id,
      root_session: rootSession,
      child_sessions: childSessions,
      root_agent: rootSession.agent || null,
      root_title: rootSession.title || null,
      root_directory: rootSession.directory || null,
      tree_time_created_min: timeCreatedValues.length ? Math.min(...timeCreatedValues) : null,
      tree_time_updated_max: timeUpdatedValues.length ? Math.max(...timeUpdatedValues) : null,
      participating_agents: participatingAgents,
      session_count: sortedRows.length,
      aggregate_tokens: aggregateTokens,
      aggregate_cost: sortedRows.reduce((sum, row) => sum + (row.cost ?? 0), 0),
      representative_user_prompt:
        rootSession.user_prompt || sortedRows.find((row) => typeof row.user_prompt === "string")?.user_prompt || null,
      representative_assistant_summary: treeRepresentativeSummary(sortedRows),
      session_ids: sortedRows.map((row) => row.session_id),
      supplemental_raw_session_ids: matchedRawIds,
      source_formats: [...new Set(["opencode-sqlite", ...matchedRawIds.map(() => "opencode-raw-json")])],
    };

    if (
      !fullRescan &&
      previousCursor &&
      typeof tree.tree_time_updated_max === "number" &&
      (tree.tree_time_updated_max < previousCursor.cursor_end_time_updated_max ||
        (tree.tree_time_updated_max === previousCursor.cursor_end_time_updated_max &&
          tree.root_session_id.localeCompare(previousCursor.cursor_end_root_session_id) <= 0))
    ) {
      skipped += 1;
      skipReasons.before_cursor = (skipReasons.before_cursor || 0) + 1;
      continue;
    }

    trees.push(tree);
  }

  for (const rawRow of rawRows) {
    if (!sqliteMap.has(rawRow.session_id)) unmatchedRaw += 1;
  }

  trees.sort((a, b) => {
    const timeDelta = (a.tree_time_updated_max ?? 0) - (b.tree_time_updated_max ?? 0);
    if (timeDelta !== 0) return timeDelta;
    return a.root_session_id.localeCompare(b.root_session_id);
  });

  return {
    trees,
    treeSummary: {
      trees_discovered: grouped.size,
      trees_accepted: trees.length,
      trees_skipped: skipped,
      tree_skip_reasons: skipReasons,
    },
    supplementalRawSummary: {
      discovered: rawRows.length,
      accepted: rawRows.length,
      matched: rawRows.length - unmatchedRaw,
      unmatched: unmatchedRaw,
    },
  };
}

function makeCursor(previousCursor, treeSummary, trees, supplementalRawSummary, fullRescan) {
  const lastTree = trees.at(-1) || null;
  return {
    cursor_mode: "execution_tree_incremental",
    cursor_start:
      !fullRescan && previousCursor
        ? {
            time_updated_max: previousCursor.cursor_end_time_updated_max,
            root_session_id: previousCursor.cursor_end_root_session_id,
          }
        : null,
    cursor_end:
      lastTree && typeof lastTree.tree_time_updated_max === "number"
        ? {
            time_updated_max: lastTree.tree_time_updated_max,
            root_session_id: lastTree.root_session_id,
          }
        : !fullRescan && previousCursor
          ? {
              time_updated_max: previousCursor.cursor_end_time_updated_max,
              root_session_id: previousCursor.cursor_end_root_session_id,
            }
          : null,
    cursor_end_time_updated_max:
      lastTree && typeof lastTree.tree_time_updated_max === "number"
        ? lastTree.tree_time_updated_max
        : previousCursor?.cursor_end_time_updated_max ?? null,
    cursor_end_root_session_id: lastTree?.root_session_id || previousCursor?.cursor_end_root_session_id || null,
    trees_discovered: treeSummary.trees_discovered,
    trees_accepted: treeSummary.trees_accepted,
    trees_skipped: treeSummary.trees_skipped,
    tree_skip_reasons: treeSummary.tree_skip_reasons,
    supplemental_raw_summary: supplementalRawSummary,
  };
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const outputDir = resolveOutputDir(args);
  fs.mkdirSync(outputDir, { recursive: true });
  const sourcePaths = args.sources.length > 0 ? args.sources.map((item) => path.resolve(item)) : defaultSources();
  const summaries = [];
  let sqliteRows = [];
  let rawRows = [];

  for (const sourcePath of sourcePaths) {
    if (!fs.existsSync(sourcePath)) continue;
    const kind = detectSource(sourcePath);
    const result = kind === "opencode-sqlite" ? summarizeSqlite(sourcePath) : summarizeRawDir(sourcePath);
    summaries.push(result.source);
    if (kind === "opencode-sqlite") sqliteRows = sqliteRows.concat(result.normalized);
    else rawRows = rawRows.concat(result.normalized);
  }

  const previousCursor = args.fullRescan ? null : loadPreviousCursor(args.iteration, outputDir);
  const built = buildExecutionTrees(sqliteRows, rawRows, previousCursor, args.fullRescan);
  const acceptedSessionIds = new Set(built.trees.flatMap((tree) => tree.session_ids));
  const filteredSessionRows = sortSessions(sqliteRows.filter((row) => acceptedSessionIds.has(row.session_id)));
  const cursor = makeCursor(previousCursor, built.treeSummary, built.trees, built.supplementalRawSummary, args.fullRescan);

  fs.writeFileSync(path.join(outputDir, "session-sources.summary.json"), JSON.stringify({ sources: summaries }, null, 2), "utf8");
  fs.writeFileSync(path.join(outputDir, "normalized-sessions.jsonl"), `${filteredSessionRows.map((row) => JSON.stringify(row)).join("\n")}${filteredSessionRows.length ? "\n" : ""}`, "utf8");
  fs.writeFileSync(path.join(outputDir, "execution-trees.jsonl"), `${built.trees.map((tree) => JSON.stringify(tree)).join("\n")}${built.trees.length ? "\n" : ""}`, "utf8");
  fs.writeFileSync(path.join(outputDir, "cursor.json"), JSON.stringify(cursor, null, 2), "utf8");
  console.log(`Collected ${built.trees.length} execution trees from ${summaries.length} sources.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
