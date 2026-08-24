import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  AGENT_IDS,
  applyModelSelection,
  createOcSwitcher,
  findOpenCodeBinaryOnPath,
  isDirectExecution,
  parseOpenCodeAuthProviders,
  parseOpenCodeModelList,
  renderModelPicker,
  renderMainScreen,
  runTerminalOcSwitcher,
} from "./oc-switch.mjs";

function createTuiInput() {
  const input = new EventEmitter();
  input.isTTY = true;
  input.setRawMode = () => {};
  input.resume = () => {};
  input.pause = () => {};
  return input;
}

function emitKey(input, name, sequence = name) {
  input.emit("keypress", sequence, { name, sequence, ctrl: name === "c" });
}

function nextTick() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("parses OpenCode models without a fixed provider list", () => {
  assert.deepEqual(parseOpenCodeModelList([
    "openai/gpt-5",
    "custom-provider/model-a",
    "openrouter/anthropic/claude-sonnet-4.6",
    "openai/gpt-5",
    "informational text",
  ].join("\n")), {
    openai: ["openai/gpt-5"],
    "custom-provider": ["custom-provider/model-a"],
    openrouter: ["openrouter/anthropic/claude-sonnet-4.6"],
  });
});

test("extracts only credential providers from auth output", () => {
  assert.deepEqual(parseOpenCodeAuthProviders([
    "┌ Credentials",
    "● OpenAI oauth",
    "● OpenCode Go api",
    "┌ Environment",
    "● DeepSeek DEEPSEEK_API_KEY",
  ].join("\n")), ["openai", "opencode-go"]);
});

test("updates OpenCode default, small, and selected agent assignments", () => {
  const state = {
    schemaVersion: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
    defaultModel: "openai/old",
    smallModel: "openai/old-small",
    agents: Object.fromEntries(AGENT_IDS.map((agent) => [agent, "openai/old"])),
  };
  const next = applyModelSelection(state, {
    target: "smallModel",
    modelRef: "custom-provider/model-a",
  });
  const agents = applyModelSelection(next, {
    target: "agents",
    agents: ["lead", "developer"],
    modelRef: "custom-provider/model-a",
  });
  assert.equal(agents.smallModel, "custom-provider/model-a");
  assert.equal(agents.agents.lead, "custom-provider/model-a");
  assert.equal(agents.agents.developer, "custom-provider/model-a");
  assert.equal(agents.agents.reviewer, "openai/old");
});

test("renders a bounded provider-neutral picker", () => {
  const screen = renderModelPicker({
    targetLabel: "lead",
    models: Array.from({ length: 12 }, (_, index) => `provider/model-${index}`),
    focusedIndex: 8,
    maxVisibleModels: 5,
  });
  assert.match(screen, /more models/);
  assert.match(screen, /provider\/model-8/);
  assert.doesNotMatch(screen, /provider\/model-0/);
  assert.match(renderMainScreen({
    state: {
      defaultModel: "provider/model-0",
      smallModel: "provider/model-1",
      agents: Object.fromEntries(AGENT_IDS.map((agent) => [agent, "provider/model-0"])),
    },
    focusedIndex: 2,
  }), />\s+lead/);
});

test("OpenCode TUI changes the default model and persists on q", async () => {
  const input = createTuiInput();
  const output = { isTTY: true, rows: 30, writes: [], write(chunk) { this.writes.push(String(chunk)); } };
  const saved = [];
  const state = {
    schemaVersion: 1,
    defaultModel: "nan/model-a",
    smallModel: "nan/model-a",
    agents: Object.fromEntries(AGENT_IDS.map((agent) => [agent, "nan/model-a"])),
  };
  const running = runTerminalOcSwitcher({
    input,
    output,
    initialState: state,
    initialModels: ["nan/model-a", "openai/model-b"],
    refreshModels: async () => ["nan/model-a", "openai/model-b"],
    saveState: async (nextState) => {
      saved.push(nextState);
      return nextState;
    },
  });

  await nextTick();
  emitKey(input, "return", "\r");
  await nextTick();
  emitKey(input, "down");
  emitKey(input, "return", "\r");
  await nextTick();
  emitKey(input, "q");
  const result = await running;

  assert.equal(result.status, "saved");
  assert.equal(saved.length, 1);
  assert.equal(saved[0].defaultModel, "openai/model-b");
  assert.match(output.writes.join(""), /Loading models/);
});

test("OpenCode TUI changes the focused agent model", async () => {
  const input = createTuiInput();
  const output = { isTTY: true, rows: 30, writes: [], write(chunk) { this.writes.push(String(chunk)); } };
  const saved = [];
  const state = {
    schemaVersion: 1,
    defaultModel: "nan/model-a",
    smallModel: "nan/model-a",
    agents: Object.fromEntries(AGENT_IDS.map((agent) => [agent, "nan/model-a"])),
  };
  const running = runTerminalOcSwitcher({
    input,
    output,
    initialState: state,
    initialModels: ["nan/model-a", "openai/model-b"],
    refreshModels: async () => ["nan/model-a", "openai/model-b"],
    saveState: async (nextState) => {
      saved.push(nextState);
      return nextState;
    },
  });

  await nextTick();
  emitKey(input, "down");
  emitKey(input, "down");
  emitKey(input, "return", "\r");
  await nextTick();
  emitKey(input, "down");
  emitKey(input, "return", "\r");
  await nextTick();
  emitKey(input, "q");
  const result = await running;

  assert.equal(result.status, "saved");
  assert.equal(saved.length, 1);
  assert.equal(saved[0].agents.lead, "openai/model-b");
});

test("OpenCode search treats shortcut letters as query text", async () => {
  const input = createTuiInput();
  const output = { isTTY: true, rows: 30, writes: [], write(chunk) { this.writes.push(String(chunk)); } };
  const running = runTerminalOcSwitcher({
    input,
    output,
    initialState: {
      schemaVersion: 1,
      defaultModel: "nan/model-a",
      smallModel: "nan/model-a",
      agents: Object.fromEntries(AGENT_IDS.map((agent) => [agent, "nan/model-a"])),
    },
    initialModels: ["nan/model-a", "openai/model-b"],
    refreshModels: async () => ["nan/model-a", "openai/model-b"],
    saveState: async (state) => state,
  });

  await nextTick();
  emitKey(input, "/", "/");
  emitKey(input, "q");
  emitKey(input, "r");
  emitKey(input, "s");
  await nextTick();
  assert.match(output.writes.join(""), /Search: qrs/);
  emitKey(input, "escape");
  await nextTick();
  emitKey(input, "q");
  const result = await running;
  assert.equal(result.status, "saved");
});

test("uses the local OpenCode model cache until an explicit refresh", async () => {
  const calls = [];
  const switcher = createOcSwitcher({
    homeDir: "/tmp/oc-switch-test-home",
    env: { OPENCODE_MODEL: "openai/model-a" },
    resolve: async () => "/opt/opencode/bin/opencode",
    command: async (args) => {
      calls.push(args);
      return "openai/model-a\n";
    },
  });

  await switcher.refreshModels();
  await switcher.refreshModels({ forceRefresh: true });

  assert.deepEqual(calls, [
    ["/opt/opencode/bin/opencode", "auth", "list"],
    ["/opt/opencode/bin/opencode", "models", "--pure"],
    ["/opt/opencode/bin/opencode", "auth", "list"],
    ["/opt/opencode/bin/opencode", "models", "--pure", "--refresh"],
  ]);
});

test("finds OpenCode directly on PATH without starting a login shell", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "oc-switch-path-"));
  const binary = path.join(directory, "opencode");
  try {
    fs.writeFileSync(binary, "#!/bin/sh\n", { mode: 0o755 });
    assert.equal(findOpenCodeBinaryOnPath({ env: { PATH: directory } }), binary);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("direct execution helper follows the installed oc-switch symlink", () => {
  const root = new URL("./", import.meta.url).pathname;
  const link = `${root}..test-oc-switch-link-${process.pid}`;
  const source = new URL("./oc-switch.mjs", import.meta.url).pathname;
  try {
    fs.symlinkSync(source, link);
    assert.equal(isDirectExecution({ argvPath: link, modulePath: source }), true);
  } finally {
    fs.rmSync(link, { force: true });
  }
});
