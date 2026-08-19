#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { emitKeypressEvents } from "node:readline";
import { fileURLToPath } from "node:url";

export const AGENT_IDS = [
  "lead", "designer", "researcher", "specifier", "developer",
  "reviewer", "evaluator", "debugger", "evolver",
];

const ANSI = Object.freeze({
  eraseDown: "\u001b[0J",
  hideCursor: "\u001b[?25l",
  showCursor: "\u001b[?25h",
  reverse: "\u001b[7m",
  reset: "\u001b[0m",
  dim: "\u001b[2m",
});
const STATE_VERSION = 1;
const STATE_PARTS = ["opencode", "model-switcher", "state.json"];
const SHELL_START = "# >>> oc-switch managed model routing >>>";
const SHELL_END = "# <<< oc-switch managed model routing <<<";

const agentEnvKey = (agent) => `OPENCODE_${agent.toUpperCase()}_MODEL`;

function validateModelReference(value) {
  if (typeof value !== "string" || value.length === 0 || /\s/.test(value)) {
    throw new Error("model must be a provider/model reference");
  }
  const slash = value.indexOf("/");
  if (slash <= 0 || slash === value.length - 1) {
    throw new Error("model must have the form provider/model");
  }
  return value;
}

function providerFromModel(modelRef) {
  return validateModelReference(modelRef).slice(0, validateModelReference(modelRef).indexOf("/"));
}

function parseConfigProviderIds(contents) {
  try {
    const parsed = JSON.parse(contents);
    return parsed?.provider && typeof parsed.provider === "object"
      ? Object.keys(parsed.provider).filter((providerId) => /^[^\s/]+$/.test(providerId))
      : [];
  } catch {
    return [];
  }
}

export function parseOpenCodeModelList(stdout) {
  if (typeof stdout !== "string") throw new Error("catalog stdout must be a string");
  const grouped = {};
  const seen = new Set();
  for (const rawLine of stdout.split(/\r?\n/)) {
    const modelRef = rawLine.trim();
    if (!modelRef || /\s/.test(modelRef)) continue;
    try { validateModelReference(modelRef); } catch { continue; }
    if (seen.has(modelRef)) continue;
    seen.add(modelRef);
    const providerId = providerFromModel(modelRef);
    (grouped[providerId] ??= []).push(modelRef);
  }
  return grouped;
}

export function parseOpenCodeAuthProviders(stdout) {
  if (typeof stdout !== "string") throw new Error("auth stdout must be a string");
  const providers = [];
  let credentials = false;
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "").trim();
    if (/\bEnvironment\b/i.test(line) && !line.startsWith("●")) break;
    if (/\bCredentials\b/i.test(line)) {
      credentials = true;
      continue;
    }
    if (!credentials || !line.startsWith("●")) continue;
    const label = line.slice(1).trim().replace(/\s+(?:oauth|api|token|key)$/i, "");
    const providerId = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (providerId && !providers.includes(providerId)) providers.push(providerId);
  }
  return providers;
}

function providerIdsFromEnvironment(env) {
  const refs = Object.entries(env)
    .filter(([key]) => /^OPENCODE_(?:MODEL|SMALL_MODEL|[A-Z0-9_]+_MODEL)$/.test(key))
    .map(([, value]) => value);
  return refs.flatMap((value) => {
    try { return [providerFromModel(value)]; } catch { return []; }
  });
}

function configuredProviderIds({ homeDir, env = process.env, cwd = process.cwd() }) {
  const providers = [];
  const add = (values) => values.forEach((value) => {
    if (!providers.includes(value)) providers.push(value);
  });
  add(providerIdsFromEnvironment(env));
  if (typeof env.OPENCODE_CONFIG_CONTENT === "string") {
    add(parseConfigProviderIds(env.OPENCODE_CONFIG_CONTENT));
  }
  const configPaths = [
    env.OPENCODE_CONFIG,
    path.join(cwd, "opencode.json"),
    path.join(homeDir, ".config", "opencode", "opencode.json"),
  ].filter((value, index, values) => typeof value === "string" && value && values.indexOf(value) === index);
  configPaths.forEach((configPath) => {
    try { add(parseConfigProviderIds(fs.readFileSync(configPath, "utf8"))); } catch { /* optional config */ }
  });
  return providers;
}

export function applyModelSelection(state, { target, agents = [], modelRef } = {}) {
  validateModelReference(modelRef);
  const next = JSON.parse(JSON.stringify(state));
  if (target === "defaultModel" || target === "smallModel") {
    next[target] = modelRef;
    return next;
  }
  if (target !== "agents" || !Array.isArray(agents) || agents.length === 0) {
    throw new Error("model selection target is invalid");
  }
  for (const agent of agents) {
    if (!AGENT_IDS.includes(agent)) throw new Error("unknown agent");
    next.agents[agent] = modelRef;
  }
  return next;
}

function rowsForState(state) {
  return [
    { key: "defaultModel", label: "Default", modelRef: state.defaultModel, kind: "root" },
    { key: "smallModel", label: "Small/title", modelRef: state.smallModel, kind: "root" },
    ...AGENT_IDS.map((agent) => ({ key: agent, label: agent, modelRef: state.agents[agent], kind: "agent" })),
  ];
}

export function renderMainScreen({ state, focusedIndex = 0, selectedAgents = new Set(), status = "", catalogFresh = false } = {}) {
  const rows = rowsForState(state);
  const lines = ["OpenCode Model Switcher", ""];
  if (status) lines.push(`Status: ${status}`, "");
  lines.push("Model assignments");
  rows.forEach((row, index) => {
    const selected = row.kind === "agent" && selectedAgents.has(row.key) ? "[x] " : "    ";
    const focus = index === focusedIndex ? "> " : "  ";
    lines.push(`${focus}${selected}${row.label.padEnd(12)} ${row.modelRef}`);
  });
  lines.push("", selectedAgents.size ? `Selected agents: ${[...selectedAgents].join(", ")}` : "Selected agents: none");
  lines.push(`Catalog: ${catalogFresh ? "current" : "Loading models..."}`, "");
  lines.push(`${ANSI.dim}↑↓ move  Enter select  Space mark  / search  r refresh${ANSI.reset}`);
  lines.push(`${ANSI.dim}s save  Esc back/clear  q save and quit${ANSI.reset}`);
  return lines.join("\n");
}

function visibleWindow(models, focusedIndex, maxVisibleModels) {
  const limit = Math.max(1, Number.isInteger(maxVisibleModels) ? maxVisibleModels : 14);
  if (models.length <= limit) return { models, before: false, after: false };
  const safeIndex = Math.max(0, Math.min(focusedIndex, models.length - 1));
  const start = Math.min(Math.max(0, safeIndex - Math.floor(limit / 2)), models.length - limit);
  return { models: models.slice(start, start + limit), before: start > 0, after: start + limit < models.length };
}

export function renderModelPicker({ targetLabel = "model", models = [], query = "", focusedIndex = 0, maxVisibleModels = 14 } = {}) {
  const filtered = models.filter((modelRef) => modelRef.toLowerCase().includes(String(query).trim().toLowerCase()));
  const visible = visibleWindow(filtered, focusedIndex, maxVisibleModels);
  const lines = [`Select model for ${targetLabel}`, `Search: ${query || "_"}`, ""];
  if (visible.before) lines.push(`${ANSI.dim}↑ more models${ANSI.reset}`);
  visible.models.forEach((modelRef) => {
    const index = filtered.indexOf(modelRef);
    lines.push(`${index === focusedIndex ? `${ANSI.reverse}> ` : "  "}${modelRef}${index === focusedIndex ? ANSI.reset : ""}`);
  });
  if (visible.after) lines.push(`${ANSI.dim}↓ more models${ANSI.reset}`);
  if (!filtered.length) lines.push("No configured models match the search.");
  lines.push("", `${ANSI.dim}Enter select  Esc back  type to search  Backspace delete${ANSI.reset}`);
  return lines.join("\n");
}

function stateFromEnvironment(env, now) {
  const defaultModel = validateModelReference(env.OPENCODE_MODEL);
  const get = (key, fallback) => env[key] ? validateModelReference(env[key]) : fallback;
  return {
    schemaVersion: STATE_VERSION,
    updatedAt: now(),
    defaultModel,
    smallModel: get("OPENCODE_SMALL_MODEL", defaultModel),
    agents: Object.fromEntries(AGENT_IDS.map((agent) => [agent, get(agentEnvKey(agent), defaultModel)])),
  };
}

function statePath({ homeDir = os.homedir(), env = process.env } = {}) {
  const root = env.XDG_STATE_HOME || path.join(homeDir, ".local", "state");
  return path.join(root, ...STATE_PARTS);
}

function readState(filePath, env, now) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!parsed || parsed.schemaVersion !== STATE_VERSION || !parsed.defaultModel || !parsed.smallModel) throw new Error("invalid state");
    return parsed;
  } catch (cause) {
    if (cause?.code === "ENOENT") return stateFromEnvironment(env, now);
    throw new Error("Saved OpenCode model state is invalid.", { cause });
  }
}

function atomicWrite(filePath, contents) {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  try {
    fs.writeFileSync(temporaryPath, contents, { mode: 0o600 });
    fs.chmodSync(temporaryPath, 0o600);
    fs.renameSync(temporaryPath, filePath);
  } catch (cause) {
    try { fs.rmSync(temporaryPath, { force: true }); } catch { /* best effort */ }
    throw cause;
  }
}

function shellQuote(value) { return `'${String(value).replaceAll("'", "'\\''")}'`; }

function shellRcPath({ homeDir, shell }) {
  const name = path.basename(shell || "zsh");
  if (name === "zsh") return path.join(homeDir, ".zshrc");
  if (name === "bash") return path.join(homeDir, ".bashrc");
  throw new Error("oc-switch supports zsh and bash startup files");
}

function updateShellRc(contents, state) {
  const managed = [SHELL_START, `export OPENCODE_MODEL=${shellQuote(state.defaultModel)}`, `export OPENCODE_SMALL_MODEL=${shellQuote(state.smallModel)}`,
    ...AGENT_IDS.map((agent) => `export ${agentEnvKey(agent)}=${shellQuote(state.agents[agent])}`), SHELL_END].join("\n");
  const block = new RegExp(`${SHELL_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${SHELL_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\r?\\n?`, "g");
  return `${contents.replace(block, "").trimEnd()}\n\n${managed}\n`;
}

export function findOpenCodeBinaryOnPath({ env = process.env } = {}) {
  const candidates = [];
  if (typeof env.OPENCODE_BIN === "string" && path.isAbsolute(env.OPENCODE_BIN)) {
    candidates.push(env.OPENCODE_BIN);
  }
  for (const directory of String(env.PATH ?? "").split(path.delimiter)) {
    if (directory.length > 0) candidates.push(path.resolve(directory, "opencode"));
  }
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      }
    } catch { /* Fall back to the login-shell resolver. */ }
  }
  return undefined;
}

function resolveBinary({ signal } = {}) {
  if (signal?.aborted) return Promise.reject(new Error("OpenCode binary unavailable"));
  const directPath = findOpenCodeBinaryOnPath();
  if (directPath) return Promise.resolve(directPath);
  return new Promise((resolve, reject) => {
    const child = spawn("zsh", ["-lic", "whence -p opencode"], { shell: false, stdio: ["ignore", "pipe", "ignore"] });
    let stdout = "";
    let stopped = false;
    const abort = () => { stopped = true; child.kill("SIGTERM"); };
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.on("error", () => reject(new Error("OpenCode binary unavailable")));
    child.on("close", (code) => {
      signal?.removeEventListener("abort", abort);
      const candidate = stdout.split(/\r?\n/).map((line) => line.trim()).find((line) => path.isAbsolute(line));
      if (stopped || code !== 0 || !candidate) reject(new Error("OpenCode binary unavailable"));
      else resolve(candidate);
    });
  });
}

function runCommand(args, { signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(args[0], args.slice(1), { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    const abort = () => child.kill("SIGTERM");
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.on("error", () => reject(new Error("OpenCode command unavailable")));
    child.on("close", (code) => {
      signal?.removeEventListener("abort", abort);
      if (code !== 0) reject(new Error("OpenCode command unavailable"));
      else resolve(stdout);
    });
  });
}

function moveIndex(index, delta, length) { return length ? (index + delta + length) % length : 0; }
function frame(screen, first, previousLineCount) {
  if (first) return `${ANSI.hideCursor}${screen}`;
  return `${previousLineCount > 1 ? `\u001b[${previousLineCount - 1}A` : ""}\r${ANSI.eraseDown}${screen}`;
}

export function createOcSwitcher({ homeDir = os.homedir(), env = process.env, shell = env.SHELL, now = () => new Date().toISOString(), resolve = resolveBinary, command = runCommand } = {}) {
  const filePath = statePath({ homeDir, env });
  const read = () => readState(filePath, env, now);
  const save = (state) => {
    const normalized = { ...state, schemaVersion: STATE_VERSION, updatedAt: now() };
    atomicWrite(filePath, `${JSON.stringify(normalized, null, 2)}\n`);
    const rcPath = shellRcPath({ homeDir, shell });
    let contents = "";
    try { contents = fs.readFileSync(rcPath, "utf8"); } catch (cause) { if (cause?.code !== "ENOENT") throw cause; }
    atomicWrite(rcPath, updateShellRc(contents, normalized));
    return normalized;
  };
  const refresh = async ({ signal, forceRefresh = false } = {}) => {
    const binary = await resolve({ signal });
    const providers = configuredProviderIds({ homeDir, env });
    try {
      const auth = await command([binary, "auth", "list"], { signal });
      parseOpenCodeAuthProviders(auth).forEach((providerId) => { if (!providers.includes(providerId)) providers.push(providerId); });
    } catch { /* config/env discovery still applies */ }
    const modelArgs = [binary, "models", "--pure"];
    if (forceRefresh) modelArgs.push("--refresh");
    const grouped = parseOpenCodeModelList(await command(modelArgs, { signal }));
    return providers.flatMap((providerId) => grouped[providerId] ?? []);
  };
  return { getStatePath: () => filePath, loadState: read, saveState: save, refreshModels: refresh };
}

export async function runTerminalOcSwitcher({ input = process.stdin, output = process.stdout, initialState, initialModels = [], refreshModels, saveState, agentIds = AGENT_IDS } = {}) {
  let state = JSON.parse(JSON.stringify(initialState));
  let models = [...initialModels];
  let screen = "main";
  let focusedIndex = 0;
  let pickerFocusedIndex = 0;
  let pickerQuery = "";
  let selectedAgents = new Set();
  let status = "Loading models...";
  let catalogFresh = false;
  let dirty = false;
  let finished = false;
  let result;
  let previousLineCount = 0;
  let pickerTarget;
  const controller = new AbortController();
  const height = Number(output.rows ?? input.rows) || 24;
  const maxVisibleModels = Math.max(4, height - 14);
  const rows = () => rowsForState(state);
  const filtered = () => models.filter((modelRef) => modelRef.toLowerCase().includes(pickerQuery.toLowerCase()));
  const write = (chunk) => output.write(chunk);
  const render = (first = false) => {
    if (finished) return;
    const screenText = screen === "main"
      ? renderMainScreen({ state, focusedIndex, selectedAgents, status, catalogFresh })
      : renderModelPicker({ targetLabel: pickerTarget.label, models, query: pickerQuery, focusedIndex: pickerFocusedIndex, maxVisibleModels });
    write(frame(screenText, first, previousLineCount));
    previousLineCount = screenText.split("\n").length;
  };
  const finish = (nextResult) => { finished = true; result = nextResult; controller.abort(); };
  const persist = async () => { state = await saveState(state); dirty = false; status = "Guardado."; };
  const startRefresh = (first = false) => {
    catalogFresh = false;
    status = "Loading models...";
    render();
    Promise.resolve().then(() => refreshModels({
      signal: controller.signal,
      forceRefresh: !first,
    })).then((nextModels) => {
      if (finished) return;
      models = [...nextModels]; catalogFresh = true; status = "Catalog ready."; render();
    }).catch(() => { if (!finished) { status = "Unable to update catalog; saved values remain visible."; render(); } });
  };
  emitKeypressEvents(input);
  input.setRawMode?.(true);
  input.resume?.();
  const onKeypress = (sequence, key = {}) => {
    const name = key.ctrl && key.name === "c" ? "ctrl-c" : key.name === "return" ? "enter" : key.name ?? sequence;
    const searchKey = sequence === "/" || name === "/" || name === "slash";
    if (name === "ctrl-c") { finish({ status: "cancelled", state }); return; }
    if (screen === "main") {
      const currentRows = rows();
      if (name === "up") focusedIndex = moveIndex(focusedIndex, -1, currentRows.length);
      else if (name === "down") focusedIndex = moveIndex(focusedIndex, 1, currentRows.length);
      else if (name === "space" && currentRows[focusedIndex]?.kind === "agent") {
        const agent = currentRows[focusedIndex].key;
        if (selectedAgents.has(agent)) selectedAgents.delete(agent); else selectedAgents.add(agent);
      } else if (name === "enter" && currentRows[focusedIndex]) {
        pickerTarget = currentRows[focusedIndex];
        pickerFocusedIndex = Math.max(0, filtered().indexOf(pickerTarget.modelRef));
        pickerQuery = "";
        screen = "picker";
      } else if (searchKey) {
        pickerTarget = currentRows[focusedIndex];
        if (pickerTarget) {
          pickerFocusedIndex = Math.max(0, filtered().indexOf(pickerTarget.modelRef));
          pickerQuery = "";
          screen = "picker";
        }
      } else if (name === "r") startRefresh();
      else if (name === "s") persist().catch(() => { status = "Save failed."; });
      else if (name === "q") persist().then(() => finish({ status: "saved", state })).catch(() => finish({ status: "error", error: "Save failed." }));
      else if (name === "escape") selectedAgents.clear();
    } else {
      const available = filtered();
      if (name === "up") pickerFocusedIndex = moveIndex(pickerFocusedIndex, -1, available.length);
      else if (name === "down") pickerFocusedIndex = moveIndex(pickerFocusedIndex, 1, available.length);
      else if (name === "enter" && available[pickerFocusedIndex]) {
        const targetAgents = pickerTarget.kind === "agent"
          ? [...(selectedAgents.size ? selectedAgents : new Set([pickerTarget.key]))]
          : [];
        state = applyModelSelection(state, { target: pickerTarget.key, agents: targetAgents, modelRef: available[pickerFocusedIndex] });
        dirty = true; selectedAgents.clear(); screen = "main"; status = "Change pending save.";
      } else if (name === "escape") { screen = "main"; pickerQuery = ""; }
      else if (name === "backspace") { pickerQuery = pickerQuery.slice(0, -1); pickerFocusedIndex = 0; }
      else if (typeof sequence === "string" && sequence.length === 1 && sequence >= " " && sequence <= "~") { pickerQuery += sequence; pickerFocusedIndex = 0; }
    }
    render();
  };
  input.on("keypress", onKeypress);
  render(true);
  startRefresh(true);
  return new Promise((resolve) => {
    const poll = () => {
      if (finished) {
        input.off?.("keypress", onKeypress);
        input.setRawMode?.(false);
        input.pause?.();
        write(`\n${ANSI.showCursor}\n`);
        resolve(result);
      } else setImmediate(poll);
    };
    poll();
  });
}

export async function runInteractive(options = {}) {
  const switcher = createOcSwitcher(options);
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  if (input.isTTY !== true || output.isTTY !== true) return { status: "error", error: "oc-switch requires an interactive terminal." };
  try {
    return await runTerminalOcSwitcher({
      input, output,
      initialState: options.initialState ?? switcher.loadState(),
      initialModels: options.initialModels ?? [],
      refreshModels: options.refreshModels ?? switcher.refreshModels,
      saveState: options.saveState ?? switcher.saveState,
    });
  } catch {
    return { status: "error", error: "Unable to start oc-switch. Check OPENCODE_MODEL and the OpenCode configuration." };
  }
}

export function isDirectExecution({
  argvPath = process.argv[1],
  modulePath = fileURLToPath(import.meta.url),
} = {}) {
  if (!argvPath) return false;
  try {
    return fs.realpathSync(argvPath) === fs.realpathSync(modulePath);
  } catch {
    return path.resolve(argvPath) === path.resolve(modulePath);
  }
}

if (isDirectExecution()) {
  const result = await runInteractive();
  if (result.status === "error") { process.stderr.write(`${result.error}\n`); process.exitCode = 1; }
}
