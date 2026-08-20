import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const openDesign = await import("../opencode/tools/open-design-http.mjs");
const { requestJson, streamOpenDesignChat } = openDesign;
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function trackedStream(chunks, state = {}) {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(new TextEncoder().encode(chunks[index++]));
      } else {
        controller.close();
      }
    },
    cancel() {
      state.cancelled = true;
    },
  });
}

function chatResponse(chunks, state = {}) {
  return new Response(trackedStream(chunks, state), { status: 200 });
}

function options(fetchImpl, overrides = {}) {
  return { fetchImpl, ...overrides };
}

test("Open Design exposes bounded HTTP and SSE transport helpers", () => {
  assert.equal(typeof requestJson, "function");
  assert.equal(typeof streamOpenDesignChat, "function");
});

test("the Open Design tool delegates network reads to the bounded transport", () => {
  const source = fs.readFileSync(path.join(ROOT, "opencode/tools/open_design.ts"), "utf8");
  assert.match(source, /from ["']\.\/open-design-http\.mjs["']/);
  assert.doesNotMatch(source, /await fetch\(/);
  assert.doesNotMatch(source, /await res\.text\(/);
});

test("requestJson aborts a request that stalls before response headers", async () => {
  await assert.rejects(
    requestJson("http://open-design.test", "/api/health", {}, options(() => new Promise(() => {}), {
      connectTimeoutMs: 100,
    })),
    /timed out while connecting/,
  );
});

test("requestJson cancels an oversized response before parsing it", async () => {
  const state = {};
  const response = new Response(trackedStream(["x".repeat(2_048), "x"], state), {
    status: 200,
    headers: { "content-length": "2048" },
  });

  await assert.rejects(
    requestJson("http://open-design.test", "/api/health", {}, options(async () => response, {
      maxJsonBytes: 1_024,
    })),
    /response exceeds 1024 bytes/,
  );
  assert.equal(state.cancelled, true);
});

test("streamOpenDesignChat parses partial CRLF-framed SSE events", async () => {
  const chunks = [
    "event: stdout\r\ndata: {\"chunk\":\"hel",
    "lo\"}\r\n\r\nevent: agent\r\ndata: {\"delta\":\" world\"}\r\n\r\nevent: end\r\ndata: {\"code\":0}\r\n\r\n",
  ];

  const result = await streamOpenDesignChat(
    "http://open-design.test",
    { prompt: "test" },
    options(async () => chatResponse(chunks), { maxEvents: 10 }),
  );

  assert.equal(result.stdout, "hello world");
  assert.equal(result.stderr, "");
  assert.equal(result.eventsCount, 3);
  assert.deepEqual(result.end, { code: 0 });
});

test("streamOpenDesignChat keeps the tail of bounded stderr on non-zero exit", async () => {
  const stderr = `head-marker ${"x".repeat(1_500)} tail-marker`;
  const frames = [
    `event: stderr\ndata: ${JSON.stringify({ chunk: stderr })}\n\n`,
    "event: end\ndata: {\"code\":2}\n\n",
  ];

  await assert.rejects(
    streamOpenDesignChat(
      "http://open-design.test",
      { prompt: "test" },
      options(async () => chatResponse(frames)),
    ),
    /tail-marker/,
  );
});

test("streamOpenDesignChat cancels the reader when output exceeds its cap", async () => {
  const state = {};
  const frame = `event: stdout\ndata: ${JSON.stringify({ chunk: "x".repeat(1_500) })}\n\n`;

  await assert.rejects(
    streamOpenDesignChat(
      "http://open-design.test",
      { prompt: "test" },
      options(async () => chatResponse([frame, frame], state), { maxOutputBytes: 1_024 }),
    ),
    /stdout\/stderr output exceeds 1024 bytes/,
  );
  assert.equal(state.cancelled, true);
});

test("streamOpenDesignChat rejects an oversized SSE body and cancels the reader", async () => {
  const state = {};
  const oversizedComment = `: ${"x".repeat(1_500)}\n\n`;

  await assert.rejects(
    streamOpenDesignChat(
      "http://open-design.test",
      { prompt: "test" },
      options(async () => chatResponse([oversizedComment, oversizedComment], state), {
        maxSseBytes: 1_024,
      }),
    ),
    /SSE response exceeds 1024 bytes/,
  );
  assert.equal(state.cancelled, true);
});

test("streamOpenDesignChat rejects an excessive event count and cancels the reader", async () => {
  const state = {};
  const frame = "event: stdout\ndata: {\"chunk\":\"x\"}\n\n";

  await assert.rejects(
    streamOpenDesignChat(
      "http://open-design.test",
      { prompt: "test" },
      options(async () => chatResponse([frame + frame + frame, frame], state), { maxEvents: 2 }),
    ),
    /SSE event count exceeds 2/,
  );
  assert.equal(state.cancelled, true);
});

test("streamOpenDesignChat cancels an idle stream deterministically", async () => {
  const state = {};
  const response = new Response(new ReadableStream({
    pull() {
      return new Promise(() => {});
    },
    cancel() {
      state.cancelled = true;
    },
  }), { status: 200 });

  await assert.rejects(
    streamOpenDesignChat(
      "http://open-design.test",
      { prompt: "test" },
      options(async () => response, { idleTimeoutMs: 100, totalTimeoutMs: 2_000 }),
    ),
    /timed out while reading/,
  );
  assert.equal(state.cancelled, true);
});

test("streamOpenDesignChat enforces the total request timeout", async () => {
  const state = {};
  const response = new Response(new ReadableStream({
    pull() {
      return new Promise(() => {});
    },
    cancel() {
      state.cancelled = true;
    },
  }), { status: 200 });

  await assert.rejects(
    streamOpenDesignChat(
      "http://open-design.test",
      { prompt: "test" },
      options(async () => response, { idleTimeoutMs: 2_000, totalTimeoutMs: 1_000 }),
    ),
    /Open Design request timed out$/,
  );
  assert.equal(state.cancelled, true);
});

test("streamOpenDesignChat cancels the reader on an agent error event", async () => {
  const state = {};
  const errorFrame = "event: error\ndata: {\"message\":\"upstream failed\"}\n\n";

  await assert.rejects(
    streamOpenDesignChat(
      "http://open-design.test",
      { prompt: "test" },
      options(async () => chatResponse([errorFrame, "event: stdout\ndata: {}\n\n"], state)),
    ),
    /Open Design agent error: upstream failed/,
  );
  assert.equal(state.cancelled, true);
});
