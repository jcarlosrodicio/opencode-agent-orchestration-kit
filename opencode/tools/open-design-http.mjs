const DEFAULT_LIMITS = Object.freeze({
  connectTimeoutMs: 5_000,
  totalTimeoutMs: 120_000,
  idleTimeoutMs: 15_000,
  maxJsonBytes: 1_048_576,
  maxSseBytes: 8_388_608,
  maxOutputBytes: 2_097_152,
  maxEvents: 10_000,
  maxDiagnosticBytes: 4_000,
});

const LIMIT_BOUNDS = Object.freeze({
  connectTimeoutMs: [100, 60_000],
  totalTimeoutMs: [1_000, 300_000],
  idleTimeoutMs: [100, 60_000],
  maxJsonBytes: [1_024, 8_388_608],
  maxSseBytes: [1_024, 16_777_216],
  maxOutputBytes: [1_024, 8_388_608],
  maxEvents: [1, 100_000],
  maxDiagnosticBytes: [256, 16_000],
});

const encoder = new TextEncoder();

export const OPEN_DESIGN_HTTP_LIMITS = DEFAULT_LIMITS;

function resolveLimits(overrides = {}) {
  return Object.fromEntries(
    Object.entries(DEFAULT_LIMITS).map(([name, fallback]) => {
      const [minimum, maximum] = LIMIT_BOUNDS[name];
      const value = Number(overrides[name]);
      return [
        name,
        Number.isFinite(value)
          ? Math.min(maximum, Math.max(minimum, Math.floor(value)))
          : fallback,
      ];
    }),
  );
}

function stringify(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function preview(value, maxBytes) {
  const text = stringify(value);
  if (encoder.encode(text).byteLength <= maxBytes) return text;

  let result = text.slice(0, Math.max(0, maxBytes - 3));
  while (result && encoder.encode(`${result}...`).byteLength > maxBytes) {
    result = result.slice(0, -1);
  }
  return `${result}...`;
}

function tailPreview(value, maxBytes) {
  const text = stringify(value);
  if (encoder.encode(text).byteLength <= maxBytes) return text;

  let result = text.slice(-Math.max(0, maxBytes - 3));
  while (result && encoder.encode(`...${result}`).byteLength > maxBytes) {
    result = result.slice(1);
  }
  return `...${result}`;
}

function timeoutError(message) {
  return new Error(`Open Design request ${message}`);
}

function createBudget(limits) {
  const controller = new AbortController();
  let failure = null;
  let connectTimer;
  let totalTimer;
  let rejectConnectTimeout;
  let rejectTotalTimeout;

  const abort = (error) => {
    if (failure) return failure;
    failure = error instanceof Error ? error : new Error(String(error));
    controller.abort(failure);
    return failure;
  };

  const connectTimeout = new Promise((_, reject) => {
    rejectConnectTimeout = reject;
    connectTimer = setTimeout(() => {
      const error = abort(timeoutError("timed out while connecting"));
      rejectConnectTimeout(error);
    }, limits.connectTimeoutMs);
  });
  const totalTimeout = new Promise((_, reject) => {
    rejectTotalTimeout = reject;
    totalTimer = setTimeout(() => {
      const error = abort(timeoutError("timed out"));
      rejectTotalTimeout(error);
    }, limits.totalTimeoutMs);
  });
  void totalTimeout.catch(() => {});

  return {
    signal: controller.signal,
    connectTimeout,
    totalTimeout,
    markHeadersReceived() {
      clearTimeout(connectTimer);
    },
    abort,
    errorOr(error) {
      return failure || error;
    },
    dispose() {
      clearTimeout(connectTimer);
      clearTimeout(totalTimer);
    },
  };
}

async function fetchWithBudget(url, init, options) {
  const limits = resolveLimits(options);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("Open Design requires a fetch implementation");
  }

  const budget = createBudget(limits);
  try {
    const response = await Promise.race([
      Promise.resolve().then(() => fetchImpl(url, { ...init, signal: budget.signal })),
      budget.connectTimeout,
      budget.totalTimeout,
    ]);
    budget.markHeadersReceived();
    return { response, budget, limits };
  } catch (error) {
    const failure = budget.errorOr(error);
    budget.dispose();
    throw failure;
  }
}

async function readWithIdleTimeout(reader, budget, idleTimeoutMs) {
  let timer;
  try {
    return await Promise.race([
      reader.read(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(budget.abort(timeoutError("timed out while reading")));
        }, idleTimeoutMs);
      }),
      budget.totalTimeout,
    ]);
  } catch (error) {
    throw budget.errorOr(error);
  } finally {
    clearTimeout(timer);
  }
}

async function cancelResponseBody(response) {
  try {
    await response.body?.cancel?.();
  } catch {
    // The response is already being aborted; cancellation is best-effort.
  }
}

async function readBoundedText(response, budget, limits, label, maxBytes = limits.maxJsonBytes) {
  const contentLength = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    const error = new Error(`${label} response exceeds ${maxBytes} bytes`);
    budget.abort(error);
    await cancelResponseBody(response);
    throw error;
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parts = [];
  let bytes = 0;

  try {
    while (true) {
      const { value, done } = await readWithIdleTimeout(reader, budget, limits.idleTimeoutMs);
      if (done) break;

      bytes += value.byteLength;
      if (bytes > maxBytes) {
        const error = new Error(`${label} response exceeds ${maxBytes} bytes`);
        budget.abort(error);
        throw error;
      }
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
    return parts.join("");
  } catch (error) {
    budget.abort(error);
    await reader.cancel().catch(() => {});
    throw budget.errorOr(error);
  } finally {
    reader.releaseLock();
  }
}

export async function requestJson(base, path, init = {}, options = {}) {
  const { response, budget, limits } = await fetchWithBudget(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  }, options);

  try {
    const text = await readBoundedText(response, budget, limits, `Open Design ${path}`);
    let body = text;

    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }

    if (!response.ok) {
      throw new Error(
        `Open Design ${path} failed (${response.status}): ${preview(body, limits.maxDiagnosticBytes)}`,
      );
    }

    return body;
  } finally {
    budget.dispose();
  }
}

function eventDelimiter(input) {
  const candidates = [
    [input.indexOf("\r\n\r\n"), 4],
    [input.indexOf("\n\n"), 2],
    [input.indexOf("\r\r"), 2],
  ].filter(([index]) => index !== -1);

  return candidates.sort(([left], [right]) => left - right)[0] ?? null;
}

export function parseSseFrames(buffer) {
  const frames = [];
  let rest = buffer;

  while (true) {
    const delimiter = eventDelimiter(rest);
    if (!delimiter) break;

    const [index, length] = delimiter;
    const raw = rest.slice(0, index);
    rest = rest.slice(index + length);

    let event = "message";
    const dataLines = [];
    for (const line of raw.split(/\r\n|\n|\r/)) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
    }

    const dataText = dataLines.join("\n");
    let data = dataText;
    try {
      data = dataText ? JSON.parse(dataText) : null;
    } catch {
      // Keep non-JSON SSE payloads as text.
    }
    frames.push({ event, data });
  }

  return { frames, rest };
}

function appendOutput(parts, bytes, value, limits) {
  const text = String(value ?? "");
  const nextBytes = bytes + encoder.encode(text).byteLength;
  if (nextBytes > limits.maxOutputBytes) {
    throw new Error(`Open Design stdout/stderr output exceeds ${limits.maxOutputBytes} bytes`);
  }
  parts.push(text);
  return nextBytes;
}

export async function streamOpenDesignChat(base, body, options = {}) {
  const { response, budget, limits } = await fetchWithBudget(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, options);

  try {
    if (!response.ok || !response.body) {
      const text = await readBoundedText(response, budget, limits, "Open Design chat");
      throw new Error(`Open Design chat failed (${response.status}): ${preview(text, limits.maxDiagnosticBytes)}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const stdoutParts = [];
    const stderrParts = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let buffer = "";
    let streamBytes = 0;
    let end = null;
    let eventsCount = 0;

    try {
      while (true) {
        const { value, done } = await readWithIdleTimeout(reader, budget, limits.idleTimeoutMs);
        if (done) {
          buffer += decoder.decode();
          break;
        }

        streamBytes += value.byteLength;
        if (streamBytes > limits.maxSseBytes) {
          throw new Error(`Open Design SSE response exceeds ${limits.maxSseBytes} bytes`);
        }

        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSseFrames(buffer);
        buffer = parsed.rest;

        for (const frame of parsed.frames) {
          eventsCount += 1;
          if (eventsCount > limits.maxEvents) {
            throw new Error(`Open Design SSE event count exceeds ${limits.maxEvents}`);
          }

          if (frame.event === "stdout") {
            stdoutBytes = appendOutput(stdoutParts, stdoutBytes, frame.data?.chunk, limits);
          }
          if (frame.event === "stderr") {
            stderrBytes = appendOutput(stderrParts, stderrBytes, frame.data?.chunk, limits);
          }
          if (frame.event === "agent") {
            if (typeof frame.data?.delta === "string") {
              stdoutBytes = appendOutput(stdoutParts, stdoutBytes, frame.data.delta, limits);
            }
            if (typeof frame.data?.text === "string") {
              stdoutBytes = appendOutput(stdoutParts, stdoutBytes, frame.data.text, limits);
            }
          }
          if (frame.event === "end") end = frame.data;
          if (frame.event === "error") {
            throw new Error(
              `Open Design agent error: ${preview(frame.data?.message ?? frame.data, limits.maxDiagnosticBytes)}`,
            );
          }
        }
      }

      if (buffer.trim()) {
        throw new Error("Open Design SSE stream ended with an incomplete event");
      }
      if (end && typeof end.code === "number" && end.code !== 0) {
        throw new Error(`Open Design agent exited with code ${end.code}\n${tailPreview(stderrParts.join(""), 1_000)}`);
      }

      return { stdout: stdoutParts.join(""), stderr: stderrParts.join(""), end, eventsCount };
    } catch (error) {
      budget.abort(error);
      await reader.cancel().catch(() => {});
      throw budget.errorOr(error);
    } finally {
      reader.releaseLock();
    }
  } finally {
    budget.dispose();
  }
}
