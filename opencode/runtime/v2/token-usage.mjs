// Matches the OpenCode 1 sidebar (plugins/token-tree-usage.tsx), which shows
// OpenCode 1 message totals; those include cache reads and writes.
function sessionTokens(session) {
  const tokens = session?.tokens;
  if (!tokens) return 0;
  return (tokens.input ?? 0) + (tokens.output ?? 0) + (tokens.reasoning ?? 0)
    + (tokens.cache?.read ?? 0) + (tokens.cache?.write ?? 0);
}

export function familyUsage(sessionID, sessions) {
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const visited = new Set([sessionID]);
  const queue = [sessionID];
  let subagents = 0;
  let count = 0;

  while (queue.length > 0) {
    const parent = queue.shift();
    for (const session of sessions) {
      if (session.parentID !== parent || visited.has(session.id)) continue;
      visited.add(session.id);
      subagents += sessionTokens(session);
      count += 1;
      queue.push(session.id);
    }
  }

  return { lead: sessionTokens(byId.get(sessionID)), subagents, sessions: count };
}

export function formatTokens(tokens) {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return String(tokens);
}
