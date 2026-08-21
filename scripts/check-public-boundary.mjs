#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BOUNDARY_DOC = "docs/sync-boundary.md";
const REQUIRED_FILES = [
  BOUNDARY_DOC,
  "opencode/commands/loop-status.md",
  "opencode/docs/ai/specs/mission-runtime.md",
  "opencode/plugins/mission-runtime.ts",
  "opencode/scripts/mission-runtime-observer.mjs",
  "opencode/scripts/mission-status.mjs",
  "opencode/scripts/runtime-permission-policy.mjs",
];

// Keep these markers identical to the existing check.sh scan. They are built
// from fragments so this scanner does not trip over its own rules.
const PRIVATE_MARKERS = [
  ["/", "Users", "/"].join(""),
  ["synology", ".", "me"].join(""),
  ["auth", ".", "json"].join(""),
  ["OPENAI", "_", "API", "_", "KEY"].join(""),
];

function walk(directory, root = directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if ([".git", "node_modules"].includes(entry.name)) continue;
    if ([".gitignore", "check.sh"].includes(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, root, files);
    else if (entry.isFile()) files.push(path.relative(root, full));
  }
  return files.sort();
}

function fail(message) {
  throw new Error(message);
}

export function scanPublicLeaks(root = ROOT) {
  const findings = [];
  for (const relative of walk(root)) {
    const full = path.join(root, relative);
    const text = fs.readFileSync(full, "utf8");
    for (const marker of PRIVATE_MARKERS) {
      if (text.includes(marker)) findings.push({ path: relative, marker: "private-marker" });
    }
  }
  return findings;
}

export function validatePublicBoundary(root = ROOT) {
  const resolvedRoot = path.resolve(root);
  for (const relative of REQUIRED_FILES) {
    const full = path.join(resolvedRoot, relative);
    if (!fs.existsSync(full) || !fs.lstatSync(full).isFile()) {
      fail(`${relative}: missing public boundary surface`);
    }
  }

  const boundary = fs.readFileSync(path.join(resolvedRoot, BOUNDARY_DOC), "utf8");
  for (const token of ["private", "public", "translate", "transform", "exclude", "credentials"]) {
    if (!boundary.includes(token)) fail(`${BOUNDARY_DOC}: missing boundary token ${token}`);
  }

  const findings = scanPublicLeaks(resolvedRoot);
  if (findings.length > 0) {
    fail(`${findings[0].path}: public boundary leak scan failed`);
  }

  if (fs.existsSync(path.join(resolvedRoot, "opencode/scripts/model-switcher.mjs"))) {
    fail("opencode/scripts/model-switcher.mjs: private provider surface is not public");
  }
  return { required_files: REQUIRED_FILES.length, scanned_files: walk(resolvedRoot).length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    validatePublicBoundary();
    process.stdout.write("Public boundary check passed.\n");
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "public boundary check failed"}\n`);
    process.exitCode = 1;
  }
}
