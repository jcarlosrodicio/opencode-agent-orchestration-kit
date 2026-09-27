export type SessionLike = {
  readonly id: string;
  readonly parentID?: string;
  readonly tokens?: { readonly input?: number; readonly output?: number; readonly reasoning?: number };
};
export function familyUsage(
  sessionID: string,
  sessions: readonly SessionLike[],
): { lead: number; subagents: number; sessions: number };
export function formatTokens(tokens: number): string;
