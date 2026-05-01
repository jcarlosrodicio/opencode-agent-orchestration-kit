#!/usr/bin/env bash
set -euo pipefail

yes=0
target="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --yes|-y)
      yes=1
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
      echo "Usage: ./uninstall.sh [--yes] [--target PATH]"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

known_files="
agents/lead.md
agents/scoper.md
agents/designer.md
agents/researcher.md
agents/specifier.md
agents/developer.md
agents/reviewer.md
agents/evaluator.md
agents/debugger.md
agents/evolver.md
commands/feature.md
commands/scope.md
commands/mvp-spec.md
commands/design.md
commands/research.md
commands/spec.md
commands/implement.md
commands/review.md
commands/evolve.md
skills/open-design/SKILL.md
tools/open_design.ts
scripts/check-harness.mjs
docs/ai/harness/README.md
docs/ai/harness/agents.md
docs/ai/harness/commands.md
docs/ai/harness/evidence.md
docs/ai/harness/checks.md
docs/ai/evolution/README.md
docs/ai/evolution/evolution_history.md
docs/ai/evolution/benchmarks/manual-scenarios.md
"

if [ "$yes" -ne 1 ]; then
  echo "This will remove known kit files from: $target"
  printf "Continue? [y/N] "
  read -r answer
  case "$answer" in
    y|Y|yes|YES) ;;
    *) echo "Aborted."; exit 0 ;;
  esac
fi

for file in $known_files; do
  rm -f "$target/$file"
done

find "$target/skills/open-design" -type d -empty -delete 2>/dev/null || true
find "$target/docs/ai/evolution/benchmarks" -type d -empty -delete 2>/dev/null || true
find "$target/docs/ai/evolution" -type d -empty -delete 2>/dev/null || true
find "$target/docs/ai/harness" -type d -empty -delete 2>/dev/null || true
find "$target/docs/ai" -type d -empty -delete 2>/dev/null || true
find "$target/docs" -type d -empty -delete 2>/dev/null || true
find "$target/scripts" -type d -empty -delete 2>/dev/null || true
for dir in agents commands skills tools; do
  find "$target/$dir" -type d -empty -delete 2>/dev/null || true
done

echo "Removed known kit files from $target. AGENTS.md and opencode.json were left untouched."
