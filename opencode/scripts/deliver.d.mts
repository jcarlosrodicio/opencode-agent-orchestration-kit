export type DeliverErrorCode =
  | "not_completed"
  | "attestation_missing"
  | "default_branch"
  | "unsafe_branch"
  | "dirty_tree"
  | "no_commits"
  | "unsafe_body"
  | "command_failed"
  | "invalid_argument";

export class DeliverError extends Error {
  constructor(code: DeliverErrorCode, message: string);
  code: DeliverErrorCode;
}

export type CommandRunner = (
  command: string,
  args: string[],
  root: string,
) => { status: number | null; stdout?: string; stderr?: string };

export function deliver(options: {
  root: string;
  slug: string;
  title: string;
  bodyFile: string;
  runner?: CommandRunner;
}): { branch: string; base: string; pr_url: string };

export function prChecks(options: {
  root: string;
  pr: number | string;
  runner?: CommandRunner;
}): Array<{ name: string; state: string; bucket: string; link: string; reason?: string }>;

export function main(argv?: string[]): void;
