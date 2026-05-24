#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const errors = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function listMarkdown(dir) {
  return fs
    .readdirSync(path.join(root, dir))
    .filter((file) => file.endsWith(".md"))
    .map((file) => path.join(dir, file));
}

function stripMarkdownExtension(rel) {
  return path.basename(rel, ".md");
}

function fail(message) {
  errors.push(message);
}

function parseJson(rel) {
  try {
    return JSON.parse(read(rel));
  } catch (error) {
    fail(`${rel}: invalid JSON (${error.message})`);
    return null;
  }
}

function parseFrontmatter(rel) {
  const text = read(rel);
  if (!text.startsWith("---\n")) {
    fail(`${rel}: missing frontmatter`);
    return {};
  }

  const end = text.indexOf("\n---", 4);
  if (end === -1) {
    fail(`${rel}: unclosed frontmatter`);
    return {};
  }

  const data = {};
  const block = text.slice(4, end).split("\n");
  for (const line of block) {
    if (!line.trim()) continue;
    if (/^\s/.test(line)) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!match) {
      fail(`${rel}: malformed frontmatter line "${line}"`);
      continue;
    }
    data[match[1]] = match[2].replace(/^"(.*)"$/, "$1");
  }
  return data;
}

function frontmatterBlock(rel) {
  const text = read(rel);
  if (!text.startsWith("---\n")) return "";
  const end = text.indexOf("\n---", 4);
  if (end === -1) return "";
  return text.slice(4, end);
}

function requireFields(rel, object, fields) {
  for (const field of fields) {
    if (!object[field]) fail(`${rel}: missing ${field}`);
  }
}

function checkAgentsIndex() {
  const text = read("AGENTS.md");
  const nonBlankLines = text.split("\n").filter((line) => line.trim()).length;
  const maxNonBlankLines = 120;

  if (nonBlankLines > maxNonBlankLines) {
    fail(`AGENTS.md: must stay a short index (${nonBlankLines}/${maxNonBlankLines} non-blank lines)`);
  }

  for (const token of ["docs/ai/harness/", "docs/ai/evolution/"]) {
    if (!text.includes(token)) fail(`AGENTS.md: missing index reference ${token}`);
  }
}

function checkAgentDocsCoverage() {
  const docs = read("docs/ai/harness/agents.md");
  for (const rel of listMarkdown("agents")) {
    const agent = stripMarkdownExtension(rel);
    if (!docs.includes(`\`${agent}\``)) {
      fail(`docs/ai/harness/agents.md: missing documented agent \`${agent}\``);
    }
  }
}

function checkCommandDocsCoverage() {
  const docs = read("docs/ai/harness/commands.md");
  for (const rel of listMarkdown("commands")) {
    const command = stripMarkdownExtension(rel);
    if (!docs.includes(`/${command}`)) {
      fail(`docs/ai/harness/commands.md: missing documented command /${command}`);
    }
  }
}

function checkFrontmatter() {
  for (const rel of listMarkdown("agents")) {
    requireFields(rel, parseFrontmatter(rel), ["description", "mode"]);
  }
  for (const rel of listMarkdown("commands")) {
    requireFields(rel, parseFrontmatter(rel), ["description", "agent"]);
  }
}

function checkConfig() {
  const config = parseJson("opencode.json");
  if (!config) return;
  if (config.default_agent !== "lead") {
    fail("opencode.json: default_agent must remain lead");
  }
}

/**
 * Verify that all given regex patterns match the text.
 * Each pattern is either a RegExp, a string treated as literal, or an object
 * with a regex and optional literal fallbacks.
 */
function checkSemantic(text, patterns, label) {
  for (let i = 0; i < patterns.length; i++) {
    const p = patterns[i];
    const re =
      p instanceof RegExp
        ? p
        : p.regex instanceof RegExp
          ? p.regex
          : new RegExp("\\b" + p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
    const fallbackLiterals = p.fallbackLiterals ?? [];
    if (!re.test(text) && !fallbackLiterals.some((token) => text.includes(token))) {
      const desc = p instanceof RegExp ? p.source : p.description ?? p.regex?.source ?? p;
      fail(`${label}[${i}]: no match for /${desc}/`);
    }
  }
}

function checkLeadRouterContract() {
  const text = read("agents/lead.md");
  const frontmatter = frontmatterBlock("agents/lead.md");

  if (!/^\s*edit:\s*deny\s*$/m.test(frontmatter)) {
    fail("agents/lead.md: lead edit permission must remain deny");
  }

  for (const command of [
    '"cd": allow',
    '"cd *": allow',
    '"which": allow',
    '"which *": allow',
  ]) {
    if (!frontmatter.includes(command)) {
      fail(`agents/lead.md: missing bash allow ${command}`);
    }
  }

  // --- Structural tokens (exact literals, agent identifiers) ---
  for (const token of [
    "developer",
    "researcher",
    "designer",
    "specifier",
    "`researcher`",
    "`reviewer`",
  ]) {
    if (!text.includes(token)) fail(`agents/lead.md: missing ${token}`);
  }

  // --- Semantic tokens (flexible regex, 15 patterns) ---
  checkSemantic(text, [
    // C1: fast router
    /\b(fast|quick|rapid|agile|lightweight)\s+router\b/i,
    // B11: ask the user
    /\b(ask|consult)\s+the\s+user\b/i,
    // C2: real ambiguity
    /\b(real|genuine|material|meaningful)\s+ambiguity\b/i,
    // B1: Do not edit code
    {
      regex: /\bdo\s+not\s+(edit|modify|change|alter)\s+code\b/i,
      fallbackLiterals: ["Do not edit code"],
    },
    // B9: ownership during the whole loop
    /\b(whole|entire)\s+(loop|cycle)\s+of\s+the\s+same\s+free-form\s+request\b/i,
    // B8: send a bounded task back to `developer`
    /\b(send|return|route|pass)\s+a\s+bounded\s+(task|correction)\s+back\s+to\s+\`developer\`/i,
    // B7: implementation correction goes back to `developer`
    /\b(implementation\s+)?(correction|fix|adjustment|change)\s+goes\s+back\s+to\s+\`developer\`/i,
    // B2: does not develop
    {
      regex: /\bdoes\s+not\s+(develop|code|implement|program)\b/i,
      fallbackLiterals: ["does not develop"],
    },
    // B3: does not investigate code
    {
      regex: /\bdoes\s+not\s+(deeply\s+)?(investigate|inspect|analyze|analyse)\s+code\b/i,
      fallbackLiterals: ["does not deeply"],
    },
    // C3: minimum context needed to
    /\bminimum\s+context\s+needed\s+to\b/i,
    // B4: delegate to `researcher`
    /\bdelegate\s+to\s+\`researcher\`/i,
    // B10: Do not mentally implement before delegating
    /\bdo\s+not\s+(mentally\s+)?(implement|design|solve|build)\s+the\s+(solution|problem)\s+before\s+delegating\b/i,
    // C4: handoff to another
    /\bhandoff\s+to\s+another\b/i,
    // B5: must be self-contained
    /\bmust\s+be\s+self-contained\b/i,
    // B6: Do not review a diff yourself
    /\bdo\s+not\s+(review|inspect)\s+a\s+diff\s+yourself\b/i,
  ], "agents/lead.md semantic invariant");

  const docs = read("docs/ai/harness/agents.md");

  // --- Structural token in agents.md ---
  if (!docs.includes("belongs to `reviewer`")) {
    fail("docs/ai/harness/agents.md: missing belongs to `reviewer`");
  }

  // --- Semantic tokens in agents.md (4 patterns) ---
  checkSemantic(docs, [
    /\`lead\`\s+does\s+not\s+(edit|modify|change|alter)\s+files\b/i,
    /\b(later|subsequent)\s+(adjustments|corrections|fixes|changes)\s+for\s+that\s+same\s+free-form\s+request\s+go\s+back\s+to\s+\`developer\`/i,
    /\`lead\`\s+does\s+not\s+(develop|code|implement|program)\b/i,
    /\bdelegates\s+(substantive|meaningful|deep)\s+discovery\s+to\s+\`researcher\`/i,
    /\bevery\s+\`lead\`\s+handoff\s+to\s+another\s+agent\s+must\s+be\s+self-contained\b/i,
  ], "docs/ai/harness/agents.md semantic invariant");

  const commandDocs = read("docs/ai/harness/commands.md");

  // --- Semantic tokens in commands.md (3 patterns) ---
  checkSemantic(commandDocs, [
    /\bunderstand\s+(code\s+behavior|how\s+the\s+code\s+works|the\s+code)\b/i,
    /\bdelegates\s+to\s+\`researcher\`/i,
    /\bdelegate\s+review\s+to\s+\`reviewer\`/i,
    /\`lead\`\s+does\s+not\s+replace\s+\`reviewer\`/i,
  ], "docs/ai/harness/commands.md semantic invariant");
}

function checkFeatureContract() {
  const text = read("commands/feature.md");
  const requiredFlow =
    "lead -> designer if applicable -> researcher -> specifier -> developer -> reviewer";
  if (!text.includes(requiredFlow)) {
    fail("commands/feature.md: missing exact base feature flow");
  }

  const flowSection = text.split("## Mandatory flow")[1]?.split("AHE sidecars")[0] || "";
  if (/\b(evaluator|debugger|evolver)\b/.test(flowSection)) {
    fail("commands/feature.md: sidecar appears in mandatory feature flow");
  }
}

function checkPlanContract() {
  const rel = "commands/plan.md";
  if (!exists(rel)) {
    fail(`${rel}: missing plan command`);
    return;
  }

  const text = read(rel);
  for (const token of [
    "lead -> researcher -> specifier -> reviewer",
    "Do not invoke developer",
    "1 correction pass",
  ]) {
    if (!text.includes(token)) fail(`${rel}: missing ${token}`);
  }
}

function checkHarnessDocs() {
  const required = [
    "docs/ai/harness/README.md",
    "docs/ai/harness/agents.md",
    "docs/ai/harness/commands.md",
    "docs/ai/harness/evidence.md",
    "docs/ai/harness/checks.md",
    "docs/ai/evolution/README.md",
    "docs/ai/evolution/evolution_history.md",
    "docs/ai/evolution/benchmarks/manual-scenarios.md",
  ];
  for (const rel of required) {
    if (!exists(rel)) fail(`${rel}: missing harness doc`);
  }

  if (exists("docs/ai/evolution/benchmarks/manual-scenarios.md")) {
    const text = read("docs/ai/evolution/benchmarks/manual-scenarios.md");
    for (const token of ["opencode run --format json --thinking", "static_contract", "transcript_replay", "live_smoke", "manual_oracle"]) {
      if (!text.includes(token)) {
        fail(`docs/ai/evolution/benchmarks/manual-scenarios.md: missing ${token}`);
      }
    }
  }
}

function collectReferencedPathStrings(value, strings = [], key = "") {
  if (typeof value === "string") {
    if (key === "files" || key === "evidence") strings.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectReferencedPathStrings(item, strings, key);
  } else if (value && typeof value === "object") {
    for (const [childKey, item] of Object.entries(value)) {
      collectReferencedPathStrings(item, strings, childKey);
    }
  }
  return strings;
}

function localPathFromString(value) {
  const trimmed = value.trim();
  const match = trimmed.match(/^((?:\.{1,2}\/)?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\.(?:md|json|mjs|js|ts|tsx|txt))(?:[:#].*)?$/);
  if (!match) return null;

  const rel = match[1];
  if (rel.startsWith("http://") || rel.startsWith("https://")) return null;
  if (rel.startsWith("/")) return null;
  return rel;
}

function checkReferencedJsonPaths(rel, json) {
  if (!json) return;
  const runRel = path.dirname(rel);

  for (const value of collectReferencedPathStrings(json)) {
    const localPath = localPathFromString(value);
    if (!localPath) continue;

    const candidates = localPath.startsWith("docs/")
      ? [localPath]
      : [path.join(runRel, localPath), localPath];
    if (!candidates.some((candidate) => exists(candidate))) {
      fail(`${rel}: referenced local path does not exist: ${localPath}`);
    }
  }
}

function validateManifest(rel) {
  const manifest = parseJson(rel);
  if (!manifest) return;
  if (!Array.isArray(manifest.changes) || manifest.changes.length === 0) {
    fail(`${rel}: changes must be a non-empty array`);
    return;
  }
  for (const [index, change] of manifest.changes.entries()) {
    const prefix = `${rel}: changes[${index}]`;
    for (const field of [
      "id",
      "type",
      "description",
      "files",
      "failure_pattern",
      "evidence",
      "predicted_fixes",
      "risk_tasks",
      "constraint_level",
      "why_this_component",
    ]) {
      if (change[field] === undefined) fail(`${prefix}: missing ${field}`);
    }
  }
  checkReferencedJsonPaths(rel, manifest);
}

function checkEvolutionRuns() {
  const runsDir = path.join(root, "docs/ai/evolution/runs");
  if (!fs.existsSync(runsDir)) return;

  for (const name of fs.readdirSync(runsDir)) {
    const runPath = path.join(runsDir, name);
    if (!fs.statSync(runPath).isDirectory()) continue;
    const rel = `docs/ai/evolution/runs/${name}`;
    const hasEvaluation = exists(`${rel}/evaluation.md`);
    const hasAnalysis = exists(`${rel}/analysis/overview.md`);
    const hasManifest = exists(`${rel}/change_manifest.json`);

    if (!hasEvaluation) fail(`${rel}: missing evaluation.md`);
    if (hasManifest && !hasAnalysis) fail(`${rel}: missing analysis/overview.md`);
    if (hasManifest) validateManifest(`${rel}/change_manifest.json`);
    if (hasManifest && !exists(`${rel}/change_evaluation.json`)) {
      fail(`${rel}: manifest exists without change_evaluation.json`);
    }
    if (exists(`${rel}/change_evaluation.json`)) {
      checkReferencedJsonPaths(`${rel}/change_evaluation.json`, parseJson(`${rel}/change_evaluation.json`));
    }
  }
}

/**
 * Validate that commands/evolve.md contains the AHE flow
 * evaluator -> debugger -> evolver with flexible regex matching.
 */
function checkEvolveContract() {
  const text = read("commands/evolve.md");

  // Structural tokens: agent identifiers that must appear
  for (const token of ["evaluator", "debugger", "evolver"]) {
    if (!text.includes(token)) {
      fail(`commands/evolve.md: missing agent token ${token}`);
    }
  }

  // Semantic: the AHE flow sequence evaluator -> debugger -> evolver
  // Must appear in this order with any intervening text.
  checkSemantic(text, [
    // The core AHE flow: evaluator -> debugger -> evolver (flexible arrow + ordering)
    {
      regex: /\bevaluator\b[\s\S]*?\bdebugger\b[\s\S]*?\bevolver\b/i,
    },
    // Flow section must exist
    {
      regex: /\bflow\b/i,
      fallbackLiterals: ["## Flow"],
    },
    // Invoke evaluator pattern
    {
      regex: /\b(invoke|run|call)\s+\`?evaluator\`?/i,
      fallbackLiterals: ["Invoke `evaluator`"],
    },
    // Invoke debugger pattern
    {
      regex: /\b(invoke|run|call)\s+\`?debugger\`?/i,
      fallbackLiterals: ["Invoke `debugger`"],
    },
    // Invoke evolver pattern
    {
      regex: /\b(invoke|run|call)\s+\`?evolver\`?/i,
      fallbackLiterals: ["Invoke `evolver`"],
    },
    // AHE reference
    {
      regex: /\ba\.h\.e\.|ahe|harness\s+(iteration|evolution)|evolve\s+the\s+harness/i,
      fallbackLiterals: ["/evolve", "Evolve the OpenCode harness"],
    },
  ], "commands/evolve.md AHE flow");
}

/**
 * Verify that each semantic invariant documented in
 * docs/ai/harness/agents.md has a semantically equivalent phrase
 * in the corresponding agent prompt (agents/<name>.md).
 */
function checkCrossAgentContract() {
  const docs = read("docs/ai/harness/agents.md");

  // Define invariant patterns per agent. Each entry maps an agent to
  // the semantic invariants that agents.md declares about them, and
  // the regex/literals used to find equivalent phrases in the agent's
  // prompt file.
  const agentInvariants = [
    {
      agent: "lead",
      // Invariants from agents.md:
      // - `lead` is the harness default_agent and bounded router.
      // - `lead` does not edit files; it delegates to `developer`.
      // - `lead` does not develop or deeply inspect code.
      // - Every `lead` handoff must be self-contained.
      patterns: [
        {
          regex: /\b(fast|bounded|quick|lightweight)\s+router\b/i,
          fallbackLiterals: ["bounded router", "fast router"],
        },
        {
          regex: /\bdo\s+not\s+(edit|modify|change|alter)\s+(files|code)\b/i,
          fallbackLiterals: ["Do not edit code"],
        },
        {
          regex: /\bdoes\s+not\s+(develop|code|implement|program)\b/i,
          fallbackLiterals: ["does not develop"],
        },
        {
          regex: /\bdoes\s+not\s+(deeply\s+)?(investigate|inspect|analyze|analyse)\s+code\b/i,
          fallbackLiterals: ["does not deeply"],
        },
        {
          regex: /\bself-contained\b/i,
          fallbackLiterals: ["self-contained"],
        },
      ],
    },
    {
      agent: "developer",
      // Invariants from agents.md:
      // - `developer` runs direct mode when `lead` delegates.
      // - Later adjustments go back to `developer`.
      patterns: [
        {
          regex: /\bdirect\s+mode\b/i,
          fallbackLiterals: ["Direct mode"],
        },
        {
          regex: /\bdelegat\w*[\s\S]*?(small|clear|bounded|verifiable)\s+(task|change)/i,
          fallbackLiterals: ["delegates a small"],
        },
        {
          regex: /\b(later|subsequent)\s+(adjustments|corrections|fixes|changes)[\s\S]*?\b(go|goes|return|returns)\s+back\s+to\s+\`?developer\`?/i,
          fallbackLiterals: ["go back to `developer`"],
        },
      ],
    },
    {
      agent: "designer",
      // Invariants from agents.md:
      // - UX/UI, brand, layout, interaction, or Open Design.
      patterns: [
        {
          regex: /\b(UX|UI|interface|design|brand|layout|interaction)\b/i,
          fallbackLiterals: ["UX/UI"],
        },
        {
          regex: /\bopen\s*design/i,
          fallbackLiterals: ["Open Design"],
        },
      ],
    },
    {
      agent: "researcher",
      // Invariants from agents.md:
      // - Technical/product uncertainty, APIs, libraries, and risks.
      patterns: [
        {
          regex: /\b((technical|product)\s+uncertainty|uncertainty|unknowns?|APIs?|libraries|risks?)\b/i,
          fallbackLiterals: ["technical/product uncertainty"],
        },
        {
          regex: /\b(API|library|libraries|framework|dependency|dependencies)\b/i,
          fallbackLiterals: ["APIs"],
        },
        {
          regex: /\b(risk|risks|threat|hazard)\b/i,
          fallbackLiterals: ["riesgos"],
        },
      ],
    },
    {
      agent: "specifier",
      // Invariants from agents.md:
      // - Enough context exists to turn the goal into tasks.
      patterns: [
        {
          regex: /\b(acceptance\s+criteria|criterion|criteria)\b/i,
          fallbackLiterals: ["Acceptance criteria"],
        },
        {
          regex: /\b(validation\s+plan|test\s+plan)\b/i,
          fallbackLiterals: ["validation plan"],
        },
        {
          regex: /\b(atomic|ordered|small)\s+tasks?\b/i,
          fallbackLiterals: ["ordered tasks"],
        },
      ],
    },
    {
      agent: "reviewer",
      // Invariants from agents.md:
      // - A diff, implementation, or planning artifact is reviewable.
      patterns: [
        {
          regex: /\b((diff|implementation|code|artifact)\s+(reviewable|review|audit|reviewed)|reviewable\s+diff)\b/i,
          fallbackLiterals: ["reviewable diff"],
        },
        {
          regex: /\b(security|bugs?|regression|maintainability|compliance)\b/i,
          fallbackLiterals: ["seguridad"],
        },
      ],
    },
    {
      agent: "scoper",
      // Invariants from agents.md:
      // - The user wants research -> spec without implementation.
      patterns: [
        {
          regex: /\b(research\s*->\s*spec|research-and-spec|research\s+and\s+specification|research[\s\S]*?scoped\s+specs?)\b/i,
          fallbackLiterals: ["research -> spec"],
        },
        {
          regex: /\b(no\s+(design|implementation|code|developer)|do\s+not\s+(design|implement|modify|review)\s+code|do\s+not\s+design)\b/i,
          fallbackLiterals: ["Do not implement code"],
        },
      ],
    },
    {
      agent: "evaluator",
      // Invariants from agents.md:
      // - Benchmark/smoke evidence or /evolve is needed.
      patterns: [
        {
          regex: /\b(benchmark|smoke|evidencia)\b/i,
          fallbackLiterals: ["evidencia"],
        },
        {
          regex: /\b(pass|fail|not_run)\b/i,
          fallbackLiterals: ["pass/fail"],
        },
      ],
    },
    {
      agent: "debugger",
      // Invariants from agents.md:
      // - Failures, traces, results, or attribution need analysis.
      patterns: [
        {
          regex: /\b(failure|fail|trace|root\s+cause|attribution)\b/i,
          fallbackLiterals: ["root cause"],
        },
        {
          regex: /\b(analyze|analyse|interpret|debug|transform)\b/i,
          fallbackLiterals: ["analizar"],
        },
      ],
    },
    {
      agent: "evolver",
      // Invariants from agents.md:
      // - The harness is improved with AHE evidence.
      // - `evolver` only works on the OpenCode harness.
      patterns: [
        {
          regex: /\b(harness|OpenCode)\b/i,
          fallbackLiterals: ["harness"],
        },
        {
          regex: /\b(evidencia|manifest|predicted\s+fixes|risk\s+tasks)\b/i,
          fallbackLiterals: ["evidencia"],
        },
        {
          regex: /\b(iteration|keep|improve|rollback|pivot)\b/i,
          fallbackLiterals: ["keep"],
        },
      ],
    },
  ];

  for (const { agent, patterns } of agentInvariants) {
    const agentFile = `agents/${agent}.md`;
    if (!exists(agentFile)) {
      fail(`agents/${agent}.md: file does not exist`);
      continue;
    }

    const agentText = read(agentFile);

    for (const [index, pattern] of patterns.entries()) {
      const re =
        pattern.regex instanceof RegExp
          ? pattern.regex
          : new RegExp("\\b" + pattern.regex.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
      const hasMatch = re.test(agentText) ||
        (pattern.fallbackLiterals ?? []).some((token) => agentText.includes(token));
      if (!hasMatch) {
        fail(`agents/${agent}.md: missing semantic invariant[${index}] from agents.md`);
      }
    }
  }
}

/**
 * Validate that commands/scope.md and commands/design.md contain
 * their documented base flows with flexible regex matching.
 */
function checkCommandContracts() {
  // --- scope.md: must contain scoper -> researcher -> specifier flow ---
  const scopeText = read("commands/scope.md");

  checkSemantic(scopeText, [
    // researcher invocation
    {
      regex: /\b(invoke|run|call)\s+\`?researcher\`?/i,
      fallbackLiterals: ["Invoke researcher first"],
    },
    // specifier invocation
    {
      regex: /\b(invoke|run|call)\s+\`?specifier\`?/i,
      fallbackLiterals: ["Invoke specifier"],
    },
    // researcher -> specifier ordering (with arrows or sequential steps)
    {
      regex: /\bresearcher\b[\s\S]*?\bspecifier\b/i,
    },
    // scoper self-reference (this is the scoper command)
    {
      regex: /\bscoper\b/i,
      fallbackLiterals: ["scoper"],
    },
    // no implementation
    {
      regex: /\b(no\s+(design|implementation|diff\s+review)|do\s+not\s+(implement|use\s+developer))\b/i,
      fallbackLiterals: ["Do not implement code"],
    },
  ], "commands/scope.md flow");

  // --- design.md: must contain designer -> open design flow ---
  const designText = read("commands/design.md");

  checkSemantic(designText, [
    // open-design skill/tool references
    {
      regex: /\bopen[-_]?design\b/i,
      fallbackLiterals: ["open_design"],
    },
    // PRODUCT.md / DESIGN.md references
    {
      regex: /\b(PRODUCT\.md|DESIGN\.md)\b/i,
      fallbackLiterals: ["PRODUCT.md"],
    },
    // open_design_health / open_design_list_agents / open_design_run_design
    {
      regex: /\b(open_design_(health|list_agents|list_skills|list_design_systems|create_project|run_design))\b/i,
      fallbackLiterals: ["open_design_health"],
    },
    // baseUrl handling
    {
      regex: /\b(baseUrl|base\s*url|url\s+(de|del|base))\b/i,
      fallbackLiterals: ["baseUrl"],
    },
    // design flow with numbered steps
    {
      regex: /\b(Flow|Step\s+\d|^\d+\.\s)/m,
      fallbackLiterals: ["Flow"],
    },
  ], "commands/design.md flow");
}

checkConfig();
checkAgentsIndex();
checkFrontmatter();
checkAgentDocsCoverage();
checkCommandDocsCoverage();
checkLeadRouterContract();
checkFeatureContract();
checkPlanContract();
checkHarnessDocs();
checkEvolutionRuns();
checkEvolveContract();
checkCrossAgentContract();
checkCommandContracts();

if (errors.length > 0) {
  console.error("Harness check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Harness check passed.");
