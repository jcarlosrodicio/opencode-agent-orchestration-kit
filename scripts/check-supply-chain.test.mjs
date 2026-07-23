import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  checkSupplyChain,
  validateSupplyChainData,
} from "./check-supply-chain.mjs";

const SCRIPTS_ROOT = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_FILES = [
  "CODE_OF_CONDUCT.md", "CONTRIBUTING.md", "NOTICE.md", "README.md",
  "SECURITY.md", "compatibility.json", "docker/", "docs/", "doctor.sh",
  "env.example", "install.sh", "opencode/", "rollback.sh", "scripts/",
  "supply-chain.json", "uninstall.sh", "upgrade.sh",
];

const VALID = {
  schema_version: 1,
  external_refs: {
    superpowers: {
      release: "v6.1.1",
      commit: "d884ae04edebef577e82ff7c4e143debd0bbec99",
    },
    actions_checkout: {
      release: "v6",
      commit: "d23441a48e516b6c34aea4fa41551a30e30af803",
    },
    actions_setup_node: {
      release: "v6",
      commit: "249970729cb0ef3589644e2896645e5dc5ba9c38",
    },
    open_design: {
      commit: "1592beb96134f9d49b8a90dc6a359b94a69af57e",
    },
    node_image: {
      tag: "24-bookworm-slim",
      digest: "sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d",
    },
    pnpm: { version: "10.33.2" },
    opencode_ai: { version: "1.14.31" },
  },
  npm_overrides: {
    "@babel/core": "7.29.7",
    uuid: "14.0.0",
  },
};

function cloneValid() {
  return structuredClone(VALID);
}

function expectInvalid(mutator, message) {
  const data = cloneValid();
  mutator(data);
  assert.throws(
    () => validateSupplyChainData(data),
    (error) => error.code === "INVALID_SUPPLY_CHAIN" && error.message.includes(message),
  );
}

function withFixture(data, callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "supply-chain-test-"));
  try {
    fs.writeFileSync(path.join(root, "supply-chain.json"), `${JSON.stringify(data)}\n`);
    return callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const SUPERPOWERS_REF = `superpowers@git+https://github.com/obra/superpowers.git#${VALID.external_refs.superpowers.commit}`;
const CHECKOUT_USE = `actions/checkout@${VALID.external_refs.actions_checkout.commit} # ${VALID.external_refs.actions_checkout.release}`;
const SETUP_NODE_USE = `actions/setup-node@${VALID.external_refs.actions_setup_node.commit} # ${VALID.external_refs.actions_setup_node.release}`;

function canonicalPolicy() {
  return `# Supply-chain policy

<!-- supply-chain-pins:start -->
| Surface | Reviewed label | Immutable identifier |
|---|---|---|
| Superpowers | ${VALID.external_refs.superpowers.release} | \`${VALID.external_refs.superpowers.commit}\` |
| actions/checkout | ${VALID.external_refs.actions_checkout.release} | \`${VALID.external_refs.actions_checkout.commit}\` |
| actions/setup-node | ${VALID.external_refs.actions_setup_node.release} | \`${VALID.external_refs.actions_setup_node.commit}\` |
| Open Design | reviewed commit | \`${VALID.external_refs.open_design.commit}\` |
| Node image | ${VALID.external_refs.node_image.tag} | \`${VALID.external_refs.node_image.digest}\` |
| pnpm | ${VALID.external_refs.pnpm.version} | exact version |
| opencode-ai | ${VALID.external_refs.opencode_ai.version} | exact version |
| @babel/core override | ${VALID.npm_overrides["@babel/core"]} | exact version |
| uuid override | ${VALID.npm_overrides.uuid} | exact version |
<!-- supply-chain-pins:end -->

Automated installs with intact shipped manifests use \`npm ci --ignore-scripts\`.
The canonical checksum format is \`<64 lowercase hexadecimal characters>  opencode-agent-orchestration-kit-<version>.tgz\`.
Publication is never performed by checks and requires separate explicit authorization.
`;
}

function writeValidDocumentation(root) {
  fs.mkdirSync(path.join(root, "docs/superpowers/specs"), { recursive: true });
  fs.mkdirSync(path.join(root, "docs/superpowers/plans"), { recursive: true });
  fs.mkdirSync(path.join(root, "docs/releases"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs/supply-chain.md"), canonicalPolicy());
  fs.writeFileSync(path.join(root, "README.md"), `${SUPERPOWERS_REF}\nnpm ci --ignore-scripts\n`);
  fs.writeFileSync(path.join(root, "docs/superpowers.md"), `${SUPERPOWERS_REF}\n`);
  fs.writeFileSync(
    path.join(root, "docs/docker-open-design.md"),
    `node:${VALID.external_refs.node_image.tag}@${VALID.external_refs.node_image.digest}\nOPEN_DESIGN_REF=${VALID.external_refs.open_design.commit}\nOPENCODE_AI_VERSION=${VALID.external_refs.opencode_ai.version}\npnpm@${VALID.external_refs.pnpm.version} with pnpm install --frozen-lockfile\n`,
  );
  fs.writeFileSync(path.join(root, "docs/installation.md"), "npm ci --ignore-scripts\n");
  fs.writeFileSync(path.join(root, "docs/quickstart.md"), "npm ci --ignore-scripts\nnpm run check:release\n");
  fs.writeFileSync(path.join(root, "docs/compatibility.md"), "core smoke\ndefault-config smoke\n");
  fs.writeFileSync(path.join(root, "docs/security.md"), "npm audit signatures\npackage-smoked tarball\nSHA-256 checksum\n");
  fs.writeFileSync(path.join(root, "docs/workflows.md"), "package artifact\nchecksum\npost-publication verification\n");
}

function writeValidSurfaceFiles(root) {
  fs.mkdirSync(path.join(root, "opencode"), { recursive: true });
  fs.writeFileSync(path.join(root, "opencode/opencode.json"), `${JSON.stringify({
    plugin: [SUPERPOWERS_REF],
  })}\n`);
  fs.mkdirSync(path.join(root, ".github/workflows"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".github/workflows/check.yml"),
    `steps:\n  - uses: ${CHECKOUT_USE}\n  - uses: ${SETUP_NODE_USE}\n  - working-directory: opencode\n    run: npm ci --ignore-scripts\n`,
  );
  fs.writeFileSync(
    path.join(root, ".github/workflows/compatibility-canary.yml"),
    `# compatibility-canary:start\nsteps:\n  - uses: ${CHECKOUT_USE}\n  - uses: ${SETUP_NODE_USE}\n  - run: bash scripts/opencode-compat-smoke.sh latest\n# compatibility-canary:end\n`,
  );
  fs.mkdirSync(path.join(root, "docker/open-design"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "docker/open-design/Dockerfile"),
    `FROM node:${VALID.external_refs.node_image.tag}@${VALID.external_refs.node_image.digest}\nARG OPEN_DESIGN_REF=${VALID.external_refs.open_design.commit}\nARG OPENCODE_AI_VERSION=${VALID.external_refs.opencode_ai.version}\nRUN corepack prepare pnpm@${VALID.external_refs.pnpm.version} --activate \\\n  && pnpm install --frozen-lockfile\n`,
  );
  fs.appendFileSync(
    path.join(root, "docker/open-design/Dockerfile"),
    'RUN git checkout "$OPEN_DESIGN_REF"\nRUN npm install -g "opencode-ai@$OPENCODE_AI_VERSION"\n',
  );
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "scripts/package-smoke.sh"),
    "#!/usr/bin/env bash\nset -euo pipefail\nexec node scripts/package-smoke.mjs \"$@\"\n",
    { mode: 0o755 },
  );
  fs.writeFileSync(path.join(root, "scripts/package-smoke.mjs"), "export {};\n");
}

function withSurfaceFixture(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "supply-chain-surfaces-test-"));
  try {
    fs.writeFileSync(path.join(root, "supply-chain.json"), `${JSON.stringify(VALID)}\n`);
    fs.writeFileSync(path.join(root, "package.json"), `${JSON.stringify({
      files: PACKAGE_FILES,
      scripts: {
        "dependency-audit": "npm --prefix opencode audit --omit=dev --audit-level=low",
        "dependency-signature-audit": "npm --prefix opencode audit signatures",
        "check:release": "npm --prefix opencode ci --ignore-scripts && npm run check",
        "package-smoke": "bash scripts/package-smoke.sh",
      },
    })}\n`);
    writeValidSurfaceFiles(root);
    writeValidDocumentation(root);
    fs.writeFileSync(path.join(root, "opencode/package.json"), `${JSON.stringify({
      overrides: { ...VALID.npm_overrides },
    })}\n`);
    fs.writeFileSync(path.join(root, "opencode/package-lock.json"), `${JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": {},
        "node_modules/@babel/core": {
          version: VALID.npm_overrides["@babel/core"],
          resolved: "https://registry.npmjs.org/@babel/core/-/core-7.29.7.tgz",
          integrity: "sha512-babel",
        },
        "node_modules/uuid": {
          version: VALID.npm_overrides.uuid,
          resolved: "https://registry.npmjs.org/uuid/-/uuid-14.0.0.tgz",
          integrity: "sha512-uuid",
        },
        "node_modules/example": {
          version: "1.2.3",
          resolved: "https://registry.npmjs.org/example/-/example-1.2.3.tgz",
          integrity: "sha512-example",
        },
      },
    })}\n`);
    fs.writeFileSync(path.join(root, "scripts/install-smoke.sh"), "#!/usr/bin/env bash\nnpm ci --ignore-scripts\n", { mode: 0o755 });
    return callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function withCliFixture(inventory, callback) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "supply-chain-cli-test-")));
  const scripts = path.join(root, "scripts");
  try {
    fs.mkdirSync(scripts);
    fs.copyFileSync(path.join(SCRIPTS_ROOT, "check-supply-chain.mjs"), path.join(scripts, "check-supply-chain.mjs"));
    fs.copyFileSync(path.join(SCRIPTS_ROOT, "version.mjs"), path.join(scripts, "version.mjs"));
    if (inventory !== undefined) {
      const contents = typeof inventory === "string" ? inventory : `${JSON.stringify(inventory)}\n`;
      fs.writeFileSync(path.join(root, "supply-chain.json"), contents);
      if (typeof inventory !== "string") {
        writeValidSurfaceFiles(root);
        writeValidDocumentation(root);
        fs.writeFileSync(path.join(root, "package.json"), `${JSON.stringify({
          files: PACKAGE_FILES,
          scripts: {
            "dependency-audit": "npm --prefix opencode audit --omit=dev --audit-level=low",
            "dependency-signature-audit": "npm --prefix opencode audit signatures",
            "package-smoke": "bash scripts/package-smoke.sh",
          },
        })}\n`);
        fs.writeFileSync(path.join(root, "opencode/package.json"), `${JSON.stringify({
          overrides: { ...VALID.npm_overrides },
        })}\n`);
        fs.writeFileSync(path.join(root, "opencode/package-lock.json"), `${JSON.stringify({
          packages: Object.fromEntries(Object.entries(VALID.npm_overrides).map(([name, version]) => [
            `node_modules/${name}`,
            { version, resolved: `https://registry.npmjs.org/${name}/fixture.tgz`, integrity: "sha512-fixture" },
          ])),
        })}\n`);
      }
    }
    const result = spawnSync(process.execPath, [path.join(scripts, "check-supply-chain.mjs")], {
      cwd: root,
      encoding: "utf8",
    });
    return callback(result);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("accepts the canonical supply-chain schema", () => {
  assert.deepEqual(validateSupplyChainData(cloneValid()), VALID);
});

test("rejects missing and unknown keys at every schema level", () => {
  expectInvalid((data) => delete data.npm_overrides, "supply chain keys");
  expectInvalid((data) => { data.unknown = true; }, "supply chain keys");
  expectInvalid((data) => delete data.external_refs.pnpm, "external_refs keys");
  expectInvalid((data) => { data.external_refs.unknown = {}; }, "external_refs keys");
  expectInvalid((data) => delete data.external_refs.superpowers.commit, "external_refs.superpowers keys");
  expectInvalid((data) => { data.external_refs.node_image.unknown = true; }, "external_refs.node_image keys");
  expectInvalid((data) => delete data.npm_overrides.uuid, "npm_overrides keys");
  expectInvalid((data) => { data.npm_overrides.extra = "1.0.0"; }, "npm_overrides keys");
});

test("requires schema version 1", () => {
  expectInvalid((data) => { data.schema_version = 2; }, "schema_version must be 1");
});

test("requires lowercase full-length immutable commits", () => {
  expectInvalid(
    (data) => { data.external_refs.superpowers.commit = "D884AE04EDEBEF577E82FF7C4E143DEBD0BBEC99"; },
    "external_refs.superpowers.commit",
  );
  expectInvalid(
    (data) => { data.external_refs.open_design.commit = "1592beb"; },
    "external_refs.open_design.commit",
  );
});

test("requires a lowercase sha256 digest", () => {
  expectInvalid(
    (data) => { data.external_refs.node_image.digest = "sha256:not-a-digest"; },
    "external_refs.node_image.digest",
  );
  expectInvalid(
    (data) => { data.external_refs.node_image.digest = `sha256:${"A".repeat(64)}`; },
    "external_refs.node_image.digest",
  );
});

test("requires canonical release labels", () => {
  expectInvalid(
    (data) => { data.external_refs.superpowers.release = "6.1.1"; },
    "external_refs.superpowers.release",
  );
  expectInvalid(
    (data) => { data.external_refs.actions_checkout.release = "v0"; },
    "external_refs.actions_checkout.release",
  );
  expectInvalid(
    (data) => { data.external_refs.actions_setup_node.release = "v6.0.0"; },
    "external_refs.actions_setup_node.release",
  );
});

test("requires exact canonical versions without ranges", () => {
  expectInvalid(
    (data) => { data.external_refs.pnpm.version = "^10.33.2"; },
    "external_refs.pnpm.version",
  );
  expectInvalid(
    (data) => { data.external_refs.opencode_ai.version = "01.14.31"; },
    "external_refs.opencode_ai.version",
  );
  expectInvalid(
    (data) => { data.npm_overrides["@babel/core"] = ">=7.29.7"; },
    "npm_overrides.@babel/core",
  );
  expectInvalid(
    (data) => { data.npm_overrides.uuid = "14.0"; },
    "npm_overrides.uuid",
  );
});

test("reads a safe regular canonical inventory without surface checks", () => {
  withFixture(VALID, (root) => {
    assert.deepEqual(checkSupplyChain(root, { surfaces: false }), VALID);
  });
});

test("surface validation accepts exact overrides, regenerated lock entries, and frozen automated installs", () => {
  withSurfaceFixture((root) => {
    assert.deepEqual(checkSupplyChain(root), VALID);
  });
});

test("surface validation requires the exact Superpowers commit", () => {
  withSurfaceFixture((root) => {
    const relative = "opencode/opencode.json";
    const config = JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
    config.plugin = ["superpowers@git+https://github.com/obra/superpowers.git"];
    fs.writeFileSync(path.join(root, relative), `${JSON.stringify(config)}\n`);
    assert.throws(() => checkSupplyChain(root), /superpowers.*full reviewed commit/i);
  });
});

for (const [label, replacement, message] of [
  ["major tag", "actions/checkout@v6 # v6", /full commit/i],
  ["short SHA", "actions/checkout@d23441a # v6", /full commit/i],
  ["missing release comment", `actions/checkout@${VALID.external_refs.actions_checkout.commit}`, /release comment.*v6/i],
  ["malformed release comment", `actions/checkout@${VALID.external_refs.actions_checkout.commit} #v6`, /uses syntax/i],
  ["unapproved tuple", `actions/cache@${VALID.external_refs.actions_checkout.commit} # v6`, /not present in supply-chain\.json/i],
]) {
  test(`surface validation rejects an Action ${label}`, () => {
    withSurfaceFixture((root) => {
      const relative = ".github/workflows/check.yml";
      const workflow = fs.readFileSync(path.join(root, relative), "utf8").replace(CHECKOUT_USE, replacement);
      fs.writeFileSync(path.join(root, relative), workflow);
      assert.throws(() => checkSupplyChain(root), message);
    });
  });
}

test("surface validation rejects undeclared latest in a stable workflow", () => {
  withSurfaceFixture((root) => {
    const relative = ".github/workflows/check.yml";
    fs.appendFileSync(path.join(root, relative), "  - run: npx stable-tool@latest\n");
    assert.throws(() => checkSupplyChain(root), /@latest.*stable/i);
  });
});

test("surface validation rejects a mutable git clone branch in a stable workflow command", () => {
  withSurfaceFixture((root) => {
    const relative = ".github/workflows/check.yml";
    fs.appendFileSync(
      path.join(root, relative),
      "  - run: git clone --branch main https://github.com/example/helper.git /tmp/helper\n",
    );
    assert.throws(() => checkSupplyChain(root), /mutable git clone --branch/i);
  });
});

test("surface validation rejects an npm exec mutable major tag in a stable workflow command", () => {
  withSurfaceFixture((root) => {
    const relative = ".github/workflows/check.yml";
    fs.appendFileSync(
      path.join(root, relative),
      "  - run: npm exec example-cli@v6 -- --help\n",
    );
    assert.throws(() => checkSupplyChain(root), /npm exec.*mutable major tag/i);
  });
});

test("surface validation rejects a scoped npm exec mutable major tag", () => {
  withSurfaceFixture((root) => {
    const relative = ".github/workflows/check.yml";
    fs.appendFileSync(
      path.join(root, relative),
      "  - run: npm exec @scope/example-cli@v6 -- --help\n",
    );
    assert.throws(() => checkSupplyChain(root), /npm exec.*mutable major tag/i);
  });
});

test("surface validation accepts a scoped npm exec exact version", () => {
  withSurfaceFixture((root) => {
    fs.appendFileSync(
      path.join(root, ".github/workflows/check.yml"),
      "  - run: npm exec @scope/example-cli@6.1.0 -- --help\n",
    );
    assert.deepEqual(checkSupplyChain(root), VALID);
  });
});

for (const [label, command] of [
  ["plain", "npx example-cli@v6 --help"],
  ["scoped", "npx @scope/example-cli@v6 --help"],
  ["continued", "npx \\\n        example-cli@v6 --help"],
]) {
  test(`surface validation rejects a ${label} npx mutable major tag`, () => {
    withSurfaceFixture((root) => {
      fs.appendFileSync(
        path.join(root, ".github/workflows/check.yml"),
        `  - run: |\n      ${command}\n`,
      );
      assert.throws(() => checkSupplyChain(root), /npx.*mutable major tag/i);
    });
  });
}

test("surface validation accepts exact npx versions", () => {
  withSurfaceFixture((root) => {
    fs.appendFileSync(
      path.join(root, ".github/workflows/check.yml"),
      "  - run: npx example-cli@6.1.0 --help\n  - run: npx @scope/example-cli@6.1.0 --help\n",
    );
    assert.deepEqual(checkSupplyChain(root), VALID);
  });
});

test("surface validation ignores commented and quoted npx major examples", () => {
  withSurfaceFixture((root) => {
    fs.appendFileSync(
      path.join(root, ".github/workflows/check.yml"),
      "  # npx example-cli@v6 --help\n  - run: echo 'npx example-cli@v6 --help'\n  - run: echo \"npx @scope/example-cli@v6 --help\"\n",
    );
    assert.deepEqual(checkSupplyChain(root), VALID);
  });
});

test("surface validation accepts immutable Git and exact npm versions in stable commands", () => {
  withSurfaceFixture((root) => {
    fs.appendFileSync(
      path.join(root, ".github/workflows/check.yml"),
      `  - run: git clone --branch ${VALID.external_refs.open_design.commit} https://github.com/example/helper.git /tmp/helper\n  - run: npm exec example-cli@6.1.0 -- --help\n`,
    );
    assert.deepEqual(checkSupplyChain(root), VALID);
  });
});

test("surface validation ignores commented and quoted latest examples", () => {
  withSurfaceFixture((root) => {
    fs.appendFileSync(
      path.join(root, ".github/workflows/check.yml"),
      "  # npx historical-tool@latest\n  - run: echo 'npx documented-tool@latest'\n  - run: echo 'git clone --branch main https://github.com/example/helper.git /tmp/helper'\n  - run: echo 'npm exec example-cli@v6 -- --help'\n",
    );
    fs.appendFileSync(
      path.join(root, "docker/open-design/Dockerfile"),
      "# RUN npx historical-tool@latest\n",
    );
    assert.deepEqual(checkSupplyChain(root), VALID);
  });
});

for (const [surface, relative, contents, message] of [
  ["workflow install", ".github/workflows/check.yml", "  - run: |\n      npm \\\n        install\n", /automated npm install is forbidden/i],
  ["script install", "scripts/continued.sh", "#!/usr/bin/env bash\nnpm \\\n  install\n", /automated npm install is forbidden/i],
  ["workflow clone", ".github/workflows/check.yml", "  - run: |\n      git clone \\\n        --branch main https://github.com/example/helper.git\n", /mutable git clone --branch/i],
  ["script clone", "scripts/continued.sh", "#!/usr/bin/env bash\ngit clone \\\n  --branch main https://github.com/example/helper.git\n", /mutable git clone --branch/i],
  ["workflow npm exec", ".github/workflows/check.yml", "  - run: |\n      npm exec \\\n        example-cli@v6\n", /npm exec.*mutable major tag/i],
  ["script npm exec", "scripts/continued.sh", "#!/usr/bin/env bash\nnpm exec \\\n  example-cli@v6\n", /npm exec.*mutable major tag/i],
]) {
  test(`surface validation rejects a continued ${surface}`, () => {
    withSurfaceFixture((root) => {
      fs.appendFileSync(path.join(root, relative), contents);
      if (relative.startsWith("scripts/")) fs.chmodSync(path.join(root, relative), 0o755);
      assert.throws(() => checkSupplyChain(root), message);
    });
  });
}

test("surface validation keeps comments and quoted data masked across apparent continuations", () => {
  withSurfaceFixture((root) => {
    fs.writeFileSync(
      path.join(root, "scripts/quoted-continuations.sh"),
      "#!/usr/bin/env bash\n# npm \\\ninstall\necho 'git clone \\\n--branch main example'\necho \"npm exec \\\nexample-cli@v6\"\n",
      { mode: 0o755 },
    );
    assert.deepEqual(checkSupplyChain(root), VALID);
  });
});

test("surface validation keeps multiline quoted commands masked", () => {
  withSurfaceFixture((root) => {
    fs.writeFileSync(
      path.join(root, "scripts/multiline-quoted.sh"),
      "#!/usr/bin/env bash\necho \"quoted \\\nnpm install\"\nprintf '%s' 'quoted \\\nnpm exec example-cli@v6'\n",
      { mode: 0o755 },
    );
    assert.deepEqual(checkSupplyChain(root), VALID);
  });
});

test("surface validation admits the marked OpenCode latest canary", () => {
  withSurfaceFixture((root) => {
    assert.deepEqual(checkSupplyChain(root), VALID);
  });
});

test("surface validation excludes historical specifications from active pin matching", () => {
  withSurfaceFixture((root) => {
    fs.mkdirSync(path.join(root, "docs/superpowers/specs"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "docs/superpowers/specs/history.md"),
      "uses: actions/checkout@v4\nsuperpowers@git+https://github.com/obra/superpowers.git#main\n",
    );
    assert.deepEqual(checkSupplyChain(root), VALID);
  });
});

test("documentation validation requires one ordered canonical supply-chain pin block", () => {
  for (const mutation of [
    (policy) => policy.replace("<!-- supply-chain-pins:start -->\n", ""),
    (policy) => `${policy}\n${policy}`,
    (policy) => policy.replace(
      /\| Superpowers \|[^\n]+\n\| actions\/checkout \|[^\n]+/,
      (pair) => pair.split("\n").reverse().join("\n"),
    ),
  ]) {
    withSurfaceFixture((root) => {
      const relative = "docs/supply-chain.md";
      fs.writeFileSync(path.join(root, relative), mutation(canonicalPolicy()));
      assert.throws(() => checkSupplyChain(root), /one ordered supply-chain-pins block/i);
    });
  }
});

for (const [label, current, replacement] of [
  ["Superpowers release", `| Superpowers | ${VALID.external_refs.superpowers.release} |`, "| Superpowers | DRIFTED |"],
  ["Superpowers commit", `| \`${VALID.external_refs.superpowers.commit}\` |`, "| `DRIFTED` |"],
  ["checkout release", `| actions/checkout | ${VALID.external_refs.actions_checkout.release} |`, "| actions/checkout | DRIFTED |"],
  ["checkout commit", `| \`${VALID.external_refs.actions_checkout.commit}\` |`, "| `DRIFTED` |"],
  ["setup-node release", `| actions/setup-node | ${VALID.external_refs.actions_setup_node.release} |`, "| actions/setup-node | DRIFTED |"],
  ["setup-node commit", `| \`${VALID.external_refs.actions_setup_node.commit}\` |`, "| `DRIFTED` |"],
  ["Open Design commit", `| \`${VALID.external_refs.open_design.commit}\` |`, "| `DRIFTED` |"],
  ["Node image tag", `| Node image | ${VALID.external_refs.node_image.tag} |`, "| Node image | DRIFTED |"],
  ["Node image digest", `| \`${VALID.external_refs.node_image.digest}\` |`, "| `DRIFTED` |"],
  ["pnpm", `| pnpm | ${VALID.external_refs.pnpm.version} |`, "| pnpm | DRIFTED |"],
  ["opencode-ai", `| opencode-ai | ${VALID.external_refs.opencode_ai.version} |`, "| opencode-ai | DRIFTED |"],
  ["Babel override", `| @babel/core override | ${VALID.npm_overrides["@babel/core"]} |`, "| @babel/core override | DRIFTED |"],
  ["uuid override", `| uuid override | ${VALID.npm_overrides.uuid} |`, "| uuid override | DRIFTED |"],
]) {
  test(`documentation validation rejects a drifted ${label} pin`, () => {
    withSurfaceFixture((root) => {
      const relative = "docs/supply-chain.md";
      fs.writeFileSync(path.join(root, relative), canonicalPolicy().replace(current, replacement));
      assert.throws(() => checkSupplyChain(root), /docs\/supply-chain\.md.*canonical pins/i);
    });
  });
}

for (const [label, current, message] of [
  ["frozen install policy", "npm ci --ignore-scripts", /frozen install policy/i],
  ["checksum format", "<64 lowercase hexadecimal characters>  opencode-agent-orchestration-kit-<version>.tgz", /checksum format/i],
  ["manual publication warning", "Publication is never performed by checks and requires separate explicit authorization.", /separate explicit authorization/i],
]) {
  test(`documentation validation requires the ${label}`, () => {
    withSurfaceFixture((root) => {
      const relative = "docs/supply-chain.md";
      fs.writeFileSync(path.join(root, relative), canonicalPolicy().replace(current, "missing policy"));
      assert.throws(() => checkSupplyChain(root), message);
    });
  });
}

for (const relative of ["README.md", "docs/superpowers.md"]) {
  test(`documentation validation requires active Superpowers examples in ${relative} to use the full commit`, () => {
    withSurfaceFixture((root) => {
      fs.writeFileSync(
        path.join(root, relative),
        "superpowers@git+https://github.com/obra/superpowers.git#v6.1.1\n",
      );
      assert.throws(() => checkSupplyChain(root), /active Superpowers reference.*full reviewed commit/i);
    });
  });
}

test("documentation validation excludes historical plans, specs, and releases", () => {
  withSurfaceFixture((root) => {
    for (const relative of [
      "docs/superpowers/specs/history.md",
      "docs/superpowers/plans/history.md",
      "docs/releases/history.md",
    ]) {
      fs.writeFileSync(
        path.join(root, relative),
        "superpowers@git+https://github.com/obra/superpowers.git#main\n",
      );
    }
    assert.deepEqual(checkSupplyChain(root), VALID);
  });
});

test("Docker validation ignores a historical git checkout comment", () => {
  withSurfaceFixture((root) => {
    fs.appendFileSync(
      path.join(root, "docker/open-design/Dockerfile"),
      "# historical note: git checkout main\n",
    );
    assert.deepEqual(checkSupplyChain(root), VALID);
  });
});

test("Docker validation ignores a historical pnpm preparation comment", () => {
  withSurfaceFixture((root) => {
    fs.appendFileSync(
      path.join(root, "docker/open-design/Dockerfile"),
      "# docs: corepack prepare pnpm@9.0.0 --activate\n",
    );
    assert.deepEqual(checkSupplyChain(root), VALID);
  });
});

for (const [label, current, replacement, message] of [
  ["base digest", `FROM node:${VALID.external_refs.node_image.tag}@${VALID.external_refs.node_image.digest}`, `FROM node:${VALID.external_refs.node_image.tag}`, /Dockerfile FROM.*digest/i],
  ["single FROM", `FROM node:${VALID.external_refs.node_image.tag}@${VALID.external_refs.node_image.digest}`, `FROM node:${VALID.external_refs.node_image.tag}@${VALID.external_refs.node_image.digest}\nFROM scratch`, /exactly one FROM/i],
  ["Open Design commit", `ARG OPEN_DESIGN_REF=${VALID.external_refs.open_design.commit}`, "ARG OPEN_DESIGN_REF=1592beb", /OPEN_DESIGN_REF/i],
  ["Open Design checkout", "git checkout \"$OPEN_DESIGN_REF\"", "git checkout main", /Open Design checkout/i],
  ["OpenCode version", `ARG OPENCODE_AI_VERSION=${VALID.external_refs.opencode_ai.version}`, "ARG OPENCODE_AI_VERSION=latest", /OPENCODE_AI_VERSION/i],
  ["OpenCode install", "npm install -g \"opencode-ai@$OPENCODE_AI_VERSION\"", "npm install -g \"opencode-ai@latest\"", /OpenCode install/i],
  ["pnpm version", `pnpm@${VALID.external_refs.pnpm.version}`, "pnpm@latest", /pnpm version/i],
  ["frozen pnpm install", "pnpm install --frozen-lockfile", "pnpm install --frozen-lockfile=false", /pnpm install.*frozen-lockfile/i],
]) {
  test(`surface validation rejects wrong Docker ${label}`, () => {
    withSurfaceFixture((root) => {
      const relative = "docker/open-design/Dockerfile";
      const dockerfile = fs.readFileSync(path.join(root, relative), "utf8").replace(current, replacement);
      fs.writeFileSync(path.join(root, relative), dockerfile);
      assert.throws(() => checkSupplyChain(root), message);
    });
  });
}

for (const [dependency, mutation] of [
  ["@babel/core", (packageData) => { delete packageData.overrides["@babel/core"]; }],
  ["@babel/core range", (packageData) => { packageData.overrides["@babel/core"] = "^7.29.7"; }],
  ["@babel/core wrong version", (packageData) => { packageData.overrides["@babel/core"] = "7.29.6"; }],
  ["uuid", (packageData) => { delete packageData.overrides.uuid; }],
  ["uuid range", (packageData) => { packageData.overrides.uuid = "^14.0.0"; }],
  ["uuid wrong version", (packageData) => { packageData.overrides.uuid = "13.0.0"; }],
]) {
  test(`surface validation rejects absent, ranged, or wrong ${dependency} override`, () => {
    withSurfaceFixture((root) => {
      const relative = "opencode/package.json";
      const packageData = JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
      mutation(packageData);
      fs.writeFileSync(path.join(root, relative), `${JSON.stringify(packageData)}\n`);
      assert.throws(() => checkSupplyChain(root), /opencode\/package\.json override/);
    });
  });
}

test("surface validation rejects a lockfile not regenerated to the Babel override", () => {
  withSurfaceFixture((root) => {
    const relative = "opencode/package-lock.json";
    const lock = JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
    lock.packages["node_modules/@babel/core"].version = "7.28.0";
    fs.writeFileSync(path.join(root, relative), `${JSON.stringify(lock)}\n`);
    assert.throws(() => checkSupplyChain(root), /package-lock\.json @babel\/core must resolve to 7\.29\.7/);
  });
});

for (const [label, mutate, message] of [
  ["missing resolved", (entry) => { delete entry.resolved; }, /node_modules\/example.*canonical npm registry resolved URL/i],
  ["non-registry resolved", (entry) => { entry.resolved = "https://example.invalid/example.tgz"; }, /node_modules\/example.*canonical npm registry resolved URL/i],
  ["missing integrity", (entry) => { delete entry.integrity; }, /node_modules\/example.*non-empty sha512 integrity/i],
  ["corrupt integrity", (entry) => { entry.integrity = "sha256-corrupt"; }, /node_modules\/example.*non-empty sha512 integrity/i],
]) {
  test(`surface validation rejects non-override lock entry ${label}`, () => {
    withSurfaceFixture((root) => {
      const relative = "opencode/package-lock.json";
      const lock = JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
      mutate(lock.packages["node_modules/example"]);
      fs.writeFileSync(path.join(root, relative), `${JSON.stringify(lock)}\n`);
      assert.throws(() => checkSupplyChain(root), message);
    });
  });
}

test("the committed lockfile gives every non-root package canonical registry metadata", () => {
  const lock = JSON.parse(fs.readFileSync(path.join(SCRIPTS_ROOT, "../opencode/package-lock.json"), "utf8"));
  for (const [name, entry] of Object.entries(lock.packages)) {
    if (name === "") continue;
    assert.match(entry.resolved, /^https:\/\/registry\.npmjs\.org\//, `${name} resolved`);
    assert.match(entry.integrity, /^sha512-.+/, `${name} integrity`);
  }
});

for (const [relative, current, replacement, message] of [
  ["docs/docker-open-design.md", VALID.external_refs.node_image.digest, `sha256:${"0".repeat(64)}`, /docker-open-design\.md.*Node image digest/i],
  ["docs/docker-open-design.md", VALID.external_refs.open_design.commit, "0".repeat(40), /docker-open-design\.md.*Open Design commit/i],
  ["docs/docker-open-design.md", `pnpm@${VALID.external_refs.pnpm.version}`, "pnpm@10.0.0", /docker-open-design\.md.*pnpm version/i],
  ["docs/security.md", "npm audit signatures", "npm audit --omit=dev", /security\.md.*signature audit/i],
  ["docs/security.md", "package-smoked tarball", "package directory", /security\.md.*package-smoked tarball/i],
  ["docs/quickstart.md", "npm run check:release", "npm run check", /quickstart\.md.*release gate/i],
  ["docs/workflows.md", "post-publication verification", "publication", /workflows\.md.*post-publication verification/i],
]) {
  test(`documentation validation rejects active drift in ${relative}: ${message.source}`, () => {
    withSurfaceFixture((root) => {
      const full = path.join(root, relative);
      fs.writeFileSync(full, fs.readFileSync(full, "utf8").replace(current, replacement));
      assert.throws(() => checkSupplyChain(root), message);
    });
  });
}

test("surface validation rejects automated npm ci without ignore-scripts", () => {
  withSurfaceFixture((root) => {
    const relative = ".github/workflows/check.yml";
    fs.writeFileSync(
      path.join(root, relative),
      "steps:\n  - working-directory: opencode\n    run: npm ci\n",
    );
    assert.throws(() => checkSupplyChain(root), /npm ci must include --ignore-scripts/);
  });
});

test("surface validation rejects an npm script using npm ci without ignore-scripts", () => {
  withSurfaceFixture((root) => {
    const relative = "package.json";
    const packageData = JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
    packageData.scripts["check:release"] = "npm --prefix opencode ci && npm run check";
    fs.writeFileSync(path.join(root, relative), `${JSON.stringify(packageData)}\n`);
    assert.throws(() => checkSupplyChain(root), /npm ci must include --ignore-scripts/);
  });
});

test("surface validation rejects an automated npm install fallback", () => {
  withSurfaceFixture((root) => {
    fs.writeFileSync(path.join(root, "scripts/fallback.sh"), "#!/usr/bin/env bash\nnpm install\n", { mode: 0o755 });
    assert.throws(() => checkSupplyChain(root), /automated npm install is forbidden/);
  });
});

test("surface validation rejects npm install after a shell command prefix", () => {
  withSurfaceFixture((root) => {
    fs.writeFileSync(
      path.join(root, "scripts/fallback.sh"),
      "#!/usr/bin/env bash\ncd opencode && npm install\n",
      { mode: 0o755 },
    );
    assert.throws(() => checkSupplyChain(root), /automated npm install is forbidden/);
  });
});

test("surface validation rejects npm ci after an environment assignment", () => {
  withSurfaceFixture((root) => {
    fs.writeFileSync(
      path.join(root, "scripts/assigned.sh"),
      "#!/usr/bin/env bash\nFOO=1 npm ci\n",
      { mode: 0o755 },
    );
    assert.throws(() => checkSupplyChain(root), /npm ci must include --ignore-scripts/);
  });
});

test("surface validation rejects assigned npm install after a shell command prefix", () => {
  withSurfaceFixture((root) => {
    fs.writeFileSync(
      path.join(root, "scripts/fallback.sh"),
      "#!/usr/bin/env bash\ncd opencode && FOO=1 npm install\n",
      { mode: 0o755 },
    );
    assert.throws(() => checkSupplyChain(root), /automated npm install is forbidden/);
  });
});

test("surface validation rejects npm ci after multiple POSIX assignments", () => {
  withSurfaceFixture((root) => {
    fs.writeFileSync(
      path.join(root, "scripts/assigned.sh"),
      "#!/usr/bin/env bash\nFOO='two words' BAR=2 npm ci\n",
      { mode: 0o755 },
    );
    assert.throws(() => checkSupplyChain(root), /npm ci must include --ignore-scripts/);
  });
});

test("surface validation rejects an assigned package npm ci without ignore-scripts", () => {
  withSurfaceFixture((root) => {
    const relative = "package.json";
    const packageData = JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
    packageData.scripts.assigned = "FOO=1 npm --prefix opencode ci";
    fs.writeFileSync(path.join(root, relative), `${JSON.stringify(packageData)}\n`);
    assert.throws(() => checkSupplyChain(root), /npm ci must include --ignore-scripts/);
  });
});

test("surface validation accepts an assigned frozen package npm ci", () => {
  withSurfaceFixture((root) => {
    const relative = "package.json";
    const packageData = JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
    packageData.scripts.assigned = "FOO=1 npm --prefix opencode ci --ignore-scripts";
    fs.writeFileSync(path.join(root, relative), `${JSON.stringify(packageData)}\n`);
    assert.deepEqual(checkSupplyChain(root), VALID);
  });
});

test("surface validation rejects conditional npm ci without ignore-scripts", () => {
  withSurfaceFixture((root) => {
    fs.writeFileSync(
      path.join(root, "scripts/conditional.sh"),
      "#!/usr/bin/env bash\nif test -f package-lock.json; then npm ci; fi\n",
      { mode: 0o755 },
    );
    assert.throws(() => checkSupplyChain(root), /npm ci must include --ignore-scripts/);
  });
});

test("surface validation accepts frozen npm ci after a workflow shell prefix", () => {
  withSurfaceFixture((root) => {
    const relative = ".github/workflows/check.yml";
    const workflow = fs.readFileSync(path.join(root, relative), "utf8").replace(
      "working-directory: opencode\n    run: npm ci --ignore-scripts",
      "run: cd opencode && npm ci --ignore-scripts",
    );
    fs.writeFileSync(path.join(root, relative), workflow);
    assert.deepEqual(checkSupplyChain(root), VALID);
  });
});

test("surface validation ignores comments and quoted npm command examples", () => {
  withSurfaceFixture((root) => {
    fs.writeFileSync(
      path.join(root, "scripts/examples.sh"),
      "#!/usr/bin/env bash\n# npm install\necho 'npm install'\nprintf '%s\\n' \"npm ci\"\n",
      { mode: 0o755 },
    );
    assert.deepEqual(checkSupplyChain(root), VALID);
  });
});

test("surface validation requires the frozen root audit commands", () => {
  withSurfaceFixture((root) => {
    const relative = "package.json";
    const packageData = JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
    packageData.scripts["dependency-audit"] = "npm --prefix opencode audit --omit=dev --audit-level=moderate";
    fs.writeFileSync(path.join(root, relative), `${JSON.stringify(packageData)}\n`);
    assert.throws(() => checkSupplyChain(root), /package\.json dependency-audit/);
  });
});

test("surface validation requires the exact npm package allowlist", () => {
  withSurfaceFixture((root) => {
    const relative = "package.json";
    const packageData = JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
    packageData.files = [...PACKAGE_FILES, ".github/"];
    fs.writeFileSync(path.join(root, relative), `${JSON.stringify(packageData)}\n`);
    assert.throws(() => checkSupplyChain(root), /package\.json files must be exactly/i);
  });
});

test("surface validation requires the package smoke command", () => {
  withSurfaceFixture((root) => {
    const relative = "package.json";
    const packageData = JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
    delete packageData.scripts["package-smoke"];
    fs.writeFileSync(path.join(root, relative), `${JSON.stringify(packageData)}\n`);
    assert.throws(() => checkSupplyChain(root), /package-smoke must be exactly/i);
  });
});

test("surface validation rejects root publication lifecycle hooks", () => {
  for (const hook of ["prepack", "prepare", "prepublish", "prepublishOnly"]) {
    withSurfaceFixture((root) => {
      const relative = "package.json";
      const packageData = JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
      packageData.scripts[hook] = "exit 0";
      fs.writeFileSync(path.join(root, relative), `${JSON.stringify(packageData)}\n`);
      assert.throws(() => checkSupplyChain(root), new RegExp(`forbidden root lifecycle hook ${hook}`));
    });
  }
});

test("surface validation requires an executable package smoke wrapper", () => {
  withSurfaceFixture((root) => {
    fs.chmodSync(path.join(root, "scripts/package-smoke.sh"), 0o644);
    assert.throws(() => checkSupplyChain(root), /package-smoke\.sh must be executable/i);
  });
});

for (const relative of ["scripts/package-smoke.sh", "scripts/package-smoke.mjs"]) {
  test(`surface validation rejects a symlinked ${relative}`, () => {
    withSurfaceFixture((root) => {
      const full = path.join(root, relative);
      const target = path.join(root, `${relative}.target`);
      fs.renameSync(full, target);
      fs.symlinkSync(target, full);
      assert.throws(() => checkSupplyChain(root), /must be a regular non-symlink file/i);
    });
  });
}

test("rejects a symlinked canonical inventory", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "supply-chain-link-test-"));
  const target = path.join(root, "target.json");
  try {
    fs.writeFileSync(target, `${JSON.stringify(VALID)}\n`);
    fs.symlinkSync(target, path.join(root, "supply-chain.json"));
    assert.throws(
      () => checkSupplyChain(root, { surfaces: false }),
      (error) => error.code === "INVALID_SUPPLY_CHAIN"
        && error.message.includes("supply-chain.json must be a safe regular file"),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("direct execution prints the exact staged success contract", () => {
  withCliFixture(VALID, (result) => {
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "supply chain contract ok: immutable external refs and exact npm overrides\n");
    assert.equal(result.stderr, "");
  });
});

test("direct execution reports malformed inventory on stderr", () => {
  withCliFixture("{", (result) => {
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^supply chain contract invalid: supply-chain\.json is invalid JSON:/);
  });
});

test("missing inventory has a dedicated relative-file diagnostic", () => {
  withCliFixture(undefined, (result) => {
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "supply chain contract invalid: supply-chain.json is missing\n");
    assert.doesNotMatch(result.stderr, /supply-chain-cli-test-/);
  });
});
