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
package.json
opencode/AGENTS.md
opencode/opencode.json
opencode/tools/open_design.ts
docker/open-design/Dockerfile
docker/open-design/docker-compose.yml
docker/open-design/.env.example
docker/open-design/opencode-od/opencode.json
"

for file in $required_files; do
  test -f "$file" || { echo "Missing required file: $file" >&2; exit 1; }
done

for file in install.sh uninstall.sh scripts/check.sh; do
  test -x "$file" || { echo "Not executable: $file" >&2; exit 1; }
done

node -e "JSON.parse(require('fs').readFileSync('opencode/opencode.json','utf8')); JSON.parse(require('fs').readFileSync('docker/open-design/opencode-od/opencode.json','utf8')); console.log('json ok')"

node <<'NODE'
const fs = require('fs')
const path = require('path')
for (const dir of ['opencode/agents', 'opencode/commands', 'opencode/skills/open-design']) {
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
grep -q '"default_agent": "developer"' opencode/opencode.json

grep -q 'Open Design' README.md
grep -q 'Superpowers' README.md
grep -q 'Impeccable' README.md

grep -q '"open-design": allow' opencode/agents/designer.md
grep -q '"impeccable": allow' opencode/agents/designer.md
grep -q '"superpowers"' opencode/agents/designer.md && { echo 'designer should not allow superpowers' >&2; exit 1; } || true
grep -q 'mode: all' opencode/agents/developer.md
grep -q 'Direct mode without slash commands' opencode/agents/developer.md
grep -q 'Default behavior without slash commands' opencode/agents/lead.md

grep -q 'researcher: allow' opencode/agents/scoper.md
grep -q 'specifier: allow' opencode/agents/scoper.md
! grep -q 'developer: allow' opencode/agents/scoper.md
! grep -q 'designer: allow' opencode/agents/scoper.md

grep -q 'Never invoke `developer` before' opencode/agents/lead.md
grep -q 'Never invoke `reviewer` before' opencode/agents/lead.md
grep -q 'agent: lead' opencode/commands/feature.md
grep -q 'agent: scoper' opencode/commands/scope.md
grep -q 'agent: designer' opencode/commands/design.md
grep -q 'evaluator' opencode/commands/evolve.md
grep -q 'debugger' opencode/commands/evolve.md
grep -q 'evolver' opencode/commands/evolve.md

grep -q 'OPEN_DESIGN_URL' opencode/tools/open_design.ts
! grep -q 'baseUrl:' opencode/tools/open_design.ts
! grep -q 'randomUUID' opencode/tools/open_design.ts
! grep -q 'from "node:crypto"' opencode/tools/open_design.ts

private_re="$(printf '%s|%s|%s|%s' '/''Users/' 'synology''\\.me' 'auth''\\.json' 'OPENAI''_API_KEY')"
if grep -R -nE "$private_re" . --exclude-dir=.git --exclude='check.sh' --exclude='.gitignore'; then
  echo 'Potential private data found' >&2
  exit 1
fi

grep -q 'Apache License' LICENSE
grep -q 'OpenCode' NOTICE.md
grep -q 'Open Design' NOTICE.md
grep -q 'Impeccable' NOTICE.md
grep -q 'Superpowers' NOTICE.md

echo 'check ok'
