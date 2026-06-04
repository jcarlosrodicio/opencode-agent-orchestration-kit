#!/usr/bin/env node
/**
 * Project Capability Snapshot
 *
 * Detects stacks, domains, and work surfaces from repo structure.
 * Used by the lead agent's skill resolution prefilter.
 *
 * Usage:
 *   node scripts/project-capability-snapshot.mjs [--dir /path] [--output path]
 *
 * If --dir is omitted, uses current working directory.
 * If --output is omitted, prints JSON to stdout.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── Directories to always skip ──────────────────────────────────────────

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".nuxt",
  "dist",
  "build",
  ".cache",
  "__pycache__",
  ".venv",
  "coverage",
  ".turbo",
  ".vercel",
]);

// ── Stack detection rules ───────────────────────────────────────────────

const STACK_RULES = [
  { file: "package.json", id: "node", confidence: "high" },
  { file: "tsconfig.json", id: "typescript", confidence: "high" },
  { file: "next.config.mjs", id: "nextjs", confidence: "high" },
  { file: "next.config.js", id: "nextjs", confidence: "high" },
  { file: "next.config.ts", id: "nextjs", confidence: "high" },
  { file: "vite.config.mjs", id: "node", confidence: "medium" },
  { file: "vite.config.js", id: "node", confidence: "medium" },
  { file: "vite.config.ts", id: "typescript", confidence: "medium" },
  { file: "pubspec.yaml", id: "flutter", confidence: "high" },
  { file: "go.mod", id: "go", confidence: "high" },
  { file: "Cargo.toml", id: "rust", confidence: "high" },
  { file: "pyproject.toml", id: "python", confidence: "high" },
  { file: "requirements.txt", id: "python", confidence: "medium" },
  { file: "poetry.lock", id: "python", confidence: "high" },
  { file: "manage.py", id: "python", confidence: "medium" },
  { file: "Gemfile", id: "ruby", confidence: "high" },
  { file: "composer.json", id: "php", confidence: "high" },
  { file: "pom.xml", id: "java", confidence: "high" },
  { file: "Dockerfile", id: "infra", confidence: "medium" },
];

// ── Domain detection rules (directory/file patterns) ────────────────────

const DOMAIN_RULES = [
  {
    id: "orchestration",
    confidence: "high",
    globs: ["agents/*.md", "docs/ai/harness/**", "skills/**/SKILL.md"],
  },
  {
    id: "documentation",
    confidence: "high",
    globs: ["docs/**/*.md", "docs/decisions/**", "docs/adr/**", "ADR*.md"],
  },
  {
    id: "testing",
    confidence: "high",
    globs: ["**/*.test.*", "**/*.spec.*", "**/__tests__/**"],
  },
  {
    id: "specification",
    confidence: "high",
    globs: ["docs/ai/specs/**"],
  },
  {
    id: "security",
    confidence: "medium",
    globs: ["**/*security*", "**/*security*/**/*", "**/*auth*", "**/*auth*/**/*"],
  },
  {
    id: "api-design",
    confidence: "medium",
    globs: ["**/routes/**", "**/api/**", "**/endpoints/**", "**/controllers/**"],
  },
  {
    id: "ui-ux",
    confidence: "medium",
    globs: ["**/components/**", "**/pages/**", "**/views/**", "**/ui/**"],
  },
  {
    id: "evolution",
    confidence: "high",
    globs: ["docs/ai/evolution/**"],
  },
  {
    id: "debugging",
    confidence: "medium",
    globs: ["**/*debug*", "**/*debug*/**/*", "**/diagnostics/**"],
  },
  {
    id: "release",
    confidence: "medium",
    globs: [".github/workflows/**", "**/releases/**", "**/changelog*"],
  },
];

// ── Surface detection rules ─────────────────────────────────────────────

const SURFACE_RULES = [
  {
    id: "harness",
    confidence: "high",
    globs: ["AGENTS.md", "docs/ai/harness/**", "scripts/check-harness*"],
  },
  {
    id: "skills-catalog",
    confidence: "high",
    globs: ["skills/**/SKILL.md", "scripts/update-skill-registry*"],
  },
  {
    id: "automation",
    confidence: "medium",
    globs: ["scripts/**"],
  },
  {
    id: "monorepo",
    confidence: "medium",
    globs: ["apps/**", "packages/**"],
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Recursively walk a directory, respecting skip rules and depth limit.
 * Returns relative paths of all files found.
 */
function walkDir(root, relDir, maxDepth = 6, currentDepth = 0) {
  if (currentDepth > maxDepth) return [];

  const absDir = path.join(root, relDir);
  let entries;
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const childRel = relDir ? `${relDir}/${entry.name}` : entry.name;
      files.push(...walkDir(root, childRel, maxDepth, currentDepth + 1));
    } else {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      files.push(rel);
    }
  }
  return files;
}

/**
 * Simple glob-to-regex converter for the limited patterns we use.
 * Supports: **, *, ?, and literal paths.
 */
function globToRegex(glob) {
  let re = "";
  let i = 0;

  while (i < glob.length) {
    if (glob[i] === "*" && glob[i + 1] === "*") {
      // ** matches any number of path segments
      if (glob[i + 2] === "/") {
        // **/ matches zero or more segments followed by /
        re += "(?:[^/]+/)*";
        i += 3;
      } else if (i + 2 >= glob.length) {
        // ** at end matches everything
        re += ".*";
        i += 2;
      } else {
        // ** between chars (rare) — match anything
        re += ".*";
        i += 2;
      }
    } else if (glob[i] === "*") {
      // * matches within a single segment
      re += "[^/]*";
      i += 1;
    } else if (glob[i] === "?") {
      re += "[^/]";
      i += 1;
    } else if (glob[i] === ".") {
      re += "\\.";
      i += 1;
    } else if ("+^${}()|[\\".includes(glob[i])) {
      re += "\\" + glob[i];
      i += 1;
    } else {
      re += glob[i];
      i += 1;
    }
  }

  return new RegExp("^" + re + "$");
}

/**
 * Check if any file in the repo matches any of the given glob patterns.
 * Returns matched file paths (relative to repo root).
 */
function matchGlobs(files, globs) {
  const matched = [];
  const regexes = globs.map((g) => ({ glob: g, re: globToRegex(g) }));

  for (const file of files) {
    for (const { glob, re } of regexes) {
      if (re.test(file)) {
        matched.push(file);
        break;
      }
    }
  }
  return matched;
}

// ── Detection functions ─────────────────────────────────────────────────

export function detectStacks(repoRoot) {
  const files = walkDir(repoRoot, "");
  const detected = [];
  const seen = new Map();

  for (const rule of STACK_RULES) {
    const matches = matchGlobs(files, [rule.file]);
    if (matches.length > 0) {
      const existing = seen.get(rule.id);
      if (!existing) {
        const entry = {
          id: rule.id,
          confidence: rule.confidence,
          evidence: matches,
        };
        detected.push(entry);
        seen.set(rule.id, entry);
      } else {
        // Merge evidence and keep highest confidence
        existing.evidence.push(...matches);
        existing.evidence = [...new Set(existing.evidence)];
        if (rule.confidence === "high" && existing.confidence !== "high") {
          existing.confidence = "high";
        }
      }
    }
  }

  return detected;
}

export function detectDomains(repoRoot) {
  const files = walkDir(repoRoot, "");
  const byDomain = new Map();

  for (const rule of DOMAIN_RULES) {
    const matches = matchGlobs(files, rule.globs);
    if (matches.length > 0) {
      const existing = byDomain.get(rule.id);
      if (!existing) {
        byDomain.set(rule.id, {
          id: rule.id,
          confidence: rule.confidence,
          evidence: matches,
        });
      } else {
        // Merge evidence and keep highest confidence
        existing.evidence.push(...matches);
        // Deduplicate evidence
        existing.evidence = [...new Set(existing.evidence)];
        // Upgrade confidence if needed
        if (rule.confidence === "high" && existing.confidence !== "high") {
          existing.confidence = "high";
        }
      }
    }
  }

  return [...byDomain.values()];
}

export function detectSurfaces(repoRoot) {
  const files = walkDir(repoRoot, "");
  const bySurface = new Map();

  for (const rule of SURFACE_RULES) {
    const matches = matchGlobs(files, rule.globs);
    if (matches.length > 0) {
      const existing = bySurface.get(rule.id);
      if (!existing) {
        bySurface.set(rule.id, {
          id: rule.id,
          confidence: rule.confidence,
          evidence: matches,
        });
      } else {
        existing.evidence.push(...matches);
        existing.evidence = [...new Set(existing.evidence)];
        if (rule.confidence === "high" && existing.confidence !== "high") {
          existing.confidence = "high";
        }
      }
    }
  }

  return [...bySurface.values()];
}

export function generateSnapshot(repoRoot) {
  const absRoot = path.resolve(repoRoot);

  const stacks = detectStacks(absRoot);
  const domains = detectDomains(absRoot);
  const surfaces = detectSurfaces(absRoot);

  // Determine unknowns: if all arrays are empty, note it
  const unknowns = [];
  if (stacks.length === 0) unknowns.push("no_stacks_detected");
  if (domains.length === 0) unknowns.push("no_domains_detected");
  if (surfaces.length === 0) unknowns.push("no_surfaces_detected");

  return {
    schema_version: 1,
    repo_root: absRoot,
    stacks_detected: stacks,
    domains_detected: domains,
    surfaces_detected: surfaces,
    unknowns,
    generated_by: "lead prefilter",
    generated_at: new Date().toISOString(),
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  let dir = process.cwd();
  let output = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dir" && args[i + 1]) {
      dir = path.resolve(args[++i]);
    } else if (args[i] === "--output" && args[i + 1]) {
      output = args[++i];
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log(
        "Usage: node project-capability-snapshot.mjs [--dir /path] [--output path]\n\n" +
          "Options:\n" +
          "  --dir <path>     Repository root to analyze (default: cwd)\n" +
          "  --output <path>  Write JSON to file instead of stdout\n" +
          "  -h, --help       Show this help",
      );
      process.exit(0);
    }
  }

  return { dir, output };
}

function main() {
  const { dir, output } = parseArgs(process.argv);

  if (!fs.existsSync(dir)) {
    console.error(`Error: directory does not exist: ${dir}`);
    process.exit(1);
  }

  const snapshot = generateSnapshot(dir);
  const json = JSON.stringify(snapshot, null, 2);

  if (output) {
    const outDir = path.dirname(output);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    fs.writeFileSync(output, json + "\n");
  } else {
    console.log(json);
  }
}

// Run CLI when invoked directly (not imported as module)
const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  main();
}
