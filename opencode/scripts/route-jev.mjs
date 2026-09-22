#!/usr/bin/env node
// Optional external router. Disabled unless the operator sets OAK_ROUTER=jev.
//
// Contract with `lead`: print one JSON object on stdout and exit 0, always.
// A caller that gets `{"status":"unavailable"}` routes on its own exactly as if
// this script did not exist. There is no failure mode that blocks routing:
// every error path below degrades instead of throwing.
//
// Privacy boundary: the only thing sent off the machine is the request text the
// caller passes in argv. This script never reads a file, never walks the repo,
// and never receives repository contents. Keep it that way - the routing
// question does not need them, and OAK is local-first everywhere else.

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const TIMEOUT_MS = Number(process.env.OAK_ROUTER_TIMEOUT_MS || 2000);
const MIN_CONFIDENCE = Number(process.env.OAK_ROUTER_MIN_CONFIDENCE || 0.7);

const CRITERIA = {
  developer: "A small, clear, localized and verifiable change; the work is already understood",
  researcher: "Technical, product, API, library, architecture or risk uncertainty that must be reduced first",
  designer: "UX, UI, visual design, layout, brand or interaction surface",
  specifier: "Enough context exists, but the work still needs tasks, acceptance criteria or a validation plan",
};

function out(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
  process.exit(0);
}

function unavailable(reason) {
  out({ status: "unavailable", reason });
}

export async function route(request, env = process.env, fetchImpl = globalThis.fetch) {
  if (env.OAK_ROUTER !== "jev") return { status: "unavailable", reason: "OAK_ROUTER is not set to jev" };
  const key = env.JEV_API_KEY;
  if (!key) return { status: "unavailable", reason: "JEV_API_KEY is not set" };
  if (typeof request !== "string" || request.trim() === "") return { status: "unavailable", reason: "empty request" };
  if (typeof fetchImpl !== "function") return { status: "unavailable", reason: "no fetch available" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  try {
    response = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        state: request,
        model: env.OAK_ROUTER_MODEL || "jev-latest",
        questions: { route: { type: "choice", instructions: "Which agent should handle this request?", criteria: CRITERIA } },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    return { status: "unavailable", reason: `request failed: ${error?.name ?? "error"}` };
  } finally {
    clearTimeout(timer);
  }

  if (!response?.ok) return { status: "unavailable", reason: `http ${response?.status ?? "no response"}` };

  let body;
  try {
    body = await response.json();
  } catch {
    return { status: "unavailable", reason: "malformed response body" };
  }

  const answer = body?.answers?.route;
  const choice = answer?.choice;
  const confidence = answer?.confidence;
  if (!Object.hasOwn(CRITERIA, choice ?? "")) return { status: "unavailable", reason: "answer is not one of the declared agents" };
  if (typeof confidence !== "number" || Number.isNaN(confidence)) return { status: "unavailable", reason: "answer carries no usable confidence" };
  if (confidence < MIN_CONFIDENCE) return { status: "low_confidence", route: "ask_user", confidence, probabilities: answer.probabilities ?? null };

  return { status: "ok", route: choice, confidence, probabilities: answer.probabilities ?? null, model: body.model ?? null };
}

const isEntrypoint = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isEntrypoint) {
  route(process.argv.slice(2).join(" ")).then(out).catch((error) => unavailable(`unexpected: ${error?.name ?? "error"}`));
}
