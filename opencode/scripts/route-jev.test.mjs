import test from "node:test";
import assert from "node:assert/strict";
import { route } from "./route-jev.mjs";

const KEY = { OAK_ROUTER: "jev", JEV_API_KEY: "k" };
const answer = (choice, confidence) => ({
  ok: true,
  json: async () => ({ model: "jev-1.13.0", answers: { route: { type: "choice", choice, confidence, probabilities: {} } } }),
});

// Every one of these must degrade, never throw: a caller that gets
// `unavailable` routes on its own exactly as if the router did not exist.
test("disabled unless OAK_ROUTER is exactly jev", async () => {
  for (const env of [{}, { OAK_ROUTER: "" }, { OAK_ROUTER: "JEV" }, { OAK_ROUTER: "other", JEV_API_KEY: "k" }]) {
    const r = await route("x", env, () => assert.fail("must not reach the network"));
    assert.equal(r.status, "unavailable");
  }
});

test("enabled without a key degrades instead of failing", async () => {
  const r = await route("x", { OAK_ROUTER: "jev" }, () => assert.fail("must not reach the network"));
  assert.equal(r.status, "unavailable");
  assert.match(r.reason, /JEV_API_KEY/);
});

test("network failure, timeout and non-2xx all degrade", async () => {
  const cases = [
    () => { throw Object.assign(new Error("boom"), { name: "TypeError" }); },
    () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }); },
    async () => ({ ok: false, status: 503 }),
    async () => ({ ok: true, json: async () => { throw new Error("bad json"); } }),
  ];
  for (const f of cases) {
    const r = await route("x", KEY, f);
    assert.equal(r.status, "unavailable");
  }
});

test("an answer outside the declared agents is refused", async () => {
  const r = await route("x", KEY, async () => answer("evolver", 0.99));
  assert.equal(r.status, "unavailable");
});

test("an answer without usable confidence is refused", async () => {
  for (const c of [undefined, null, "high", Number.NaN]) {
    const r = await route("x", KEY, async () => answer("developer", c));
    assert.equal(r.status, "unavailable");
  }
});

test("low confidence asks the user instead of choosing silently", async () => {
  const r = await route("x", KEY, async () => answer("developer", 0.4));
  assert.equal(r.status, "low_confidence");
  assert.equal(r.route, "ask_user");
});

test("a confident answer is returned as a route", async () => {
  const r = await route("x", KEY, async () => answer("specifier", 0.95));
  assert.equal(r.status, "ok");
  assert.equal(r.route, "specifier");
  assert.equal(r.confidence, 0.95);
});

test("only the request text leaves the machine", async () => {
  let sent;
  await route("just this", KEY, async (_url, init) => { sent = JSON.parse(init.body); return answer("developer", 0.99); });
  assert.equal(sent.state, "just this");
  assert.deepEqual(Object.keys(sent).sort(), ["model", "questions", "state"]);
});
