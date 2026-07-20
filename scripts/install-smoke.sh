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
./install.sh --target "$target" >/dev/null

test -f "$target/AGENTS.md"
test -f "$target/opencode.json"
test -f "$target/scripts/check-harness.mjs"
test -f "$target/.oak/manifest.json"
test -f "$target/.oak/rollback/transaction.json"

./doctor.sh --target "$target" >/dev/null

manifest_before="$(shasum -a 256 "$target/.oak/manifest.json" | awk '{print $1}')"
./upgrade.sh --dry-run --target "$target" >/dev/null
manifest_after="$(shasum -a 256 "$target/.oak/manifest.json" | awk '{print $1}')"
test "$manifest_before" = "$manifest_after"

./uninstall.sh --yes --target "$target" >/dev/null
test ! -e "$target/AGENTS.md"
test ! -e "$target/.oak/manifest.json"
test -f "$target/.oak/rollback/transaction.json"

./rollback.sh --target "$target" >/dev/null
test -f "$target/AGENTS.md"
test -f "$target/.oak/manifest.json"
./doctor.sh --target "$target" >/dev/null

if find "$smoke_root" -maxdepth 1 -name "$(basename "$target").backup.*" -print -quit | grep -q .; then
  echo "Unexpected sibling backup directory" >&2
  exit 1
fi

(
  cd "$target"
  npm ci
  node scripts/check-harness.mjs
  node --input-type=module -e "import('@opencode-ai/plugin').then(() => console.log('installed plugin import ok'))"
)

echo "installation smoke ok"
