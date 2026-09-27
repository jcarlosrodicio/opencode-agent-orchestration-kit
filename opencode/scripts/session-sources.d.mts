export const SESSION_TABLES_SQL: string;
export function pickSessionSchema(rows: ReadonlyArray<{ name: string }>): "v1" | "v2";
export function sessionQueries(
  schema: "v1" | "v2",
  options: { fullRescan: boolean; cutoffFilter: string },
): { sessions: string; messages: string; parts: string };
