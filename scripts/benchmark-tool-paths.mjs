#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { createInstallationManager } from "./manage-installation.mjs";
import { generateSnapshot } from "../opencode/scripts/project-capability-snapshot.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.dirname(path.dirname(SCRIPT_PATH));
const DEFAULT_ITERATIONS = 5;
const SKIP_DIRS = new Set([".git", "node_modules", ".cache", "dist", "build"]);
const SEARCH_PATTERN = /agent|orchestrat|mission|runtime/giu;

function invalid(message) {
  const error = new Error(message);
  error.code = "INVALID_BENCHMARK";
  return error;
}

function walkFiles(root) {
  const files = [];
  function walk(directory, relative = "") {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full, child);
      else if (entry.isFile()) files.push({ relative: child, full });
    }
  }
  walk(root);
  return files;
}

function searchFiles(files) {
  let matches = 0;
  for (const file of files) {
    const stat = fs.statSync(file.full);
    if (stat.size > 512 * 1024) continue;
    const text = fs.readFileSync(file.full, "utf8");
    matches += text.match(SEARCH_PATTERN)?.length ?? 0;
  }
  return matches;
}

function parseFixture(root) {
  const result = spawnSync(process.execPath, ["--check", root], { encoding: "utf8" });
  if (result.status !== 0) throw invalid("Node parser benchmark command failed");
  return result.status;
}

function createFixture(parent, name, fileCount) {
  const root = path.join(parent, name);
  const sourceRoot = path.join(root, "opencode");
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(sourceRoot, "agents"), { recursive: true });
  fs.mkdirSync(path.join(sourceRoot, "docs", "ai", "harness"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), '{"name":"benchmark-fixture","version":"1.0.0"}\n');
  fs.writeFileSync(path.join(root, "scripts", "fixture.mjs"), "export const fixture = 'orchestration runtime agent mission';\n");
  for (let index = 0; index < fileCount; index += 1) {
    const directory = index % 2 === 0 ? path.join(sourceRoot, "agents") : path.join(sourceRoot, "docs", "ai", "harness");
    fs.writeFileSync(path.join(directory, `fixture-${String(index).padStart(4, "0")}.md`), `agent ${index} orchestration runtime\n`);
  }
  return {
    id: name,
    root,
    sourceRoot,
    astFile: path.join(root, "scripts", "fixture.mjs"),
    type: "synthetic",
    files: fileCount + 3,
  };
}

function safeRemove(parent, root) {
  const relative = path.relative(parent, root);
  if (!relative.startsWith("oak-benchmark-") || relative.includes(path.sep) || path.isAbsolute(relative)) {
    throw invalid("refusing unsafe benchmark cleanup");
  }
  fs.rmSync(root, { recursive: true, force: true });
}

function readResourceUsage() {
  const usage = process.resourceUsage();
  return {
    user_cpu_ms: usage.userCPUTime / 1000,
    system_cpu_ms: usage.systemCPUTime / 1000,
    max_rss_kb: usage.maxRSS,
  };
}

export function percentile(values, fraction) {
  if (!Array.isArray(values) || values.length === 0 || fraction < 0 || fraction > 1) {
    throw invalid("percentile requires non-empty values and a fraction from 0 through 1");
  }
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function summarizeMeasurements(measurements) {
  if (!Array.isArray(measurements) || measurements.length === 0) throw invalid("measurements must be non-empty");
  return {
    samples: measurements.length,
    elapsed_ms_p50: percentile(measurements.map((sample) => sample.elapsed_ms), 0.5),
    elapsed_ms_p95: percentile(measurements.map((sample) => sample.elapsed_ms), 0.95),
    user_cpu_ms_p50: percentile(measurements.map((sample) => sample.user_cpu_ms), 0.5),
    system_cpu_ms_p50: percentile(measurements.map((sample) => sample.system_cpu_ms), 0.5),
    max_rss_kb_p95: percentile(measurements.map((sample) => sample.max_rss_kb), 0.95),
  };
}

async function measure(operation) {
  const before = readResourceUsage();
  const started = performance.now();
  await operation();
  const after = readResourceUsage();
  return {
    elapsed_ms: performance.now() - started,
    user_cpu_ms: Math.max(0, after.user_cpu_ms - before.user_cpu_ms),
    system_cpu_ms: Math.max(0, after.system_cpu_ms - before.system_cpu_ms),
    max_rss_kb: after.max_rss_kb,
  };
}

async function benchmarkFixture(fixture, iterations, temporaryRoot) {
  const files = walkFiles(fixture.root);
  const operations = [
    ["list", () => walkFiles(fixture.root)],
    ["search", () => searchFiles(files)],
    ["ast", () => parseFixture(fixture.astFile)],
    ["background-snapshot", () => generateSnapshot(fixture.root)],
    ["install", async () => {
      const targetRoot = fs.mkdtempSync(path.join(temporaryRoot, "oak-benchmark-target-"));
      try {
        const result = await createInstallationManager({
          sourceRoot: fixture.sourceRoot,
          repositoryRoot: fixture.root,
          versionProvider: () => "1.0.41",
        }).run("install", { targetRoot });
        if (result.exitCode !== 0) throw invalid(`installation benchmark failed for ${fixture.id}`);
      } finally {
        safeRemove(temporaryRoot, targetRoot);
      }
    }],
  ];
  const benchmarks = [];
  for (const [id, operation] of operations) {
    await operation();
    const samples = [];
    for (let index = 0; index < iterations; index += 1) samples.push(await measure(operation));
    benchmarks.push({ id, summary: summarizeMeasurements(samples) });
  }
  return { id: fixture.id, type: fixture.type, files: files.length, benchmarks };
}

export async function runBenchmark(options = {}) {
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  if (!Number.isInteger(iterations) || iterations < 2 || iterations > 20) throw invalid("iterations must be an integer from 2 through 20");
  const repositoryRoot = options.repositoryRoot ?? REPOSITORY_ROOT;
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "oak-benchmark-"));
  try {
    const fixtures = [
      createFixture(temporaryRoot, "small", 24),
      createFixture(temporaryRoot, "medium", 160),
    ];
    if (options.includeRepository !== false) {
      fixtures.push({
        id: "repository",
        root: repositoryRoot,
        sourceRoot: path.join(repositoryRoot, "opencode"),
        astFile: path.join(repositoryRoot, "scripts", "manage-installation.mjs"),
        type: "repository",
      });
    }
    const results = [];
    for (const fixture of fixtures) results.push(await benchmarkFixture(fixture, iterations, temporaryRoot));
    return {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      node: process.version,
      platform: `${process.platform}/${process.arch}`,
      iterations,
      measurement_scope: "Node runner process; child command RSS is not isolated",
      fixtures: results,
    };
  } finally {
    safeRemove(os.tmpdir(), temporaryRoot);
  }
}

function parseArgs(argv) {
  const options = { iterations: DEFAULT_ITERATIONS, includeRepository: true };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--iterations") {
      const value = Number(argv[++index]);
      if (!Number.isInteger(value)) throw invalid("--iterations requires an integer");
      options.iterations = value;
    } else if (argv[index] === "--no-repository") {
      options.includeRepository = false;
    } else if (argv[index] === "--help") {
      process.stdout.write("Usage: node scripts/benchmark-tool-paths.mjs [--iterations N] [--no-repository]\n");
      return null;
    } else {
      throw invalid(`unknown argument: ${argv[index]}`);
    }
  }
  return options;
}

if (path.resolve(process.argv[1] ?? "") === SCRIPT_PATH) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options) process.stdout.write(`${JSON.stringify(await runBenchmark(options), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
