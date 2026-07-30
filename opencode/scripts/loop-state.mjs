#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA_VERSION = 1;
const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const approvalStatuses = new Set(["approved"]);
const loopStatuses = new Set(["approved", "running", "completed", "paused", "blocked"]);

export class LoopStateError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "LoopStateError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new LoopStateError(code, message);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireString(value, label, pattern = idPattern) {
  if (typeof value !== "string" || !pattern.test(value)) {
    fail("invalid_argument", `${label} is invalid`);
  }
}

function requireNullableString(value, label) {
  if (value !== null && (typeof value !== "string" || value.length === 0)) {
    fail("state_corrupt", `${label} must be null or a non-empty string`);
  }
}

function requireExactKeys(value, keys, label, corruptCode = "state_corrupt") {
  if (!isObject(value)) fail(corruptCode, `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(corruptCode, `${label} has an invalid field set`);
  }
}

function validateState(state) {
  requireExactKeys(
    state,
    [
      "schema_version",
      "slug",
      "contract_hash",
      "git_baseline",
      "session_id",
      "approval",
      "lease",
      "status",
      "current_iteration",
      "last_completed_step",
      "blocking_cause",
      "last_action_id",
    ],
    "state",
  );
  if (state.schema_version !== SCHEMA_VERSION) {
    fail("schema_unsupported", `unsupported schema_version ${state.schema_version}`);
  }
  requireString(state.slug, "state.slug", slugPattern);
  if (!/^sha256:[a-f0-9]{64}$/.test(state.contract_hash)) {
    fail("state_corrupt", "state.contract_hash is invalid");
  }
  requireString(state.git_baseline, "state.git_baseline");
  requireString(state.session_id, "state.session_id");
  requireExactKeys(state.approval, ["status", "contract_hash"], "state.approval");
  if (!approvalStatuses.has(state.approval.status)) {
    fail("state_corrupt", "state.approval.status is invalid");
  }
  if (state.approval.contract_hash !== state.contract_hash) {
    fail("state_corrupt", "approval contract hash does not match state");
  }
  if (state.lease !== null) {
    requireExactKeys(state.lease, ["session_id", "acquired_at"], "state.lease");
    requireString(state.lease.session_id, "state.lease.session_id");
    if (
      typeof state.lease.acquired_at !== "string"
      || Number.isNaN(Date.parse(state.lease.acquired_at))
    ) {
      fail("state_corrupt", "state.lease.acquired_at is invalid");
    }
  }
  if (!loopStatuses.has(state.status)) {
    fail("state_corrupt", "state.status is invalid");
  }
  if (!Number.isInteger(state.current_iteration) || state.current_iteration < 0) {
    fail("state_corrupt", "state.current_iteration must be a non-negative integer");
  }
  requireNullableString(state.last_completed_step, "state.last_completed_step");
  requireNullableString(state.blocking_cause, "state.blocking_cause");
  requireString(state.last_action_id, "state.last_action_id");
  return state;
}

function validateEvent(event, expectedSequence) {
  requireExactKeys(
    event,
    [
      "schema_version",
      "sequence",
      "action_id",
      "type",
      "session_id",
      "payload",
      "recorded_at",
      "state_after",
    ],
    `history event ${expectedSequence}`,
    "history_corrupt",
  );
  if (event.schema_version !== SCHEMA_VERSION || event.sequence !== expectedSequence) {
    fail("history_corrupt", `history event ${expectedSequence} has invalid sequence or schema`);
  }
  if (
    typeof event.action_id !== "string"
    || !idPattern.test(event.action_id)
    || typeof event.type !== "string"
    || !idPattern.test(event.type)
    || typeof event.session_id !== "string"
    || !idPattern.test(event.session_id)
    || !isObject(event.payload)
    || typeof event.recorded_at !== "string"
    || Number.isNaN(Date.parse(event.recorded_at))
  ) {
    fail("history_corrupt", `history event ${expectedSequence} is invalid`);
  }
  try {
    validateState(event.state_after);
  } catch (error) {
    if (error instanceof LoopStateError) {
      fail("history_corrupt", `history event ${expectedSequence}: ${error.message}`);
    }
    throw error;
  }
  if (event.state_after.last_action_id !== event.action_id) {
    fail("history_corrupt", `history event ${expectedSequence} action mismatch`);
  }
  return event;
}

function validateHistoryContinuity(events, expectedSlug) {
  const first = events[0];
  if (!["initialized", "migrated"].includes(first.type)) {
    fail("history_corrupt", "history must start with initialized or migrated");
  }
  if (first.state_after.slug !== expectedSlug) {
    fail("history_corrupt", "history slug does not match its filename");
  }
  if (first.state_after.last_action_id !== first.action_id) {
    fail("history_corrupt", "initial action does not match state");
  }
  if (
    first.state_after.session_id !== first.session_id
    || first.state_after.lease !== null
  ) {
    fail("history_corrupt", "initial state has invalid session or lease");
  }
  if (first.type === "initialized") {
    requireExactKeys(
      first.payload,
      ["git_baseline"],
      "history event 1 payload",
      "history_corrupt",
    );
    if (first.payload.git_baseline !== first.state_after.git_baseline) {
      fail("history_corrupt", "initial git baseline mismatch");
    }
  } else {
    requireExactKeys(
      first.payload,
      ["from_schema_version"],
      "history event 1 payload",
      "history_corrupt",
    );
  }
  const immutable = {
    slug: first.state_after.slug,
    contract_hash: first.state_after.contract_hash,
    git_baseline: first.state_after.git_baseline,
    approval: first.state_after.approval,
  };
  const actionIds = new Set();
  for (const [index, event] of events.entries()) {
    if (actionIds.has(event.action_id)) {
      fail("history_corrupt", `history repeats action_id at event ${index + 1}`);
    }
    actionIds.add(event.action_id);
    for (const [field, value] of Object.entries(immutable)) {
      if (JSON.stringify(event.state_after[field]) !== JSON.stringify(value)) {
        fail("history_corrupt", `history changes immutable ${field} at event ${index + 1}`);
      }
    }
    if (index === 0) continue;
    const previous = events[index - 1].state_after;
    let expected;
    if (event.type === "resumed") {
      requireExactKeys(
        event.payload,
        ["contract_hash"],
        `history event ${index + 1} payload`,
        "history_corrupt",
      );
      if (
        previous.lease !== null
        || event.payload.contract_hash !== immutable.contract_hash
        || event.state_after.lease?.session_id !== event.session_id
      ) {
        fail("history_corrupt", `invalid resume transition at event ${index + 1}`);
      }
      expected = {
        ...previous,
        session_id: event.session_id,
        lease: event.state_after.lease,
        status: "running",
        last_action_id: event.action_id,
      };
    } else if (event.type === "action_recorded") {
      requireExactKeys(
        event.payload,
        ["iteration", "completed_step", "blocking_cause", "status"],
        `history event ${index + 1} payload`,
        "history_corrupt",
      );
      if (
        previous.lease?.session_id !== event.session_id
        || event.payload.iteration < previous.current_iteration
      ) {
        fail("history_corrupt", `invalid action transition at event ${index + 1}`);
      }
      expected = {
        ...previous,
        current_iteration: event.payload.iteration,
        last_completed_step: event.payload.completed_step,
        blocking_cause: event.payload.blocking_cause,
        status: event.payload.status ?? previous.status,
        last_action_id: event.action_id,
      };
    } else if (event.type === "released") {
      requireExactKeys(
        event.payload,
        [],
        `history event ${index + 1} payload`,
        "history_corrupt",
      );
      if (previous.lease?.session_id !== event.session_id) {
        fail("history_corrupt", `invalid release transition at event ${index + 1}`);
      }
      expected = {
        ...previous,
        lease: null,
        last_action_id: event.action_id,
      };
    } else if (event.type === "repaired") {
      requireExactKeys(
        event.payload,
        ["release_lock"],
        `history event ${index + 1} payload`,
        "history_corrupt",
      );
      if (event.payload.release_lock !== true) {
        fail("history_corrupt", `invalid repair transition at event ${index + 1}`);
      }
      expected = {
        ...previous,
        lease: null,
        last_action_id: event.action_id,
      };
    } else {
      fail("history_corrupt", `unexpected event type at event ${index + 1}`);
    }
    if (JSON.stringify(event.state_after) !== JSON.stringify(expected)) {
      fail("history_corrupt", `state transition mismatch at event ${index + 1}`);
    }
  }
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stable(value[key])]),
  );
}

function sameAction(event, type, sessionId, payload) {
  return JSON.stringify(stable({
    type: event.type,
    session_id: event.session_id,
    payload: event.payload,
  })) === JSON.stringify(stable({
    type,
    session_id: sessionId,
    payload,
  }));
}

function pathsFor(root, slug) {
  requireString(slug, "slug", slugPattern);
  if (typeof root !== "string" || root.length === 0) {
    fail("invalid_argument", "root is required");
  }
  let resolvedRoot;
  try {
    resolvedRoot = fs.realpathSync(path.resolve(root));
  } catch (error) {
    if (error.code === "ENOENT") fail("unsafe_path", "root must exist");
    throw error;
  }
  const rootStat = fs.lstatSync(resolvedRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    fail("unsafe_path", "root must resolve to a real directory");
  }
  const loopsDir = path.join(resolvedRoot, ".opencode", "loops");
  for (const directory of [
    path.join(resolvedRoot, ".opencode"),
    loopsDir,
  ]) {
    if (!fs.existsSync(directory)) continue;
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      fail("unsafe_path", `${directory} must be a real directory`);
    }
  }
  return {
    root: resolvedRoot,
    loopsDir,
    state: path.join(loopsDir, `${slug}.json`),
    history: path.join(loopsDir, `${slug}.history.jsonl`),
    lock: path.join(loopsDir, `${slug}.lock`),
    lockOwner: path.join(loopsDir, `${slug}.lock`, "owner.json"),
    transitionLock: path.join(loopsDir, `${slug}.lock`, "transition.lock"),
    markdown: path.join(loopsDir, `${slug}.md`),
    review: path.join(loopsDir, `${slug}.review.json`),
  };
}

function lstatIfPresent(file) {
  try {
    return fs.lstatSync(file);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function ensureLoopsDir(paths) {
  for (const directory of [
    path.join(paths.root, ".opencode"),
    paths.loopsDir,
  ]) {
    try {
      fs.mkdirSync(directory, { mode: 0o700 });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      fail("unsafe_path", `${directory} must be a real directory`);
    }
  }
}

function readJsonFile(file, code) {
  let raw;
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      fail("unsafe_path", `${file} must be a regular file`);
    }
    raw = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error instanceof LoopStateError) throw error;
    if (error.code === "ENOENT") fail("state_missing", `${file} does not exist`);
    throw error;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(code, `${file} contains invalid JSON: ${error.message}`);
  }
}

function readContract(contractPath, root) {
  if (typeof contractPath !== "string" || contractPath.length === 0) {
    fail("invalid_argument", "contractPath is required");
  }
  const resolved = path.resolve(contractPath);
  let realContract;
  try {
    realContract = fs.realpathSync(resolved);
  } catch (error) {
    if (error.code === "ENOENT") fail("contract_missing", `${resolved} does not exist`);
    throw error;
  }
  const relative = path.relative(path.resolve(root), realContract);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    fail("unsafe_path", "contractPath must stay inside root");
  }
  let stat;
  try {
    stat = fs.lstatSync(resolved);
  } catch (error) {
    if (error.code === "ENOENT") fail("contract_missing", `${resolved} does not exist`);
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    fail("unsafe_path", "contractPath must be a regular file");
  }
  return fs.readFileSync(realContract);
}

function contractHash(contractPath, root) {
  return `sha256:${createHash("sha256").update(readContract(contractPath, root)).digest("hex")}`;
}

function atomicWriteJson(file, value) {
  const directory = path.dirname(file);
  const temporary = path.join(
    directory,
    `.${path.basename(file)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`,
  );
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, file);
    const directoryDescriptor = fs.openSync(directory, "r");
    try {
      fs.fsyncSync(directoryDescriptor);
    } finally {
      fs.closeSync(directoryDescriptor);
    }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    fs.rmSync(temporary, { force: true });
  }
}

function readHistory(paths, { allowIncompleteTail = false } = {}) {
  let raw;
  try {
    const stat = fs.lstatSync(paths.history);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      fail("unsafe_path", `${paths.history} must be a regular file`);
    }
    raw = fs.readFileSync(paths.history, "utf8");
  } catch (error) {
    if (error instanceof LoopStateError) throw error;
    if (error.code === "ENOENT") fail("history_missing", `${paths.history} does not exist`);
    throw error;
  }
  const hasIncompleteTail = raw.length > 0 && !raw.endsWith("\n");
  const lines = raw.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const events = [];
  for (const [index, line] of lines.entries()) {
    try {
      events.push(validateEvent(JSON.parse(line), index + 1));
    } catch (error) {
      const isLast = index === lines.length - 1;
      if (
        allowIncompleteTail
        && hasIncompleteTail
        && isLast
        && error instanceof SyntaxError
      ) {
        if (events.length > 0) {
          validateHistoryContinuity(
            events,
            path.basename(paths.state, ".json"),
          );
        }
        return {
          events,
          validBytes: Buffer.byteLength(`${lines.slice(0, index).join("\n")}${index > 0 ? "\n" : ""}`),
          incompleteTail: true,
        };
      }
      if (error instanceof LoopStateError) throw error;
      fail("history_corrupt", `${paths.history}: line ${index + 1} is invalid`);
    }
  }
  if (events.length === 0) fail("history_corrupt", `${paths.history} is empty`);
  validateHistoryContinuity(
    events,
    path.basename(paths.state, ".json"),
  );
  return { events, validBytes: Buffer.byteLength(raw), incompleteTail: false };
}

function appendEvent(paths, event) {
  let descriptor;
  try {
    const before = event.sequence === 1 ? null : lstatIfPresent(paths.history);
    if (
      event.sequence !== 1
      && (before === null || !before.isFile() || before.isSymbolicLink())
    ) {
      fail("unsafe_path", `${paths.history} must remain a regular file`);
    }
    const noFollow = fs.constants.O_NOFOLLOW ?? 0;
    const flags = event.sequence === 1
      ? fs.constants.O_APPEND
        | fs.constants.O_CREAT
        | fs.constants.O_EXCL
        | fs.constants.O_WRONLY
        | noFollow
      : fs.constants.O_APPEND
        | fs.constants.O_WRONLY
        | noFollow;
    descriptor = fs.openSync(paths.history, flags, 0o600);
    if (event.sequence !== 1) {
      const opened = fs.fstatSync(descriptor);
      const after = fs.lstatSync(paths.history);
      if (
        !opened.isFile()
        || !after.isFile()
        || after.isSymbolicLink()
        || opened.dev !== after.dev
        || opened.ino !== after.ino
        || opened.dev !== before.dev
        || opened.ino !== before.ino
      ) {
        fail("unsafe_path", `${paths.history} changed during append`);
      }
    }
    fs.writeFileSync(descriptor, `${JSON.stringify(event)}\n`);
    fs.fsyncSync(descriptor);
  } catch (error) {
    if (["ELOOP", "EMLINK"].includes(error.code)) {
      fail("unsafe_path", `${paths.history} cannot be a symlink`);
    }
    if (error.code === "EEXIST") {
      fail("history_exists", `${paths.history} already exists`);
    }
    if (error.code === "ENOENT") {
      fail("history_missing", `${paths.history} does not exist`);
    }
    throw error;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function loadStateAndHistory(paths) {
  const state = validateState(readJsonFile(paths.state, "state_corrupt"));
  const { events } = readHistory(paths);
  const latest = events.at(-1).state_after;
  return { state, events, latest };
}

function actionResult(events, actionId, type, sessionId, payload) {
  const existing = events.find((event) => event.action_id === actionId);
  if (!existing) return null;
  if (!sameAction(existing, type, sessionId, payload)) {
    fail("action_conflict", `action_id ${actionId} was already used with different content`);
  }
  return structuredClone(events.at(-1).state_after);
}

function committedActionResult(
  paths,
  state,
  events,
  actionId,
  type,
  sessionId,
  payload,
) {
  const result = actionResult(events, actionId, type, sessionId, payload);
  if (!result) return null;
  const latest = events.at(-1).state_after;
  const durableLockPresent = lstatIfPresent(paths.lock) !== null;
  if (
    JSON.stringify(state) !== JSON.stringify(latest)
    || lstatIfPresent(paths.transitionLock) !== null
    || durableLockPresent !== (latest.lease !== null)
  ) {
    fail("recovery_required", "action exists in history but its commit is incomplete; run repair");
  }
  return result;
}

function commitTransition({
  paths,
  events,
  actionId,
  type,
  sessionId,
  payload,
  nextState,
  failpoint,
}) {
  requireString(actionId, "actionId");
  const duplicate = actionResult(events, actionId, type, sessionId, payload);
  if (duplicate) return duplicate;
  const stateAfter = validateState({
    ...nextState,
    last_action_id: actionId,
  });
  const event = {
    schema_version: SCHEMA_VERSION,
    sequence: events.length + 1,
    action_id: actionId,
    type,
    session_id: sessionId,
    payload,
    recorded_at: new Date().toISOString(),
    state_after: stateAfter,
  };
  appendEvent(paths, event);
  if (failpoint === "after_journal") {
    fail("simulated_crash", "simulated crash after journal append");
  }
  atomicWriteJson(paths.state, stateAfter);
  if (failpoint === "after_snapshot") {
    fail("simulated_crash", "simulated crash after snapshot write");
  }
  return structuredClone(stateAfter);
}

function acquireLock(paths, sessionId) {
  try {
    fs.mkdirSync(paths.lock, { mode: 0o700 });
  } catch (error) {
    if (error.code === "EEXIST") fail("loop_locked", `loop ${path.basename(paths.state, ".json")} is locked`);
    throw error;
  }
  try {
    atomicWriteJson(paths.lockOwner, {
      session_id: sessionId,
      acquired_at: new Date().toISOString(),
    });
  } catch (error) {
    fs.rmSync(paths.lock, { recursive: true, force: true });
    throw error;
  }
}

function requireLockOwner(paths, sessionId) {
  const owner = readJsonFile(paths.lockOwner, "lock_corrupt");
  requireExactKeys(owner, ["session_id", "acquired_at"], "lock owner", "lock_corrupt");
  if (owner.session_id !== sessionId) {
    fail("lease_mismatch", `loop lease belongs to ${owner.session_id}`);
  }
}

function acquireTransitionLock(paths, sessionId) {
  let descriptor;
  try {
    descriptor = fs.openSync(paths.transitionLock, "wx", 0o600);
    fs.writeFileSync(descriptor, `${JSON.stringify({
      session_id: sessionId,
      acquired_at: new Date().toISOString(),
    })}\n`);
    fs.fsyncSync(descriptor);
  } catch (error) {
    if (error.code === "EEXIST") {
      fail("transition_locked", "another transition is already in progress");
    }
    if (error.code === "ENOENT") {
      fail("lease_mismatch", "durable loop lock disappeared");
    }
    throw error;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function releaseTransitionLock(paths) {
  fs.rmSync(paths.transitionLock, { force: true });
}

export function initLoopState({
  root,
  slug,
  contractPath,
  gitBaseline,
  sessionId,
  actionId,
}) {
  requireString(gitBaseline, "gitBaseline");
  requireString(sessionId, "sessionId");
  requireString(actionId, "actionId");
  const paths = pathsFor(root, slug);
  ensureLoopsDir(paths);
  const hash = contractHash(contractPath, paths.root);
  if (
    lstatIfPresent(paths.state) !== null
    || lstatIfPresent(paths.history) !== null
    || lstatIfPresent(paths.lock) !== null
  ) {
    fail("state_exists", `loop ${slug} already has durable state`);
  }
  const state = validateState({
    schema_version: SCHEMA_VERSION,
    slug,
    contract_hash: hash,
    git_baseline: gitBaseline,
    session_id: sessionId,
    approval: { status: "approved", contract_hash: hash },
    lease: null,
    status: "approved",
    current_iteration: 0,
    last_completed_step: null,
    blocking_cause: null,
    last_action_id: actionId,
  });
  const event = {
    schema_version: SCHEMA_VERSION,
    sequence: 1,
    action_id: actionId,
    type: "initialized",
    session_id: sessionId,
    payload: { git_baseline: gitBaseline },
    recorded_at: new Date().toISOString(),
    state_after: state,
  };
  appendEvent(paths, event);
  atomicWriteJson(paths.state, state);
  return structuredClone(state);
}

export function inspectLoopState({ root, slug }) {
  const paths = pathsFor(root, slug);
  const { state, latest } = loadStateAndHistory(paths);
  if (JSON.stringify(state) !== JSON.stringify(latest)) {
    fail("snapshot_stale", "snapshot is behind append-only history; run repair");
  }
  return structuredClone(state);
}

function validateReviewEvidence(evidence, state) {
  requireExactKeys(
    evidence,
    [
      "schema_version",
      "slug",
      "reviewer_session_id",
      "reviewer_agent",
      "reviewer_verdict",
      "contract_hash",
    ],
    "review evidence",
    "review_evidence_required",
  );
  if (
    evidence.schema_version !== SCHEMA_VERSION
    || evidence.slug !== state.slug
    || evidence.contract_hash !== state.contract_hash
    || evidence.reviewer_agent !== "reviewer"
    || evidence.reviewer_verdict !== "APPROVE"
  ) {
    fail("review_evidence_required", "review evidence does not attest reviewer APPROVE for this contract");
  }
  requireString(evidence.reviewer_session_id, "reviewer_session_id");
  return evidence;
}

function requireReviewEvidence(paths, state) {
  let evidence;
  try {
    evidence = readJsonFile(paths.review, "review_evidence_required");
  } catch (error) {
    if (error instanceof LoopStateError && error.code === "state_missing") {
      fail("review_evidence_required", "reviewer APPROVE evidence is required before completion");
    }
    throw error;
  }
  return validateReviewEvidence(evidence, state);
}

export function attestReview({
  root,
  slug,
  reviewerSessionId,
  reviewerAgent,
  reviewerVerdict,
}) {
  requireString(reviewerSessionId, "reviewerSessionId");
  const paths = pathsFor(root, slug);
  const { state } = loadStateAndHistory(paths);
  const evidence = {
    schema_version: SCHEMA_VERSION,
    slug: state.slug,
    reviewer_session_id: reviewerSessionId,
    reviewer_agent: reviewerAgent,
    reviewer_verdict: reviewerVerdict,
    contract_hash: state.contract_hash,
  };
  validateReviewEvidence(evidence, state);
  atomicWriteJson(paths.review, evidence);
  return structuredClone(evidence);
}

export function acquireLoop({
  root,
  slug,
  contractPath,
  sessionId,
  actionId,
}) {
  requireString(sessionId, "sessionId");
  requireString(actionId, "actionId");
  const paths = pathsFor(root, slug);
  const { state, events, latest } = loadStateAndHistory(paths);
  const payload = { contract_hash: contractHash(contractPath, paths.root) };
  if (payload.contract_hash !== state.contract_hash) {
    fail("contract_mismatch", "approved contract hash does not match the current contract");
  }
  const duplicate = committedActionResult(
    paths,
    state,
    events,
    actionId,
    "resumed",
    sessionId,
    payload,
  );
  if (duplicate) return duplicate;
  if (JSON.stringify(state) !== JSON.stringify(latest)) {
    fail("snapshot_stale", "snapshot is behind append-only history; run repair");
  }
  if (state.lease !== null) {
    if (lstatIfPresent(paths.lock) !== null) {
      fail("loop_locked", `loop ${slug} is locked`);
    }
    fail("lease_inconsistent", "canonical state already has a lease; run repair");
  }
  acquireLock(paths, sessionId);
  try {
    return commitTransition({
      paths,
      events,
      actionId,
      type: "resumed",
      sessionId,
      payload,
      nextState: {
        ...state,
        session_id: sessionId,
        lease: {
          session_id: sessionId,
          acquired_at: new Date().toISOString(),
        },
        status: "running",
      },
    });
  } catch (error) {
    fs.rmSync(paths.lock, { recursive: true, force: true });
    throw error;
  }
}

export function recordLoopAction({
  root,
  slug,
  sessionId,
  actionId,
  iteration,
  completedStep,
  blockingCause,
  status,
  failpoint,
}) {
  requireString(sessionId, "sessionId");
  requireString(actionId, "actionId");
  if (!Number.isInteger(iteration) || iteration < 0) {
    fail("invalid_argument", "iteration must be a non-negative integer");
  }
  if (completedStep !== null && (typeof completedStep !== "string" || completedStep.length === 0)) {
    fail("invalid_argument", "completedStep must be null or a non-empty string");
  }
  if (blockingCause !== null && (typeof blockingCause !== "string" || blockingCause.length === 0)) {
    fail("invalid_argument", "blockingCause must be null or a non-empty string");
  }
  if (status !== undefined && !loopStatuses.has(status)) {
    fail("invalid_argument", "status is invalid");
  }
  const paths = pathsFor(root, slug);
  const payload = {
    iteration,
    completed_step: completedStep,
    blocking_cause: blockingCause,
    status: status ?? null,
  };
  const initial = loadStateAndHistory(paths);
  const duplicate = committedActionResult(
    paths,
    initial.state,
    initial.events,
    actionId,
    "action_recorded",
    sessionId,
    payload,
  );
  if (duplicate) return duplicate;
  requireLockOwner(paths, sessionId);
  acquireTransitionLock(paths, sessionId);
  let preserveTransitionLock = false;
  try {
    const { state, events, latest } = loadStateAndHistory(paths);
    const concurrentDuplicate = actionResult(
      events,
      actionId,
      "action_recorded",
      sessionId,
      payload,
    );
    if (concurrentDuplicate) return concurrentDuplicate;
    if (JSON.stringify(state) !== JSON.stringify(latest)) {
      fail("snapshot_stale", "snapshot is behind append-only history; run repair");
    }
    requireLockOwner(paths, sessionId);
    if (state.lease?.session_id !== sessionId) {
      fail("lease_mismatch", "canonical lease does not belong to this session");
    }
    if (iteration < state.current_iteration) {
      fail("iteration_regression", "iteration cannot move backwards");
    }
    if ((status ?? state.status) === "completed") {
      requireReviewEvidence(paths, state);
    }
    try {
      return commitTransition({
        paths,
        events,
        actionId,
        type: "action_recorded",
        sessionId,
        payload,
        failpoint,
        nextState: {
          ...state,
          current_iteration: iteration,
          last_completed_step: completedStep,
          blocking_cause: blockingCause,
          status: status ?? state.status,
        },
      });
    } catch (error) {
      preserveTransitionLock =
        error instanceof LoopStateError && error.code === "simulated_crash";
      throw error;
    }
  } finally {
    if (!preserveTransitionLock) releaseTransitionLock(paths);
  }
}

export function releaseLoop({ root, slug, sessionId, actionId, failpoint }) {
  requireString(sessionId, "sessionId");
  requireString(actionId, "actionId");
  const paths = pathsFor(root, slug);
  const initial = loadStateAndHistory(paths);
  const duplicate = committedActionResult(
    paths,
    initial.state,
    initial.events,
    actionId,
    "released",
    sessionId,
    {},
  );
  if (duplicate) return duplicate;
  requireLockOwner(paths, sessionId);
  acquireTransitionLock(paths, sessionId);
  let preserveTransitionLock = false;
  try {
    const { state, events, latest } = loadStateAndHistory(paths);
    const payload = {};
    const concurrentDuplicate = actionResult(
      events,
      actionId,
      "released",
      sessionId,
      payload,
    );
    if (concurrentDuplicate) return concurrentDuplicate;
    if (JSON.stringify(state) !== JSON.stringify(latest)) {
      fail("snapshot_stale", "snapshot is behind append-only history; run repair");
    }
    requireLockOwner(paths, sessionId);
    if (state.lease?.session_id !== sessionId) {
      fail("lease_mismatch", "canonical lease does not belong to this session");
    }
    let released;
    try {
      released = commitTransition({
        paths,
        events,
        actionId,
        type: "released",
        sessionId,
        payload,
        failpoint,
        nextState: { ...state, lease: null },
      });
    } catch (error) {
      preserveTransitionLock =
        error instanceof LoopStateError && error.code === "simulated_crash";
      throw error;
    }
    fs.rmSync(paths.lock, { recursive: true, force: true });
    return released;
  } finally {
    if (!preserveTransitionLock) releaseTransitionLock(paths);
  }
}

export function repairLoopState({
  root,
  slug,
  releaseLock = false,
  truncateTail = false,
}) {
  const paths = pathsFor(root, slug);
  if (lstatIfPresent(paths.lock) !== null && !releaseLock) {
    fail("loop_locked", "repair refuses an active or abandoned lock without --release-lock");
  }
  const history = readHistory(paths, { allowIncompleteTail: truncateTail });
  if (history.incompleteTail) {
    fs.truncateSync(paths.history, history.validBytes);
    const descriptor = fs.openSync(paths.history, "r");
    try {
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
  }
  if (history.events.length === 0) {
    fail("history_corrupt", "history has no complete events");
  }
  let recovered = structuredClone(history.events.at(-1).state_after);
  if (releaseLock) {
    const actionId = `repair:${randomBytes(8).toString("hex")}`;
    recovered = {
      ...recovered,
      lease: null,
      last_action_id: actionId,
    };
    appendEvent(paths, {
      schema_version: SCHEMA_VERSION,
      sequence: history.events.length + 1,
      action_id: actionId,
      type: "repaired",
      session_id: "repair",
      payload: { release_lock: true },
      recorded_at: new Date().toISOString(),
      state_after: recovered,
    });
    fs.rmSync(paths.lock, { recursive: true, force: true });
  }
  atomicWriteJson(paths.state, recovered);
  return recovered;
}

export function migrateLoopState({
  root,
  slug,
  contractPath,
  gitBaseline,
  sessionId,
  actionId,
  approvalStatus,
}) {
  if (approvalStatus !== "approved") {
    fail("approval_required", "migration requires renewed explicit approval");
  }
  requireString(sessionId, "sessionId");
  requireString(actionId, "actionId");
  const paths = pathsFor(root, slug);
  ensureLoopsDir(paths);
  let legacy = null;
  if (lstatIfPresent(paths.state) !== null) {
    legacy = readJsonFile(paths.state, "state_corrupt");
    if (!isObject(legacy) || legacy.schema_version !== 0) {
      fail("schema_unsupported", "migrate accepts only schema_version 0 or markdown-only state");
    }
  }
  const baseline = legacy?.git_baseline ?? gitBaseline;
  requireString(baseline, "gitBaseline");
  if (lstatIfPresent(paths.history) !== null) {
    fail("history_exists", "migration refuses to replace existing append-only history");
  }
  const hash = contractHash(contractPath, paths.root);
  const state = validateState({
    schema_version: SCHEMA_VERSION,
    slug,
    contract_hash: hash,
    git_baseline: baseline,
    session_id: sessionId,
    approval: { status: "approved", contract_hash: hash },
    lease: null,
    status: legacy?.status ?? "approved",
    current_iteration: legacy?.current_iteration ?? 0,
    last_completed_step: legacy?.last_completed_step ?? null,
    blocking_cause: legacy?.blocking_cause ?? null,
    last_action_id: actionId,
  });
  const event = {
    schema_version: SCHEMA_VERSION,
    sequence: 1,
    action_id: actionId,
    type: "migrated",
    session_id: sessionId,
    payload: { from_schema_version: legacy?.schema_version ?? "markdown" },
    recorded_at: new Date().toISOString(),
    state_after: state,
  };
  appendEvent(paths, event);
  atomicWriteJson(paths.state, state);
  return structuredClone(state);
}

function parseArguments(argv) {
  const [command, ...tokens] = argv;
  const options = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) fail("invalid_argument", `unexpected argument ${token}`);
    const key = token.slice(2).replaceAll("-", "_");
    if (["release_lock", "truncate_tail"].includes(key)) {
      options[key] = true;
      continue;
    }
    const value = tokens[index + 1];
    if (value === undefined || value.startsWith("--")) {
      fail("invalid_argument", `${token} requires a value`);
    }
    options[key] = value;
    index += 1;
  }
  return { command, options };
}

function cliOptions(options) {
  return {
    root: options.root ?? process.cwd(),
    slug: options.slug,
    contractPath: options.contract,
    gitBaseline: options.git_baseline,
    sessionId: options.session_id,
    actionId: options.action_id,
    approvalStatus: options.approval_status,
  };
}

export function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArguments(argv);
  const common = cliOptions(options);
  let result;
  if (command === "init") {
    result = initLoopState(common);
  } else if (command === "resume") {
    result = acquireLoop(common);
  } else if (command === "record") {
    result = recordLoopAction({
      ...common,
      iteration: Number(options.iteration),
      completedStep: options.completed_step === "null" ? null : options.completed_step,
      blockingCause: options.blocking_cause === "null" ? null : options.blocking_cause,
      status: options.status,
    });
  } else if (command === "release") {
    result = releaseLoop(common);
  } else if (command === "inspect") {
    result = inspectLoopState(common);
  } else if (command === "attest-review") {
    result = attestReview({
      root: common.root,
      slug: common.slug,
      reviewerSessionId: options.reviewer_session_id,
      reviewerAgent: options.reviewer_agent,
      reviewerVerdict: options.reviewer_verdict,
    });
  } else if (command === "repair") {
    result = repairLoopState({
      ...common,
      releaseLock: options.release_lock === true,
      truncateTail: options.truncate_tail === true,
    });
  } else if (command === "migrate") {
    result = migrateLoopState(common);
  } else {
    fail(
      "invalid_argument",
      "command must be init, resume, record, release, inspect, attest-review, repair, or migrate",
    );
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const isDirect = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirect) {
  try {
    main();
  } catch (error) {
    if (error instanceof LoopStateError) {
      process.stderr.write(`${error.code}: ${error.message}\n`);
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}
