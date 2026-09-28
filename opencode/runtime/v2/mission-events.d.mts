export type SessionRecord = {
  session_id: string;
  parent_session_id: string;
  agent: string;
  runtime: "opencode";
};

export function toObserverEvent(event: unknown): { type: string; properties: Record<string, unknown> } | null;
export function toSessionRecord(event: unknown): SessionRecord | null;
export function createSessionRecorder(
  append: (record: SessionRecord) => unknown,
  directory: string,
): (event: unknown) => void;
