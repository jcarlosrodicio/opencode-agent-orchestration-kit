#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]] || [[ "$1" != "latest" && ! "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "usage: $0 MAJOR.MINOR.PATCH|latest" >&2
  exit 2
fi

request="$1"
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
  "$smoke_root/npm"

source_config="$root/opencode"
target_config="$smoke_root/config/opencode"
test ! -e "$target_config"

node - "$source_config" "$target_config" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const sourceRoot = process.argv[2];
const targetRoot = process.argv[3];

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
      component === "node_modules" || component === ".oak"
    );
  },
});
NODE

if [[ ! -f "$target_config/agents/lead.md" || -e "$target_config/opencode" ]]; then
  echo "packaged OpenCode config has an invalid layout" >&2
  exit 1
fi

run_isolated() {
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
}

run_opencode() {
  run_isolated npx --yes --package "opencode-ai@$request" opencode "$@"
}

run_isolated npm --prefix "$target_config" ci --ignore-scripts >/dev/null

actual="$(run_opencode --version)"
if [[ "$request" == "latest" ]]; then
  if [[ ! "$actual" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "latest OpenCode did not resolve to a canonical version" >&2
    exit 1
  fi
elif [[ "$actual" != "$request" ]]; then
  echo "resolved OpenCode version did not match the request" >&2
  exit 1
fi

agent_json="$(run_opencode debug agent lead --pure)"

for output in "$actual" "$agent_json"; do
  if [[ -n "$original_home" && "$output" == *"$original_home"* ]]; then
    echo "OpenCode output exposed the original home path" >&2
    exit 1
  fi
  if [[ -n "$root" && "$output" == *"$root"* ]]; then
    echo "OpenCode output exposed the original repository path" >&2
    exit 1
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
  echo "packaged lead did not resolve as a primary agent" >&2
  exit 1
fi

printf 'opencode compatibility smoke ok: requested=%s resolved=%s\n' "$request" "$actual"
