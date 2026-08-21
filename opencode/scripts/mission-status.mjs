#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  LoopStateError,
  inspectLoopState,
  readLoopHistory,
} from "./loop-state.mjs";

const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

const NEXT_ACTIONS = Object.freeze({
  approved: "resume after confirming the approved contract",
  running: "continue only within the persisted iteration budget",
  paused: "validate the contract and lock, then resume explicitly",
  blocked: "inspect the blocking cause and resolve it before resuming",
  completed: "no further action; start a new loop if more work is needed",
});

function fail(code, message) {
  throw new LoopStateError(code, message);
}

function requireSlug(slug) {
  if (typeof slug !== "string" || !slugPattern.test(slug)) {
    fail("invalid_argument", "slug is invalid");
  }
}

export function parseArguments(argv = []) {
  let root = process.cwd();
  let slug;
  let json = false;
  let rootProvided = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") {
      if (json) fail("invalid_argument", "--json was provided more than once");
      json = true;
      continue;
    }
    if (token === "--slug" || token === "--root") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        fail("invalid_argument", `${token} requires a value`);
      }
      index += 1;
      if (token === "--slug") {
        if (slug !== undefined) fail("invalid_argument", "--slug was provided more than once");
        slug = value;
      } else {
        if (rootProvided) fail("invalid_argument", "--root was provided more than once");
        if (!path.isAbsolute(value)) fail("invalid_argument", "--root must be an absolute path");
        root = value;
        rootProvided = true;
      }
      continue;
    }
    fail("invalid_argument", `unknown argument ${token}`);
  }

  if (slug === undefined) fail("invalid_argument", "--slug is required");
  requireSlug(slug);
  return { root, slug, json };
}

export function projectMission(state, events) {
  if (!Array.isArray(events) || events.length === 0) {
    fail("history_corrupt", "loop history is empty");
  }
  const latest = events.at(-1);
  if (latest.state_after.last_action_id !== state.last_action_id) {
    fail("history_corrupt", "latest history event does not match canonical state");
  }
  return {
    schema_version: 1,
    slug: state.slug,
    status: state.status,
    current_iteration: state.current_iteration,
    planned_iterations: state.planned_iterations,
    last_completed_step: state.last_completed_step,
    blocking_cause: state.blocking_cause,
    session_id: state.lease?.session_id ?? state.session_id,
    updated_at: latest.recorded_at,
    next_action: NEXT_ACTIONS[state.status],
  };
}

export function readMissionStatus({ root, slug }) {
  const state = inspectLoopState({ root, slug });
  const events = readLoopHistory({ root, slug });
  return projectMission(state, events);
}

function display(value) {
  return value === null || value === undefined || value === "" ? "—" : value;
}

export function renderHuman(mission) {
  return [
    `Mission: ${mission.slug}`,
    `Status: ${mission.status}`,
    `Iteration: ${mission.current_iteration}/${mission.planned_iterations}`,
    `Last step: ${display(mission.last_completed_step)}`,
    `Blocking cause: ${display(mission.blocking_cause)}`,
    `Session: ${display(mission.session_id)}`,
    `Updated: ${mission.updated_at}`,
    `Next action: ${mission.next_action}`,
  ].join("\n");
}

export function main(argv = process.argv.slice(2), output = process.stdout) {
  const options = parseArguments(argv);
  const mission = readMissionStatus(options);
  output.write(`${options.json ? JSON.stringify(mission, null, 2) : renderHuman(mission)}\n`);
  return mission;
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
