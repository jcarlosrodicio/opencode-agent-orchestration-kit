#!/usr/bin/env bash
set -euo pipefail

canonical_version_re='^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'

if [[ $# -ne 2 ]] \
  || [[ "$1" != "core" && "$1" != "default" ]] \
  || [[ "$2" != "latest" && ! "$2" =~ $canonical_version_re ]] \
  || [[ "$1" == "default" && "$2" == "latest" ]]; then
  echo "usage: $0 core MAJOR.MINOR.PATCH|latest | default MAJOR.MINOR.PATCH" >&2
  exit 2
fi

mode="$1"
request="$2"
root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
original_home="${HOME-}"
temp_base="${TMPDIR:-/tmp}"
temp_base="${temp_base%/}"
smoke_root=""

cleanup() {
  if [[ -n "$smoke_root" ]]; then
    case "$smoke_root" in
      "$temp_base"/oak-opencode-compat.??????)
        rm -rf -- "$smoke_root"
        ;;
    esac
  fi
}
trap cleanup EXIT

smoke_root="$(mktemp -d "$temp_base/oak-opencode-compat.XXXXXX")"
mkdir -p \
  "$smoke_root/home" \
  "$smoke_root/config" \
  "$smoke_root/data" \
  "$smoke_root/cache" \
  "$smoke_root/state" \
  "$smoke_root/npm" \
  "$smoke_root/pack" \
  "$smoke_root/extracted"
diagnostics_file="$smoke_root/diagnostics"
: >"$diagnostics_file"
test -f "$diagnostics_file" && test ! -L "$diagnostics_file"

source_config="$root/opencode"
if [[ "$mode" == "default" ]]; then
  pack_json="$smoke_root/pack.json"
  if ! (
    cd "$root"
    env -i \
      PATH="$PATH" \
      HOME="$smoke_root/home" \
      npm_config_cache="$smoke_root/npm" \
      npm pack --json --pack-destination "$smoke_root/pack"
  ) >"$pack_json" 2>>"$diagnostics_file"; then
    fail_message="default npm pack failed"
  else
    fail_message=""
  fi
  if [[ -n "$fail_message" ]]; then
    diagnostics="$(<"$diagnostics_file")"
    if [[ -n "$original_home" && "$diagnostics" == *"$original_home"* ]] \
      || [[ "$diagnostics" == *"$root"* ]]; then
      echo "captured diagnostics contained a private path" >&2
    else
      echo "$fail_message" >&2
    fi
    exit 1
  fi

  if ! tarball_name="$(node - "$pack_json" <<'NODE'
const fs = require("node:fs");
const entries = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (!Array.isArray(entries) || entries.length !== 1) process.exit(1);
const name = entries[0]?.filename;
if (typeof name !== "string" || name === "" || require("node:path").basename(name) !== name) {
  process.exit(1);
}
process.stdout.write(name);
NODE
  )"; then
    echo "npm pack must report exactly one tarball" >&2
    exit 1
  fi
  tarball="$smoke_root/pack/$tarball_name"
  if [[ ! -f "$tarball" || -L "$tarball" ]]; then
    echo "npm pack did not produce one regular tarball" >&2
    exit 1
  fi
  if ! tar -xzf "$tarball" -C "$smoke_root/extracted" 2>>"$diagnostics_file"; then
    echo "default tarball extraction failed" >&2
    exit 1
  fi
  source_config="$smoke_root/extracted/package/opencode"
fi

target_config="$smoke_root/config/opencode"
test ! -e "$target_config"

node - "$source_config" "$target_config" "$mode" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const sourceRoot = process.argv[2];
const targetRoot = process.argv[3];
const mode = process.argv[4];

fs.cpSync(sourceRoot, targetRoot, {
  recursive: true,
  filter(source) {
    const stat = fs.lstatSync(source);
    if (stat.isSymbolicLink()) {
      throw new Error("packaged OpenCode config must not contain symlinks");
    }

    const relative = path.relative(sourceRoot, source);
    if (relative === "") return true;
    return !relative.split(path.sep).some((component) =>
      component === "node_modules"
      || component === ".oak"
      || (mode === "core" && component === "plugins")
    );
  },
});

const configPath = path.join(targetRoot, "opencode.json");
if (mode === "core") {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  config.plugin = [];
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
}
NODE

if [[ ! -f "$target_config/agents/lead.md" || -e "$target_config/opencode" ]]; then
  echo "packaged OpenCode config has an invalid layout" >&2
  exit 1
fi

node - "$target_config" "$mode" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const root = process.argv[2];
const mode = process.argv[3];
const config = JSON.parse(fs.readFileSync(path.join(root, "opencode.json"), "utf8"));
const plugins = path.join(root, "plugins");
const superpowers = "superpowers@git+https://github.com/obra/superpowers.git#d884ae04edebef577e82ff7c4e143debd0bbec99";

if (mode === "core") {
  if (!Array.isArray(config.plugin) || config.plugin.length !== 0 || fs.existsSync(plugins)) {
    process.exit(1);
  }
} else if (
  !Array.isArray(config.plugin)
  || config.plugin.length !== 1
  || config.plugin[0] !== superpowers
  || !fs.statSync(path.join(plugins, "token-tree-usage.tsx")).isFile()
) {
  process.exit(1);
}
NODE

run_isolated() (
  cd "$smoke_root/home"
  env -i \
    PATH="$PATH" \
    HOME="$smoke_root/home" \
    XDG_CONFIG_HOME="$smoke_root/config" \
    XDG_DATA_HOME="$smoke_root/data" \
    XDG_CACHE_HOME="$smoke_root/cache" \
    XDG_STATE_HOME="$smoke_root/state" \
    npm_config_cache="$smoke_root/npm" \
    OPENCODE_CONFIG_DIR="$target_config" \
    "$@"
)

run_opencode() {
  run_isolated npx --yes --package "opencode-ai@$request" opencode "$@"
}

contains_forbidden_path() {
  local output="$1"
  local forbidden
  for forbidden in "$original_home" "$root"; do
    if [[ -n "$forbidden" && "$output" == *"$forbidden"* ]]; then
      return 0
    fi
  done
  return 1
}

emit_safe_diagnostics() {
  local line
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" != *"$smoke_root"* ]]; then
      printf '%s\n' "$line" >&2
    fi
  done <"$diagnostics_file"
}

fail_with_diagnostics() {
  local message="$1"
  local diagnostics
  diagnostics="$(<"$diagnostics_file")"
  if contains_forbidden_path "$diagnostics"; then
    echo "captured diagnostics contained a private path" >&2
  else
    emit_safe_diagnostics
    echo "$message" >&2
  fi
  exit 1
}

if ! run_isolated npm --prefix "$target_config" ci --ignore-scripts \
  >/dev/null 2>>"$diagnostics_file"; then
  fail_with_diagnostics "isolated npm install failed"
fi

if ! actual="$(run_opencode --version 2>>"$diagnostics_file")"; then
  fail_with_diagnostics "OpenCode version command failed"
fi
if [[ "$request" == "latest" ]]; then
  if [[ ! "$actual" =~ $canonical_version_re ]]; then
    fail_with_diagnostics "latest OpenCode did not resolve to a canonical version"
  fi
elif [[ "$actual" != "$request" ]]; then
  fail_with_diagnostics "resolved OpenCode version did not match the request"
fi

if ! agent_json="$(run_opencode debug agent lead --pure 2>>"$diagnostics_file")"; then
  fail_with_diagnostics "OpenCode lead debug command failed"
fi

for output in "$actual" "$agent_json"; do
  if contains_forbidden_path "$output"; then
    fail_with_diagnostics "OpenCode output contained a private path"
  fi
done

if ! printf '%s' "$agent_json" | node -e '
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => { input += chunk; });
  process.stdin.on("end", () => {
    let agent;
    try {
      agent = JSON.parse(input);
    } catch {
      process.exit(1);
    }
    if (agent?.name !== "lead" || agent?.mode !== "primary") process.exit(1);
  });
'; then
  fail_with_diagnostics "packaged lead did not resolve as a primary agent"
fi

diagnostics="$(<"$diagnostics_file")"
if contains_forbidden_path "$diagnostics"; then
  echo "captured diagnostics contained a private path" >&2
  exit 1
fi
emit_safe_diagnostics
printf 'opencode compatibility smoke ok: mode=%s requested=%s resolved=%s\n' "$mode" "$request" "$actual"
