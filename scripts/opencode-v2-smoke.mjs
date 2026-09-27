#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CANONICAL = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const ACTIVATION_TIMEOUT_MS = 120_000;
export const EXPECTED_LOCAL_PLUGINS = Object.freeze([
  "oak.mission-runtime",
  "oak.open-design",
  "oak.shell-export-guard",
  "oak.tui",
]);

export function parseSmokeArgs(argv) {
  const [mode, request] = argv;
  const valid = argv.length === 2
    && ["core", "default"].includes(mode)
    && (request === "latest" || CANONICAL.test(request ?? ""))
    && !(mode === "default" && request === "latest");
  if (!valid) throw new Error("usage: opencode-v2-smoke.mjs core MAJOR.MINOR.PATCH|latest | default MAJOR.MINOR.PATCH");
  return { mode, request };
}

// OpenCode 2 prints `opencode v2.0.18`.
export function parseVersion(output) {
  const version = String(output).trim().split(/\s+/).at(-1)?.replace(/^v/, "") ?? "";
  return CANONICAL.test(version) ? version : null;
}

function readList(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  throw new Error("plugin.list returned an unexpected shape");
}

// A local plugin that fails to import is listed without an id, so failures
// are named by file, never by path or error text.
function localFailures(list) {
  return list
    .filter((plugin) => plugin?.source?.type === "local" && plugin.state?.status !== "active")
    .map((plugin) => plugin.id ?? path.basename(String(plugin.source.path ?? "unknown")));
}

function settled(list) {
  const ids = new Set(list.map((plugin) => plugin?.id));
  return EXPECTED_LOCAL_PLUGINS.every((id) => ids.has(id)) || localFailures(list).length > 0;
}

export function assertPluginsActive(body) {
  const list = readList(body);
  const byId = new Map(list.map((plugin) => [plugin?.id, plugin]));
  const problems = localFailures(list).map((name) => `${name} failed`);
  for (const id of EXPECTED_LOCAL_PLUGINS) {
    if (!byId.has(id)) problems.push(`${id} missing`);
  }
  if (problems.length > 0) throw new Error(`OpenCode 2 plugins: ${[...new Set(problems)].join(", ")}`);
  return EXPECTED_LOCAL_PLUGINS.filter((id) => byId.get(id)?.state?.status === "active");
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  const signal = (name) => {
    try {
      process.kill(-child.pid, name);
    } catch {
      // The process group is already gone.
    }
  };
  signal("SIGTERM");
  const timer = setTimeout(() => signal("SIGKILL"), 10_000);
  await exited;
  clearTimeout(timer);
}

async function main() {
  const { mode, request } = parseSmokeArgs(process.argv.slice(2));
  const smokeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "oak-opencode-v2."));
  const privatePaths = [smokeRoot, fs.realpathSync(smokeRoot), ROOT, os.homedir()].filter(Boolean);
  const safe = (text) => privatePaths.reduce((value, hidden) => value.split(hidden).join("<redacted>"), String(text));
  let server;
  try {
    const config = path.join(smokeRoot, "config", "opencode");
    fs.cpSync(path.join(ROOT, "opencode"), config, {
      recursive: true,
      filter: (source) => !source.split(path.sep).some((part) => part === "node_modules" || part === ".oak"),
    });
    const configPath = path.join(config, "opencode.json");
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (mode === "core") {
      parsed.plugin = [];
      fs.writeFileSync(configPath, `${JSON.stringify(parsed, null, 2)}\n`);
    } else if (Object.hasOwn(parsed, "plugin")) {
      throw new Error("the default config must not declare external plugins");
    }
    for (const dir of ["home", "data", "cache", "state", "npm"]) fs.mkdirSync(path.join(smokeRoot, dir), { recursive: true });
    const env = {
      PATH: process.env.PATH,
      HOME: path.join(smokeRoot, "home"),
      XDG_CONFIG_HOME: path.join(smokeRoot, "config"),
      XDG_DATA_HOME: path.join(smokeRoot, "data"),
      XDG_CACHE_HOME: path.join(smokeRoot, "cache"),
      XDG_STATE_HOME: path.join(smokeRoot, "state"),
      npm_config_cache: path.join(smokeRoot, "npm"),
      OPENCODE_CONFIG_DIR: config,
      OPENCODE_PASSWORD: crypto.randomBytes(18).toString("hex"),
    };
    const opencodeArgs = (...args) => ["--yes", "--package", `@opencode/cli@${request}`, "opencode", ...args];
    const run = (command, args) => {
      const result = spawnSync(command, args, {
        cwd: env.HOME,
        env,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 600_000,
        maxBuffer: 64 * 1024 * 1024,
      });
      if (result.status !== 0) throw new Error(`${command} ${args[0] ?? ""} failed: ${safe(result.stderr).slice(-2000)}`);
      return result.stdout;
    };

    run("npm", ["--prefix", config, "ci", "--ignore-scripts"]);
    const version = parseVersion(run("npx", opencodeArgs("--version")));
    if (!version || !version.startsWith("2.") || (request !== "latest" && version !== request)) {
      throw new Error(`resolved OpenCode ${safe(version)} does not match ${request}`);
    }

    // `api --standalone` answers before plugins activate, so query a private server until they settle.
    const port = await freePort();
    server = spawn("npx", opencodeArgs("serve", "--hostname", "127.0.0.1", "--port", String(port)), {
      cwd: env.HOME,
      env,
      stdio: "ignore",
      detached: true,
    });
    const api = (...args) => JSON.parse(run("npx", opencodeArgs("api", "--server", `http://127.0.0.1:${port}`, ...args)));
    const deadline = Date.now() + ACTIVATION_TIMEOUT_MS;
    let plugins = null;
    while (Date.now() < deadline) {
      try {
        plugins = api("plugin.list");
        if (settled(readList(plugins))) break;
      } catch {
        // The server is still starting.
      }
      await sleep(1_000);
    }
    if (!plugins) throw new Error("OpenCode 2 server did not answer plugin.list");
    const ids = assertPluginsActive(plugins);
    const lead = api("agent.get", "--param", "agentID=lead");
    const agent = lead?.data ?? lead;
    if (agent?.id !== "lead" || agent?.mode !== "primary") throw new Error("lead did not resolve as a primary agent");
    console.log(`opencode v2 smoke ok: mode=${mode} requested=${request} resolved=${version} plugins=${ids.length}`);
  } finally {
    if (server) await stop(server);
    fs.rmSync(smokeRoot, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "opencode v2 smoke failed");
    process.exit(1);
  });
}
