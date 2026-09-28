// Runtime-neutral Open Design tool definitions. OpenCode 1 wraps them in
// tools/open_design.ts; OpenCode 2 registers them from runtime/v2/open-design.ts.
import { requestJson, streamOpenDesignChat } from "./open-design-http.mjs";

function runtime() {
  return globalThis;
}

function getEnv(name) {
  const g = runtime();
  return g.process?.env?.[name] ?? g.Bun?.env?.[name];
}

function randomId(length = 8) {
  const g = runtime();
  const bytes = new Uint8Array(Math.ceil(length / 2));
  g.crypto?.getRandomValues?.(bytes);

  if (bytes.some((byte) => byte !== 0)) {
    return Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, length);
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, length);
}

function baseUrl(input) {
  const raw = input || getEnv("OPEN_DESIGN_URL");
  if (!raw) {
    throw new Error("OPEN_DESIGN_URL is not set. Example: export OPEN_DESIGN_URL='https://open-design.example.com'");
  }

  const url = raw.replace(/\/+$/, "");
  if (/\/projects(?:\/|$)/.test(url)) {
    throw new Error("OPEN_DESIGN_URL must be the Open Design base URL, not a project or file URL.");
  }

  return url;
}

function safeSlug(input) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "open-design-project";
}

function projectUrl(base, projectId) {
  return `${base}/projects/${encodeURIComponent(projectId)}`;
}

function projectFileUrl(base, projectId, fileName) {
  const safeFile = fileName.split("/").map(encodeURIComponent).join("/");
  return `${base}/projects/${encodeURIComponent(projectId)}/files/${safeFile}`;
}

function rawFileUrl(base, projectId, fileName) {
  const safeFile = fileName.split("/").map(encodeURIComponent).join("/");
  return `${base}/api/projects/${encodeURIComponent(projectId)}/files/${safeFile}`;
}

function composeSystemPrompt(input) {
  return [
    "# Open Design Runtime",
    "",
    "You are a senior visual designer and frontend prototyper working inside Open Design.",
    "Produce a high-quality, implementable artifact. Prefer writing real files, especially index.html, so the workbench can preview them.",
    "",
    "Rules:",
    "- Follow the active Open Design skill.",
    "- Follow the active design system when provided.",
    "- Avoid generic AI-looking layouts.",
    "- Do not invent fake metrics, testimonials, or brand assets.",
    "- Use accessible contrast and responsive layout.",
    "- Create complete files, not only prose.",
    "",
    `## Active skill: ${input.skillId}`,
    "",
    input.skillBody,
    "",
    input.designSystemBody
      ? `## Active design system: ${input.designSystemId}\n\n${input.designSystemBody}`
      : "## Active design system\n\nNo explicit design system selected. Use a restrained, professional default.",
  ].join("\n");
}

export function openDesignJsonSchema(args) {
  return {
    type: "object",
    properties: Object.fromEntries(Object.keys(args).map((key) => [key, { type: "string" }])),
    required: Object.keys(args).filter((key) => args[key] === "required"),
    additionalProperties: false,
  };
}

export const OPEN_DESIGN_TOOLS = Object.freeze([
  {
    name: "health",
    description: "Check whether the Open Design workbench is reachable.",
    args: { baseUrl: "optional" },
    async execute(args) {
      const base = baseUrl(args.baseUrl);
      const data = await requestJson(base, "/api/health");
      return JSON.stringify({ baseUrl: base, health: data }, null, 2);
    },
  },
  {
    name: "list_agents",
    description: "List local agent CLIs detected by Open Design.",
    args: { baseUrl: "optional" },
    async execute(args) {
      const base = baseUrl(args.baseUrl);
      const data = await requestJson(base, "/api/agents");
      return JSON.stringify(data, null, 2);
    },
  },
  {
    name: "list_skills",
    description: "List Open Design skills available in the workbench.",
    args: { baseUrl: "optional" },
    async execute(args) {
      const base = baseUrl(args.baseUrl);
      const data = await requestJson(base, "/api/skills");
      return JSON.stringify(data, null, 2);
    },
  },
  {
    name: "list_design_systems",
    description: "List Open Design design systems available in the workbench.",
    args: { baseUrl: "optional" },
    async execute(args) {
      const base = baseUrl(args.baseUrl);
      const data = await requestJson(base, "/api/design-systems");
      return JSON.stringify(data, null, 2);
    },
  },
  {
    name: "create_project",
    description: "Create an Open Design project and return its workbench URL without running generation.",
    args: {
      baseUrl: "optional",
      name: "required",
      prompt: "required",
      skillId: "optional",
      designSystemId: "optional",
      kind: "optional",
      fidelity: "optional",
    },
    async execute(args) {
      const base = baseUrl(args.baseUrl);
      const projectId = `${safeSlug(args.name)}-${randomId(8)}`;
      const body = {
        id: projectId,
        name: args.name,
        skillId: args.skillId ?? "web-prototype",
        designSystemId: args.designSystemId ?? null,
        pendingPrompt: args.prompt,
        metadata: {
          kind: args.kind ?? "prototype",
          fidelity: args.fidelity ?? "high-fidelity",
        },
      };

      const created = await requestJson(base, "/api/projects", { method: "POST", body: JSON.stringify(body) });
      return JSON.stringify({ projectId, url: projectUrl(base, projectId), created }, null, 2);
    },
  },
  {
    name: "run_design",
    description: "Create an Open Design project and run a design generation.",
    args: {
      baseUrl: "optional",
      name: "required",
      prompt: "required",
      skillId: "required",
      designSystemId: "optional",
      agentId: "optional",
      model: "optional",
      kind: "optional",
      fidelity: "optional",
    },
    async execute(args) {
      const base = baseUrl(args.baseUrl);
      const projectId = `${safeSlug(args.name)}-${randomId(8)}`;

      await requestJson(base, "/api/projects", {
        method: "POST",
        body: JSON.stringify({
          id: projectId,
          name: args.name,
          skillId: args.skillId,
          designSystemId: args.designSystemId ?? null,
          pendingPrompt: args.prompt,
          metadata: {
            kind: args.kind ?? "prototype",
            fidelity: args.fidelity ?? "high-fidelity",
          },
        }),
      });

      const skill = await requestJson(base, `/api/skills/${encodeURIComponent(args.skillId)}`);
      const designSystem = args.designSystemId
        ? await requestJson(base, `/api/design-systems/${encodeURIComponent(args.designSystemId)}`)
        : null;

      const systemPrompt = composeSystemPrompt({
        skillId: args.skillId,
        skillBody: String(skill?.body ?? ""),
        designSystemId: args.designSystemId ?? null,
        designSystemBody: designSystem?.body ? String(designSystem.body) : null,
      });

      const result = await streamOpenDesignChat(base, {
        agentId: args.agentId ?? "opencode",
        message: args.prompt,
        systemPrompt,
        projectId,
        attachments: [],
        model: args.model ?? null,
        reasoning: null,
      });

      const filesData = await requestJson(base, `/api/projects/${encodeURIComponent(projectId)}/files`);
      const files = Array.isArray(filesData?.files) ? filesData.files : [];

      return JSON.stringify(
        {
          projectId,
          projectUrl: projectUrl(base, projectId),
          files: files.map((file) => ({
            name: file.name,
            kind: file.kind,
            size: file.size,
            uiUrl: projectFileUrl(base, projectId, file.name),
            rawUrl: rawFileUrl(base, projectId, file.name),
          })),
          outputPreview: result.stdout.slice(-4000),
          stderrPreview: result.stderr.slice(-1000),
          eventsCount: result.eventsCount,
        },
        null,
        2,
      );
    },
  },
]);
