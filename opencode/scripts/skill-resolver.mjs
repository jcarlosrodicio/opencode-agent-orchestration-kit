#!/usr/bin/env node
/**
 * Skill Resolver — Two-stage deterministic prefilter + ranking
 *
 * Given a target agent, task phase, task domains, registry and project
 * capability snapshot, produces a ranked shortlist of 3-8 skills with
 * explanations.
 *
 * Usage:
 *   node scripts/skill-resolver.mjs --agent developer --phase build --domains testing,security
 *
 * Options:
 *   --agent <name>       Target agent (required)
 *   --phase <phase>      Task phase (default: unknown)
 *   --domains <list>     Comma-separated domain hints (optional)
 *   --registry <path>    Path to skill_registry.json (default: docs/ai/harness/skill_registry.json)
 *   --snapshot <path>    Path to snapshot JSON (auto-detected if omitted)
 *   -h, --help           Show this help
 *
 * Can be imported as a module:
 *   import { generateShortlist, formatShortlist } from './skill-resolver.mjs';
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── Constants ────────────────────────────────────────────────────────────

const MAX_CANDIDATES = 8;
const SUGGESTED_FINAL_SELECTION = 3;

const PASS_PHASES = new Set(["meta", "operate"]);

// ── Data loading ─────────────────────────────────────────────────────────

/**
 * Load the skill registry from a JSON file.
 * @param {string} registryPath
 * @returns {{ skills: Array }}
 */
export function loadRegistry(registryPath) {
  const raw = fs.readFileSync(registryPath, "utf-8");
  return JSON.parse(raw);
}

/**
 * Load the project capability snapshot from a JSON file.
 * @param {string} snapshotPath
 * @returns {object|null}
 */
export function loadSnapshot(snapshotPath) {
  if (!snapshotPath || !fs.existsSync(snapshotPath)) return null;
  const raw = fs.readFileSync(snapshotPath, "utf-8");
  return JSON.parse(raw);
}

/**
 * Auto-detect snapshot path by checking common locations.
 * @param {string} repoRoot
 * @returns {string|null}
 */
function detectSnapshotPath(repoRoot) {
  const candidates = [
    path.join(repoRoot, "docs/ai/harness/project_capability_snapshot.json"),
    path.join(repoRoot, "project_capability_snapshot.json"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// ── Filtering functions ──────────────────────────────────────────────────

/**
 * Filter skills by allowed_agents.
 * If skill.allowed_agents is empty/missing → include (fallback to all agents).
 * @param {Array} skills
 * @param {string} targetAgent
 * @returns {{ passed: Array, filteredCount: number }}
 */
export function filterByAgent(skills, targetAgent) {
  const passed = [];
  let filteredCount = 0;

  for (const skill of skills) {
    // Skip deprecated
    if (skill.status === "deprecated") {
      filteredCount++;
      continue;
    }

    const agents = skill.allowed_agents;
    if (!agents) {
      // Missing allowed_agents → fallback: include for all agents
      passed.push(skill);
    } else if (agents.length === 0) {
      // Empty array → no agents allowed → exclude
      filteredCount++;
    } else if (agents.includes(targetAgent)) {
      passed.push(skill);
    } else {
      filteredCount++;
    }
  }

  return { passed, filteredCount };
}

/**
 * Filter skills by phase.
 * Phase match: skill.phase === taskPhase OR skill.phase is meta/operate.
 * If taskPhase is "unknown" → no filtering.
 * If skill.phase is missing/unknown → don't exclude.
 * @param {Array} skills
 * @param {string} taskPhase
 * @returns {{ passed: Array, filteredCount: number }}
 */
export function filterByPhase(skills, taskPhase) {
  if (taskPhase === "unknown") {
    return { passed: [...skills], filteredCount: 0 };
  }

  const passed = [];
  let filteredCount = 0;

  for (const skill of skills) {
    const skillPhase = skill.phase;

    // No phase info → don't exclude
    if (!skillPhase || skillPhase === "unknown") {
      passed.push(skill);
      continue;
    }

    // Exact match or meta/operate pass-through
    if (skillPhase === taskPhase || PASS_PHASES.has(skillPhase)) {
      passed.push(skill);
    } else {
      filteredCount++;
    }
  }

  return { passed, filteredCount };
}

/**
 * Filter skills by domains.
 * Match if any of:
 *   - skill.domains ∩ taskDomains
 *   - skill.domains ∩ snapshotDomains
 *   - keyword match in skill.description vs taskDomains
 * If no domains info available → don't filter.
 * @param {Array} skills
 * @param {string[]} taskDomains
 * @param {string[]} snapshotDomains
 * @returns {{ passed: Array, filteredCount: number }}
 */
export function filterByDomains(skills, taskDomains, snapshotDomains) {
  const allTaskDomains = [
    ...new Set([...(taskDomains || []), ...(snapshotDomains || [])]),
  ];

  // If no domain signals at all, don't filter
  if (allTaskDomains.length === 0) {
    return { passed: [...skills], filteredCount: 0 };
  }

  const passed = [];
  let filteredCount = 0;

  for (const skill of skills) {
    const skillDomains = skill.domains || [];

    // No domain info on skill → fallback to description keyword match
    if (skillDomains.length === 0) {
      const desc = (skill.description || "").toLowerCase();
      const matched = allTaskDomains.some(
        (d) => desc.includes(d.toLowerCase()) || desc.includes(d.replace(/-/g, " ")),
      );
      if (matched) {
        passed.push(skill);
      } else {
        filteredCount++;
      }
      continue;
    }

    // Check intersection
    const hasMatch = skillDomains.some((sd) => allTaskDomains.includes(sd));
    if (hasMatch) {
      passed.push(skill);
    } else {
      filteredCount++;
    }
  }

  return { passed, filteredCount };
}

/**
 * Filter skills by stacks.
 * Match if skill.stacks contains "any" OR intersects with snapshotStacks.
 * If no stack info → don't filter.
 * @param {Array} skills
 * @param {string[]} snapshotStacks
 * @returns {{ passed: Array, filteredCount: number }}
 */
export function filterByStacks(skills, snapshotStacks) {
  const stacks = snapshotStacks || [];

  // If no snapshot stacks, don't filter
  if (stacks.length === 0) {
    return { passed: [...skills], filteredCount: 0 };
  }

  const passed = [];
  let filteredCount = 0;

  for (const skill of skills) {
    const skillStacks = skill.stacks || [];

    // No stack info → don't exclude
    if (skillStacks.length === 0) {
      passed.push(skill);
      continue;
    }

    // "any" matches everything
    if (skillStacks.includes("any")) {
      passed.push(skill);
      continue;
    }

    // Check intersection
    const hasMatch = skillStacks.some((ss) => stacks.includes(ss));
    if (hasMatch) {
      passed.push(skill);
    } else {
      filteredCount++;
    }
  }

  return { passed, filteredCount };
}

// ── Ranking ──────────────────────────────────────────────────────────────

/**
 * Rank candidates with explainable scoring.
 *
 * Score breakdown:
 *   +3  phase match exact
 *   +2  per domain match (max +6)
 *   +1  stacks match
 *   +1  status === "active"
 *   -1  status === "experimental"
 *
 * @param {Array} candidates - skills that passed all filters
 * @param {string} targetAgent
 * @param {string} taskPhase
 * @param {string[]} taskDomains
 * @param {string[]} snapshotDomains
 * @param {string[]} snapshotStacks
 * @returns {Array} candidates with score, reasons, confidence
 */
export function rankCandidates(
  candidates,
  targetAgent,
  taskPhase,
  taskDomains,
  snapshotDomains,
  snapshotStacks,
) {
  const allDomains = [...new Set([...(taskDomains || []), ...(snapshotDomains || [])])];

  const ranked = candidates.map((skill) => {
    let score = 0;
    const reasons = [];

    // Agent match (always true at this point, but record it)
    reasons.push(`matches target_agent=${targetAgent}`);

    // Phase match
    const skillPhase = skill.phase;
    if (skillPhase === taskPhase) {
      score += 3;
      reasons.push(`matches phase=${taskPhase}`);
    } else if (PASS_PHASES.has(skillPhase)) {
      reasons.push(`phase pass-through: ${skillPhase}`);
    }

    // Domain matches
    const skillDomains = skill.domains || [];
    const matchedDomains = skillDomains.filter((sd) => allDomains.includes(sd));
    if (matchedDomains.length > 0) {
      const domainScore = Math.min(matchedDomains.length * 2, 6);
      score += domainScore;
      reasons.push(`matches domains=${matchedDomains.join(", ")}`);
    }

    // Stack match
    const skillStacks = skill.stacks || [];
    const snapshotStackIds = (snapshotStacks || []).map((s) =>
      typeof s === "string" ? s : s.id,
    );
    if (skillStacks.includes("any") || skillStacks.some((ss) => snapshotStackIds.includes(ss))) {
      score += 1;
      const matchedStack = skillStacks.includes("any")
        ? "any"
        : skillStacks.find((ss) => snapshotStackIds.includes(ss));
      reasons.push(`stack compatible: ${matchedStack}`);
    }

    // Status bonus
    if (skill.status === "active") {
      score += 1;
      reasons.push("status: active");
    } else if (skill.status === "experimental") {
      score -= 1;
      reasons.push("status: experimental");
    }

    // Confidence derived from score
    let confidence;
    if (score >= 6) {
      confidence = "high";
    } else if (score >= 3) {
      confidence = "medium";
    } else {
      confidence = "low";
    }

    return {
      name: skill.name,
      load_path: skill.load_path,
      score,
      reasons,
      confidence,
    };
  });

  // Sort by score desc, then alphabetically
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name);
  });

  return ranked;
}

// ── Shortlist generation ─────────────────────────────────────────────────

/**
 * Generate the full shortlist output.
 * @param {object} input
 * @param {string} input.targetAgent
 * @param {string} input.taskPhase
 * @param {string[]} input.taskDomains
 * @param {object} input.registry - { skills: [...] }
 * @param {object|null} input.snapshot - project capability snapshot
 * @returns {object} shortlist output
 */
export function generateShortlist({
  targetAgent,
  taskPhase = "unknown",
  taskDomains = [],
  registry,
  snapshot = null,
}) {
  const skills = registry.skills || [];

  // Extract snapshot data
  const snapshotStacks = snapshot
    ? (snapshot.stacks_detected || []).map((s) => s.id)
    : [];
  const snapshotDomains = snapshot
    ? (snapshot.domains_detected || []).map((s) => s.id)
    : [];

  // Stage A: Prefilter (in order)
  const agentResult = filterByAgent(skills, targetAgent);
  const phaseResult = filterByPhase(agentResult.passed, taskPhase);
  const domainResult = filterByDomains(phaseResult.passed, taskDomains, snapshotDomains);
  const stackResult = filterByStacks(domainResult.passed, snapshotStacks);

  // Stage B: Rank
  const ranked = rankCandidates(
    stackResult.passed,
    targetAgent,
    taskPhase,
    taskDomains,
    snapshotDomains,
    snapshotStacks,
  );

  // Apply max candidates limit
  const candidates = ranked.slice(0, MAX_CANDIDATES);

  // Build omitted summary
  const totalFiltered =
    agentResult.filteredCount +
    phaseResult.filteredCount +
    domainResult.filteredCount +
    stackResult.filteredCount;

  // Build recommendation guidance
  let guidance;
  if (candidates.length === 0) {
    guidance =
      "No strong matches found. Review task description and consider manual skill selection or fallback to <available_skills>.";
  } else if (candidates.length <= 3) {
    guidance = `Select all ${candidates.length} candidate(s) or fewer based on task priority.`;
  } else {
    guidance = `Select top ${SUGGESTED_FINAL_SELECTION} from ${candidates.length} candidates. Prioritize high-confidence matches.`;
  }

  return {
    target_agent: targetAgent,
    task_phase: taskPhase,
    snapshot_ref: snapshot
      ? snapshot.repo_root
        ? `${snapshot.repo_root}/project_capability_snapshot.json`
        : "auto-detected"
      : "none",
    candidates,
    omitted_summary: {
      filtered_by_agent: agentResult.filteredCount,
      filtered_by_phase: phaseResult.filteredCount,
      filtered_by_domain: domainResult.filteredCount,
      filtered_by_stack: stackResult.filteredCount,
    },
    recommendation: {
      suggested_final_selection: SUGGESTED_FINAL_SELECTION,
      guidance,
    },
  };
}

// ── Formatting ───────────────────────────────────────────────────────────

/**
 * Format the shortlist output as human-readable text.
 * @param {object} shortlist
 * @returns {string}
 */
export function formatShortlist(shortlist) {
  const lines = [];

  lines.push("=== Skill Shortlist ===");
  lines.push(`Target Agent: ${shortlist.target_agent}`);
  lines.push(`Task Phase: ${shortlist.task_phase}`);
  lines.push(`Snapshot: ${shortlist.snapshot_ref}`);
  lines.push("");

  // Candidates
  lines.push(`--- Candidates (${shortlist.candidates.length}) ---`);
  lines.push("");

  if (shortlist.candidates.length === 0) {
    lines.push("  No candidates found.");
    lines.push("");
  } else {
    for (let i = 0; i < shortlist.candidates.length; i++) {
      const c = shortlist.candidates[i];
      lines.push(`${i + 1}. ${c.name} (confidence: ${c.confidence})`);
      lines.push(`   Load: ${c.load_path}`);
      lines.push("   Reasons:");
      for (const reason of c.reasons) {
        lines.push(`     - "${reason}"`);
      }
      lines.push("");
    }
  }

  // Omitted summary
  lines.push("--- Omitted Summary ---");
  const om = shortlist.omitted_summary;
  lines.push(`  filtered_by_agent: ${om.filtered_by_agent}`);
  lines.push(`  filtered_by_phase: ${om.filtered_by_phase}`);
  lines.push(`  filtered_by_domain: ${om.filtered_by_domain}`);
  lines.push(`  filtered_by_stack: ${om.filtered_by_stack}`);
  lines.push("");

  // Recommendation
  lines.push("--- Recommendation ---");
  lines.push(`  suggested_final_selection: ${shortlist.recommendation.suggested_final_selection}`);
  lines.push(`  guidance: "${shortlist.recommendation.guidance}"`);

  return lines.join("\n");
}

// ── CLI ──────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const parsed = {
    agent: null,
    phase: "unknown",
    domains: [],
    registry: null,
    snapshot: null,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--agent" && args[i + 1]) {
      parsed.agent = args[++i];
    } else if (args[i] === "--phase" && args[i + 1]) {
      parsed.phase = args[++i];
    } else if (args[i] === "--domains" && args[i + 1]) {
      parsed.domains = args[++i].split(",").map((d) => d.trim());
    } else if (args[i] === "--registry" && args[i + 1]) {
      parsed.registry = args[++i];
    } else if (args[i] === "--snapshot" && args[i + 1]) {
      parsed.snapshot = args[++i];
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log(
        "Usage: node skill-resolver.mjs --agent <name> [--phase <phase>] [--domains <list>] [--registry <path>] [--snapshot <path>]\n\n" +
          "Options:\n" +
          "  --agent <name>       Target agent (required)\n" +
          "  --phase <phase>      Task phase: meta|define|plan|build|verify|review|ship|operate|unknown (default: unknown)\n" +
          "  --domains <list>     Comma-separated domain hints (optional)\n" +
          "  --registry <path>    Path to skill_registry.json (default: docs/ai/harness/skill_registry.json)\n" +
          "  --snapshot <path>    Path to capability snapshot JSON (auto-detected if omitted)\n" +
          "  -h, --help           Show this help",
      );
      process.exit(0);
    }
  }

  return parsed;
}

function main() {
  const parsed = parseArgs(process.argv);

  if (!parsed.agent) {
    console.error("Error: --agent is required. Use --help for usage.");
    process.exit(1);
  }

  // Resolve paths
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, "..");

  const registryPath = parsed.registry
    ? path.resolve(parsed.registry)
    : path.join(repoRoot, "docs/ai/harness/skill_registry.json");

  const snapshotPath = parsed.snapshot
    ? path.resolve(parsed.snapshot)
    : detectSnapshotPath(repoRoot);

  // Load data
  if (!fs.existsSync(registryPath)) {
    console.error(`Error: registry not found: ${registryPath}`);
    process.exit(1);
  }

  const registry = loadRegistry(registryPath);
  const snapshot = snapshotPath ? loadSnapshot(snapshotPath) : null;

  // Generate shortlist
  const shortlist = generateShortlist({
    targetAgent: parsed.agent,
    taskPhase: parsed.phase,
    taskDomains: parsed.domains,
    registry,
    snapshot,
  });

  // Output
  console.log(formatShortlist(shortlist));
}

// Run CLI when invoked directly
const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  main();
}
