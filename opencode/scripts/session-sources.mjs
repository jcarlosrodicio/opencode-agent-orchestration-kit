// OpenCode 1 stores sessions in `session`, `message` and `part`. OpenCode 2 stores
// them in `session_v2` and one `session_message` row per message. The OpenCode 2
// queries reshape rows into the OpenCode 1 row shape that summarizeSqlite consumes.
export const SESSION_TABLES_SQL =
  "select name from sqlite_master where type = 'table' and name in ('session', 'session_v2');";

const SESSION_COLUMNS = [
  "id", "project_id", "parent_id", "slug", "directory", "title", "version", "time_created",
  "time_updated", "workspace_id", "path", "agent", "model", "cost", "tokens_input",
  "tokens_output", "tokens_reasoning", "tokens_cache_read", "tokens_cache_write",
].join(", ");

// Schemas in precedence order. OpenCode 2 imports OpenCode 1 sessions on first
// start, so its rows win for a session present in both; sessions that OpenCode 1
// created after switching back exist only in the OpenCode 1 tables.
export function pickSessionSchemas(rows) {
  const names = new Set(rows.map((row) => row.name));
  const schemas = [];
  if (names.has("session_v2")) schemas.push("v2");
  if (names.has("session")) schemas.push("v1"); // oak:v1-only
  if (schemas.length === 0) throw new Error("OpenCode database has neither a session nor a session_v2 table");
  return schemas;
}

export function sessionQueries(schema, { fullRescan, cutoffFilter }) {
  // oak:v1-only — start
  if (schema === "v1") {
    return {
      sessions: `select ${SESSION_COLUMNS} from session order by time_updated desc, id desc;`,
      messages: fullRescan
        ? "select id, session_id, time_created, time_updated, data from message order by session_id, time_created, id;"
        : `select id, session_id, time_created, time_updated, json_extract(data, '$.role') as role from message where 1=1 ${cutoffFilter} order by session_id, time_created, id;`,
      parts: `select id, message_id, session_id, time_created, time_updated, data from part where 1=1 ${cutoffFilter} order by session_id, time_created, id;`,
    };
  }
  // oak:v1-only — end
  return {
    sessions: `select ${SESSION_COLUMNS} from session_v2 order by time_updated desc, id desc;`,
    messages: `select id, session_id, time_created, time_updated, type as role${fullRescan ? ", data" : ""} from session_message where type in ('user', 'assistant') ${cutoffFilter} order by session_id, time_created, id;`,
    parts: `
      select id, id as message_id, session_id, time_created, time_updated,
        json_object('type', 'text', 'text', json_extract(data, '$.text')) as data
      from session_message where type = 'user' ${cutoffFilter}
      union all
      select m.id || ':' || printf('%06d', c.key), m.id, m.session_id, m.time_created, m.time_updated, c.value
      from session_message m, json_each(m.data, '$.content') c
      where m.type = 'assistant' and json_extract(c.value, '$.type') = 'text' ${cutoffFilter.replace("time_created", "m.time_created")}
      order by 3, 4, 1;`,
  };
}
