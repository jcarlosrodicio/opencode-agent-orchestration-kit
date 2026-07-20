#!/usr/bin/env bash
set -euo pipefail

root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$root"

required_files="
README.md
LICENSE
NOTICE.md
SECURITY.md
.gitignore
env.example
install.sh
uninstall.sh
upgrade.sh
doctor.sh
rollback.sh
package.json
scripts/manage-installation.mjs
scripts/manage-installation.test.mjs
opencode/AGENTS.md
opencode/opencode.json
opencode/tui.json
opencode/.gitignore
opencode/package.json
opencode/package-lock.json
opencode/plugins/token-tree-usage.tsx
opencode/tools/open_design.ts
opencode/scripts/check-harness.mjs
opencode/commands/loop.md
opencode/commands/plan.md
opencode/commands/test.md
opencode/commands/code-simplify.md
opencode/docs/ai/harness/README.md
opencode/docs/ai/harness/agents.md
opencode/docs/ai/harness/commands.md
opencode/docs/ai/harness/evidence.md
opencode/docs/ai/harness/checks.md
opencode/docs/ai/evolution/README.md
opencode/docs/ai/evolution/evolution_history.md
opencode/docs/ai/evolution/mechanisms.jsonl
opencode/docs/ai/evolution/rejected_mechanisms.jsonl
opencode/docs/ai/evolution/benchmarks/manual-scenarios.md
opencode/docs/ai/evolution/benchmarks/router-scenarios.jsonl
docker/open-design/Dockerfile
docker/open-design/docker-compose.yml
docker/open-design/.env.example
docker/open-design/opencode-od/opencode.json
CODE_OF_CONDUCT.md
CONTRIBUTING.md
.github/PULL_REQUEST_TEMPLATE.md
.github/CODEOWNERS
.github/workflows/check.yml
.github/ISSUE_TEMPLATE/config.yml
.github/ISSUE_TEMPLATE/bug_report.yml
.github/ISSUE_TEMPLATE/feature_request.yml
.github/ISSUE_TEMPLATE/documentation.yml
"

for file in $required_files; do
  test -f "$file" || { echo "Missing required file: $file" >&2; exit 1; }
done

for file in install.sh uninstall.sh upgrade.sh doctor.sh rollback.sh scripts/check.sh; do
  test -x "$file" || { echo "Not executable: $file" >&2; exit 1; }
done

node -e "JSON.parse(require('fs').readFileSync('opencode/opencode.json','utf8')); JSON.parse(require('fs').readFileSync('docker/open-design/opencode-od/opencode.json','utf8')); console.log('json ok')"
(cd opencode && node scripts/check-harness.mjs)

node <<'NODE'
const fs = require('fs')
const path = require('path')
for (const dir of ['opencode/agents', 'opencode/commands', ...fs.readdirSync('opencode/skills').map((name) => path.join('opencode/skills', name))]) {
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.md'))) {
    const full = path.join(dir, file)
    const text = fs.readFileSync(full, 'utf8')
    if (!text.startsWith('---\n')) throw new Error(`${full} missing frontmatter start`)
    if (text.indexOf('\n---\n', 4) === -1) throw new Error(`${full} missing frontmatter end`)
  }
}
console.log('frontmatter ok')
NODE

grep -q 'superpowers@git+https://github.com/obra/superpowers.git' opencode/opencode.json
grep -q '"default_agent": "lead"' opencode/opencode.json
grep -q './plugins/token-tree-usage.tsx' opencode/tui.json

grep -q 'Open Design' README.md
grep -q 'Superpowers' README.md
grep -q 'Impeccable' README.md

grep -q '"open-design": allow' opencode/agents/designer.md
grep -q '"impeccable": allow' opencode/agents/designer.md
grep -q '"superpowers"' opencode/agents/designer.md && { echo 'designer should not allow superpowers' >&2; exit 1; } || true
grep -q 'mode: all' opencode/agents/developer.md
grep -q 'Direct mode without slash commands' opencode/agents/developer.md
grep -q 'Default behavior without slash commands' opencode/agents/lead.md
grep -q 'fast router' opencode/agents/lead.md
grep -q 'Ask the user' opencode/agents/lead.md
grep -q 'edit: deny' opencode/agents/lead.md
grep -Fq '"cd *": allow' opencode/agents/lead.md
grep -Fq '"which *": allow' opencode/agents/lead.md

grep -q 'researcher: allow' opencode/agents/scoper.md
grep -q 'specifier: allow' opencode/agents/scoper.md
! grep -q 'developer: allow' opencode/agents/scoper.md
! grep -q 'designer: allow' opencode/agents/scoper.md

grep -q 'Never invoke `developer` before' opencode/agents/lead.md
grep -q 'Never invoke `reviewer` before' opencode/agents/lead.md
grep -q 'agent: lead' opencode/commands/feature.md
grep -q 'agent: lead' opencode/commands/plan.md
grep -q 'approval_gate: explicit_before_writes' opencode/commands/loop.md
grep -q 'max_iterations_per_invocation: 3' opencode/commands/loop.md
grep -q 'completion_authority: reviewer_only' opencode/commands/loop.md
grep -q 'agent: scoper' opencode/commands/scope.md
grep -q 'agent: designer' opencode/commands/design.md
grep -q 'agent: developer' opencode/commands/test.md
grep -q 'agent: developer' opencode/commands/code-simplify.md
grep -q 'evaluator' opencode/commands/evolve.md
grep -q 'debugger' opencode/commands/evolve.md
grep -q 'evolver' opencode/commands/evolve.md

grep -q 'OPEN_DESIGN_URL' opencode/tools/open_design.ts
grep -q 'baseUrl: tool.schema.string().optional()' opencode/tools/open_design.ts
! grep -q 'randomUUID' opencode/tools/open_design.ts
! grep -q 'from "node:crypto"' opencode/tools/open_design.ts

node <<'NODE'
const fs = require('fs')
const rootPackage = JSON.parse(fs.readFileSync('package.json', 'utf8'))
if (rootPackage.dependencies?.['@opencode-ai/plugin']) {
  throw new Error('package.json should not carry @opencode-ai/plugin; keep it scoped to opencode/package.json')
}

const opencodePackage = JSON.parse(fs.readFileSync('opencode/package.json', 'utf8'))
if (opencodePackage.dependencies?.['@opencode-ai/plugin'] !== '1.14.41') {
  throw new Error('opencode/package.json must pin @opencode-ai/plugin to 1.14.41')
}
if (opencodePackage.dependencies?.['@opentui/core'] !== '0.2.5') {
  throw new Error('opencode/package.json must pin @opentui/core to 0.2.5')
}
if (opencodePackage.dependencies?.['@opentui/solid'] !== '0.2.5') {
  throw new Error('opencode/package.json must pin @opentui/solid to 0.2.5')
}
if (opencodePackage.dependencies?.['solid-js'] !== '1.9.12') {
  throw new Error('opencode/package.json must pin solid-js to 1.9.12')
}
if (opencodePackage.overrides?.uuid !== '^14.0.0') {
  throw new Error('opencode/package.json must override uuid to ^14.0.0')
}
NODE

grep -q 'Lead' opencode/plugins/token-tree-usage.tsx
grep -q 'Subagents' opencode/plugins/token-tree-usage.tsx
grep -q 'Partial total' opencode/plugins/token-tree-usage.tsx

private_re="$(printf '%s|%s|%s|%s' '/''Users/' 'synology''\\.me' 'auth''\\.json' 'OPENAI''_API_KEY')"
if grep -R -nE "$private_re" . \
  --exclude-dir=.git \
  --exclude-dir=node_modules \
  --exclude='.git' \
  --exclude='check.sh' \
  --exclude='.gitignore'; then
  echo 'Potential private data found' >&2
  exit 1
fi

grep -q 'Apache License' LICENSE
grep -q 'OpenCode' NOTICE.md
grep -q 'Open Design' NOTICE.md
grep -q 'Impeccable' NOTICE.md
grep -q 'Superpowers' NOTICE.md

echo 'check ok'
