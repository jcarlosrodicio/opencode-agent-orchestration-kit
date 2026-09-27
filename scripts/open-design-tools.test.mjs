import assert from "node:assert/strict";
import test from "node:test";

const { OPEN_DESIGN_TOOLS, openDesignJsonSchema } = await import("../opencode/tools/open-design-tools.mjs");

test("defines the six Open Design tools in their historical order", () => {
  assert.deepEqual(
    OPEN_DESIGN_TOOLS.map((definition) => definition.name),
    ["health", "list_agents", "list_skills", "list_design_systems", "create_project", "run_design"],
  );
});

test("every tool accepts an optional baseUrl", () => {
  for (const definition of OPEN_DESIGN_TOOLS) {
    assert.equal(definition.args.baseUrl, "optional", definition.name);
  }
});

test("run_design requires name, prompt and skillId", () => {
  const runDesign = OPEN_DESIGN_TOOLS.find((definition) => definition.name === "run_design");
  assert.deepEqual(openDesignJsonSchema(runDesign.args).required, ["name", "prompt", "skillId"]);
});

test("JSON schema is a closed object of strings", () => {
  assert.deepEqual(openDesignJsonSchema({ baseUrl: "optional", name: "required" }), {
    type: "object",
    properties: { baseUrl: { type: "string" }, name: { type: "string" } },
    required: ["name"],
    additionalProperties: false,
  });
});

test("rejects a project URL as the base URL before any network call", async () => {
  const health = OPEN_DESIGN_TOOLS.find((definition) => definition.name === "health");
  await assert.rejects(
    health.execute({ baseUrl: "https://open-design.example.com/projects/abc" }),
    /must be the Open Design base URL/,
  );
});

test("requires OPEN_DESIGN_URL when no baseUrl is given", async (t) => {
  const previous = process.env.OPEN_DESIGN_URL;
  delete process.env.OPEN_DESIGN_URL;
  t.after(() => {
    if (previous !== undefined) process.env.OPEN_DESIGN_URL = previous;
  });
  const health = OPEN_DESIGN_TOOLS.find((definition) => definition.name === "health");
  await assert.rejects(health.execute({}), /OPEN_DESIGN_URL is not set/);
});
