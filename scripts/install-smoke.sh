#!/usr/bin/env bash
set -euo pipefail

root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
smoke_parent="${TMPDIR:-/tmp}"
smoke_parent="${smoke_parent%/}"
smoke_root="$(mktemp -d "$smoke_parent/oak-install-smoke.XXXXXX")"
target="$smoke_root/opencode"

cleanup() {
  case "$smoke_root" in
    "$smoke_parent"/oak-install-smoke.*) rm -rf -- "$smoke_root" ;;
    *) echo "Refusing unsafe smoke cleanup: $smoke_root" >&2; return 1 ;;
  esac
}
trap cleanup EXIT

cd "$root"
expected_version="$(node -p "require('./package.json').version")"
expected_line="opencode-agent-orchestration-kit $expected_version"

for wrapper in install.sh upgrade.sh doctor.sh uninstall.sh rollback.sh; do
  test "$("./$wrapper" --version)" = "$expected_line"
done

node --input-type=module - "$root/opencode" "$target" <<'NODE'
import { createInstallationManager } from "./scripts/manage-installation.mjs"
const [, , sourceRoot, targetRoot] = process.argv
const result = await createInstallationManager({
  sourceRoot,
  versionProvider: () => "1.0.26",
}).run("install", { targetRoot })
if (result.exitCode !== 0) throw result.error ?? new Error("smoke install failed")
NODE

test -f "$target/AGENTS.md"
test -f "$target/opencode.json"
test -f "$target/scripts/check-harness.mjs"
test -f "$target/.oak/manifest.json"
test -f "$target/.oak/rollback/transaction.json"

node --input-type=module - "$target" <<'NODE'
import fs from "node:fs"
import path from "node:path"
const target = process.argv[2]
const manifest = JSON.parse(fs.readFileSync(path.join(target, ".oak", "manifest.json"), "utf8"))
const rollback = JSON.parse(fs.readFileSync(path.join(target, ".oak", "rollback", "transaction.json"), "utf8"))
if (manifest.kit_version !== "1.0.26") throw new Error("initial manifest version mismatch")
if (rollback.previous_manifest !== null || rollback.next_manifest?.kit_version !== "1.0.26") {
  throw new Error("initial rollback snapshot version mismatch")
}
NODE

manifest_before="$(shasum -a 256 "$target/.oak/manifest.json" | awk '{print $1}')"
./upgrade.sh --dry-run --target "$target" >/dev/null
manifest_after="$(shasum -a 256 "$target/.oak/manifest.json" | awk '{print $1}')"
test "$manifest_before" = "$manifest_after"

./upgrade.sh --target "$target" >/dev/null
node --input-type=module - "$target" "$expected_version" <<'NODE'
import fs from "node:fs"
import path from "node:path"
const [, , target, expected] = process.argv
const manifest = JSON.parse(fs.readFileSync(path.join(target, ".oak", "manifest.json"), "utf8"))
const rollback = JSON.parse(fs.readFileSync(path.join(target, ".oak", "rollback", "transaction.json"), "utf8"))
if (manifest.kit_version !== expected) throw new Error("upgraded manifest version mismatch")
if (rollback.previous_manifest?.kit_version !== "1.0.26" || rollback.next_manifest?.kit_version !== expected) {
  throw new Error("upgrade snapshot version mismatch")
}
NODE

./uninstall.sh --yes --target "$target" >/dev/null
test ! -e "$target/AGENTS.md"
test ! -e "$target/.oak/manifest.json"
test -f "$target/.oak/rollback/transaction.json"

node --input-type=module - "$target" "$expected_version" <<'NODE'
import fs from "node:fs"
import path from "node:path"
const [, , target, expected] = process.argv
const rollback = JSON.parse(fs.readFileSync(path.join(target, ".oak", "rollback", "transaction.json"), "utf8"))
if (rollback.previous_manifest?.kit_version !== expected || rollback.next_manifest !== null) {
  throw new Error("uninstall snapshot version mismatch")
}
NODE

./rollback.sh --target "$target" >/dev/null
test -f "$target/AGENTS.md"
test -f "$target/.oak/manifest.json"
node --input-type=module - "$target" "$expected_version" <<'NODE'
import fs from "node:fs"
import path from "node:path"
const [, , target, expected] = process.argv
const manifest = JSON.parse(fs.readFileSync(path.join(target, ".oak", "manifest.json"), "utf8"))
if (manifest.kit_version !== expected) throw new Error("rollback-restored manifest version mismatch")
NODE
./doctor.sh --target "$target" | grep -q 'doctor: current'

if find "$smoke_root" -maxdepth 1 -name "$(basename "$target").backup.*" -print -quit | grep -q .; then
  echo "Unexpected sibling backup directory" >&2
  exit 1
fi

(
  cd "$target"
  npm ci --ignore-scripts
  node scripts/check-harness.mjs
  node --input-type=module -e "import('@opencode-ai/plugin').then(() => console.log('installed plugin import ok'))"
)

echo "installation smoke ok"
