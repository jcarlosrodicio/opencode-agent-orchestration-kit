export const SESSION_TABLES_SQL: string;
export function pickSessionSchemas(rows: ReadonlyArray<{ name: string }>): Array<"v1" | "v2">;
export function sessionQueries(
  schema: "v1" | "v2",
  options: { fullRescan: boolean; cutoffFilter: string },
): { sessions: string; messages: string; parts: string };
