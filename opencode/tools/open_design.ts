import { tool } from "@opencode-ai/plugin"

type RuntimeGlobals = {
  process?: { env?: Record<string, string | undefined> }
  Bun?: { env?: Record<string, string | undefined> }
  crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array }
}

function runtime() {
  return globalThis as unknown as RuntimeGlobals
}

function getEnv(name: string): string | undefined {
  const g = runtime()
  return g.process?.env?.[name] ?? g.Bun?.env?.[name]
}

function randomId(length = 8): string {
  const g = runtime()
  const bytes = new Uint8Array(Math.ceil(length / 2))
  g.crypto?.getRandomValues?.(bytes)

  if (bytes.some((byte) => byte !== 0)) {
    return Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, length)
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, length)
}

function baseUrl(input?: string) {
  const raw = input || getEnv("OPEN_DESIGN_URL")
  if (!raw) {
    throw new Error("OPEN_DESIGN_URL is not set. Example: export OPEN_DESIGN_URL='https://open-design.example.com'")
  }

  const url = raw.replace(/\/+$/, "")
  if (/\/projects\//.test(url)) {
    throw new Error("OPEN_DESIGN_URL must be the Open Design base URL, not a project or file URL.")
  }

  return url
}

async function requestJson(base: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  })

  const text = await res.text()
  let body: unknown = text

  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }

  if (!res.ok) {
    throw new Error(`Open Design ${path} failed (${res.status}): ${JSON.stringify(body, null, 2)}`)
  }

  return body
}

function safeSlug(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "open-design-project"
}

function projectUrl(base: string, projectId: string) {
  return `${base}/projects/${encodeURIComponent(projectId)}`
}

function projectFileUrl(base: string, projectId: string, fileName: string) {
  const safeFile = fileName.split("/").map(encodeURIComponent).join("/")
  return `${base}/projects/${encodeURIComponent(projectId)}/files/${safeFile}`
}

function rawFileUrl(base: string, projectId: string, fileName: string) {
  const safeFile = fileName.split("/").map(encodeURIComponent).join("/")
  return `${base}/api/projects/${encodeURIComponent(projectId)}/files/${safeFile}`
}

function composeSystemPrompt(input: {
  skillId: string
  skillBody: string
  designSystemId?: string | null
  designSystemBody?: string | null
}) {
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
  ].join("\n")
}

function parseSseFrames(buffer: string) {
  const frames: Array<{ event: string; data: any }> = []
  let rest = buffer

  while (true) {
    const idx = rest.indexOf("\n\n")
    if (idx === -1) break
    const raw = rest.slice(0, idx)
    rest = rest.slice(idx + 2)

    let event = "message"
    let data = ""
    for (const line of raw.split("\n")) {
      if (line.startsWith("event: ")) event = line.slice(7).trim()
      if (line.startsWith("data: ")) data += line.slice(6)
    }

    try {
      frames.push({ event, data: JSON.parse(data) })
    } catch {
      frames.push({ event, data })
    }
  }

  return { frames, rest }
}

async function streamOpenDesignChat(base: string, body: unknown) {
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "")
    throw new Error(`Open Design chat failed (${res.status}): ${text}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let stdout = ""
  let stderr = ""
  let end: any = null
  let eventsCount = 0

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const parsed = parseSseFrames(buffer)
    buffer = parsed.rest

    for (const frame of parsed.frames) {
      eventsCount += 1
      if (frame.event === "stdout") stdout += String(frame.data?.chunk ?? "")
      if (frame.event === "stderr") stderr += String(frame.data?.chunk ?? "")
      if (frame.event === "agent") {
        if (typeof frame.data?.delta === "string") stdout += frame.data.delta
        if (typeof frame.data?.text === "string") stdout += frame.data.text
      }
      if (frame.event === "end") end = frame.data
      if (frame.event === "error") {
        throw new Error(`Open Design agent error: ${String(frame.data?.message ?? JSON.stringify(frame.data))}`)
      }
    }
  }

  if (end && typeof end.code === "number" && end.code !== 0) {
    throw new Error(`Open Design agent exited with code ${end.code}\n${stderr.slice(-1000)}`)
  }

  return { stdout, stderr, end, eventsCount }
}

export const health = tool({
  description: "Check whether the Open Design workbench is reachable.",
  args: {
    baseUrl: tool.schema.string().optional(),
  },
  async execute(args) {
    const base = baseUrl(args.baseUrl)
    const data = await requestJson(base, "/api/health")
    return JSON.stringify({ baseUrl: base, health: data }, null, 2)
  },
})

export const list_agents = tool({
  description: "List local agent CLIs detected by Open Design.",
  args: {
    baseUrl: tool.schema.string().optional(),
  },
  async execute(args) {
    const base = baseUrl(args.baseUrl)
    const data = await requestJson(base, "/api/agents")
    return JSON.stringify(data, null, 2)
  },
})

export const list_skills = tool({
  description: "List Open Design skills available in the workbench.",
  args: {
    baseUrl: tool.schema.string().optional(),
  },
  async execute(args) {
    const base = baseUrl(args.baseUrl)
    const data = await requestJson(base, "/api/skills")
    return JSON.stringify(data, null, 2)
  },
})

export const list_design_systems = tool({
  description: "List Open Design design systems available in the workbench.",
  args: {
    baseUrl: tool.schema.string().optional(),
  },
  async execute(args) {
    const base = baseUrl(args.baseUrl)
    const data = await requestJson(base, "/api/design-systems")
    return JSON.stringify(data, null, 2)
  },
})

export const create_project = tool({
  description: "Create an Open Design project and return its workbench URL without running generation.",
  args: {
    baseUrl: tool.schema.string().optional(),
    name: tool.schema.string(),
    prompt: tool.schema.string(),
    skillId: tool.schema.string().optional(),
    designSystemId: tool.schema.string().optional(),
    kind: tool.schema.string().optional(),
    fidelity: tool.schema.string().optional(),
  },
  async execute(args) {
    const base = baseUrl(args.baseUrl)
    const projectId = `${safeSlug(args.name)}-${randomId(8)}`
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
    }

    const created = await requestJson(base, "/api/projects", { method: "POST", body: JSON.stringify(body) })
    return JSON.stringify({ projectId, url: projectUrl(base, projectId), created }, null, 2)
  },
})

export const run_design = tool({
  description: "Create an Open Design project and run a design generation.",
  args: {
    baseUrl: tool.schema.string().optional(),
    name: tool.schema.string(),
    prompt: tool.schema.string(),
    skillId: tool.schema.string(),
    designSystemId: tool.schema.string().optional(),
    agentId: tool.schema.string().optional(),
    model: tool.schema.string().optional(),
    kind: tool.schema.string().optional(),
    fidelity: tool.schema.string().optional(),
  },
  async execute(args) {
    const base = baseUrl(args.baseUrl)
    const projectId = `${safeSlug(args.name)}-${randomId(8)}`

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
    })

    const skill = (await requestJson(base, `/api/skills/${encodeURIComponent(args.skillId)}`)) as any
    const designSystem = args.designSystemId
      ? ((await requestJson(base, `/api/design-systems/${encodeURIComponent(args.designSystemId)}`)) as any)
      : null

    const systemPrompt = composeSystemPrompt({
      skillId: args.skillId,
      skillBody: String(skill?.body ?? ""),
      designSystemId: args.designSystemId ?? null,
      designSystemBody: designSystem?.body ? String(designSystem.body) : null,
    })

    const result = await streamOpenDesignChat(base, {
      agentId: args.agentId ?? "opencode",
      message: args.prompt,
      systemPrompt,
      projectId,
      attachments: [],
      model: args.model ?? null,
      reasoning: null,
    })

    const filesData = (await requestJson(base, `/api/projects/${encodeURIComponent(projectId)}/files`)) as any
    const files = Array.isArray(filesData?.files) ? filesData.files : []

    return JSON.stringify(
      {
        projectId,
        projectUrl: projectUrl(base, projectId),
        files: files.map((file: any) => ({
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
    )
  },
})
