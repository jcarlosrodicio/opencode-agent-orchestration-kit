#!/usr/bin/env bash
set -euo pipefail

force=0
target="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --force)
      force=1
      shift
      ;;
    --target)
      if [ "$#" -lt 2 ]; then
        echo "--target requires a path" >&2
        exit 1
      fi
      target="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: ./install.sh [--force] [--target PATH]"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

repo_root="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
src="$repo_root/opencode"

ts="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$target"

backup_dir=""
if [ -d "$target" ] && find "$target" -mindepth 1 -maxdepth 1 | read -r _; then
  backup_dir="$target.backup.$ts"
  mkdir -p "$backup_dir"
  for name in agents commands skills tools AGENTS.md opencode.json; do
    if [ -e "$target/$name" ]; then
      cp -R "$target/$name" "$backup_dir/"
    fi
  done
  echo "Backup created: $backup_dir"
fi

for dir in agents commands skills tools; do
  mkdir -p "$target/$dir"
  cp -R "$src/$dir/." "$target/$dir/"
done

for file in AGENTS.md opencode.json; do
  if [ -e "$target/$file" ] && [ "$force" -ne 1 ]; then
    echo "Skipping existing $target/$file (use --force to overwrite)."
  else
    cp "$src/$file" "$target/$file"
  fi
done

cat <<EOF

OpenCode orchestration kit installed to:
  $target

Next steps:
  1. Copy env.example and export the variables you need.
  2. Run: opencode auth login
  3. Set OPEN_DESIGN_URL if you use /design.
  4. Restart OpenCode so plugins and skills are discovered.

Superpowers plugin:
  If opencode.json was skipped, add this manually to your existing config:
  "plugin": ["superpowers@git+https://github.com/obra/superpowers.git"]
EOF
