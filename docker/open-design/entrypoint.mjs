#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_PORT = "7456";
const DAEMON_ENTRYPOINT = "apps/daemon/dist/cli.js";

export function parsePort(rawPort) {
  if (typeof rawPort !== "string" || !/^[0-9]+$/.test(rawPort)) {
    throw new Error("OD_PORT must be a decimal TCP port between 1 and 65535");
  }

  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error("OD_PORT must be a decimal TCP port between 1 and 65535");
  }

  return port;
}

export function daemonArguments(port) {
  return [DAEMON_ENTRYPOINT, "--port", String(port), "--no-open"];
}

function main() {
  let port;
  try {
    port = parsePort(process.env.OD_PORT ?? DEFAULT_PORT);
  } catch (error) {
    console.error(`Open Design startup failed: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const daemon = spawn(process.execPath, daemonArguments(port), { stdio: "inherit" });
  const forwardSignal = (signal) => daemon.kill(signal);
  const cleanup = () => {
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
  };
  const onSigint = () => forwardSignal("SIGINT");
  const onSigterm = () => forwardSignal("SIGTERM");

  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);
  daemon.once("error", (error) => {
    cleanup();
    console.error(`Open Design daemon failed to start: ${error.message}`);
    process.exitCode = 1;
  });
  daemon.once("exit", (code, signal) => {
    cleanup();
    process.exitCode = signal ? 1 : (code ?? 1);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
