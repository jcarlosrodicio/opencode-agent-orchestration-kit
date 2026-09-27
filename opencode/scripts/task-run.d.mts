export type RunKind = "production" | "benchmark";

export type TaskRun = {
  schema: "oak.run/1";
  run_id: string;
  kind: RunKind;
  change: string;
  branch: string;
  repo: string;
  started_at: string;
};

export type RunEvent = {
  schema: "oak.event/1";
  run_id: string;
  at: string;
  type: string;
  [key: string]: string | number;
};

export type RunSummary = {
  schema: "oak.run.summary/1";
  run: TaskRun;
  closed_at: string;
  events: RunEvent[];
};

export const RUN_EVENT_TYPES: readonly string[];

export class TaskRunError extends Error {
  constructor(code: string, message: string);
  code: string;
}

export function startRun(options: {
  root: string;
  slug: string;
  branch: string;
  kind?: RunKind;
  now?: () => Date;
  random?: () => Uint8Array;
}): TaskRun;

export function runStatus(options: {
  root: string;
  branch?: string;
  now?: () => Date;
}): { active: false } | { active: true; run: TaskRun; stale: boolean; events: number };

export function appendRunEvent(options: {
  root: string;
  type: string;
  fields?: Record<string, string | number>;
  now?: () => Date;
}): RunEvent | null;

export function closeRun(options: {
  root: string;
  output?: string;
  now?: () => Date;
}): { active: false } | { run_id: string; path: string } | { run_id: string; summary: RunSummary };

export function currentBranch(root: string): string;
