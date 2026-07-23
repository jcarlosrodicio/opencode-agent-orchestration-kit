# Supply-chain policy

`supply-chain.json` is the machine-readable source of truth for reviewed
external inputs used by the shipped kit. A release label helps a reviewer find
the upstream change; only the full commit, digest, or exact package version is
the immutable identifier consumed by the repository.

<!-- supply-chain-pins:start -->
| Surface | Reviewed label | Immutable identifier |
|---|---|---|
| Superpowers | v6.1.1 | `d884ae04edebef577e82ff7c4e143debd0bbec99` |
| actions/checkout | v6 | `d23441a48e516b6c34aea4fa41551a30e30af803` |
| actions/setup-node | v6 | `249970729cb0ef3589644e2896645e5dc5ba9c38` |
| Open Design | reviewed commit | `1592beb96134f9d49b8a90dc6a359b94a69af57e` |
| Node image | 24-bookworm-slim | `sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d` |
| pnpm | 10.33.2 | exact version |
| opencode-ai | 1.14.31 | exact version |
| @babel/core override | 7.29.7 | exact version |
| uuid override | 14.0.0 | exact version |
<!-- supply-chain-pins:end -->

## npm install and review contract

The committed `opencode/package-lock.json` carries the registry URL and
SHA-512 integrity for every installed package. Automated installs with intact
shipped manifests use `npm ci --ignore-scripts`; release readiness also runs
the low-threshold production audit and `npm audit signatures`. A lifecycle
script exception requires a named dependency, a documented reason, and a
focused test. There is currently no exception.

The exact overrides exist for reviewable reasons: `@babel/core` 7.29.7 removes
the audited low-severity findings without an incompatible downgrade, and
`uuid` 14.0.0 preserves the already tested lockfile resolution. Change an
override and regenerate the lockfile in the same reviewed diff. Review every
changed version, `resolved` URL, integrity value, lifecycle script, and Git or
non-registry dependency.

If installation preserves a target's differing `package.json` or
`package-lock.json`, the kit lockfile does not control that target. Review and
merge the required dependencies into the preserved manifests before choosing
an install command; do not blindly run the kit's frozen-install command there.

## Contract boundary and limitations

The release-blocking core smoke removes external plugins and the local token
plugin and runs without the Open Design service or Impeccable. The separate
default-config smoke proves that the packed starter configuration loads with
the reviewed Superpowers commit. Superpowers, Open Design, Impeccable, and the
token plugin remain experimental; default smoke evidence does not promote
them into the supported core contract.

The Open Design image fixes the Node image digest, Open Design commit, pnpm
version, JavaScript lockfile, and OpenCode CLI version. It does not guarantee a
bit-for-bit Docker rebuild: Debian APT repository state and BuildKit metadata
remain outside this slice's reproducibility boundary.

## Reviewed update checklists

Every update records the old and new release label and immutable identifier,
the upstream source used to resolve it, relevant release notes or advisory,
the files changed, focused smoke results, the complete
`npm run check:release` result, and any compatibility-matrix implication. No
normal check fetches or rewrites a pin.

For each surface, also record:

- Superpowers: tag and peeled commit evidence; update starter config and every
  active copy-paste example; run core and default smokes.
- `actions/checkout`: the full commit behind the reviewed release; update all
  blocking and canary uses while retaining the release comment.
- `actions/setup-node`: the full commit behind the reviewed release; update all
  blocking and canary uses while retaining the release comment.
- Open Design: source commit evidence, frozen pnpm installation, and Docker
  smoke evidence.
- Node image: multi-platform digest resolution and architecture inspection.
- pnpm: exact-version release evidence and successful frozen upstream lockfile
  installation.
- `opencode-ai`: exact-version release evidence and a successful container
  build/load smoke.
- `@babel/core` override: advisory rationale, manifest/lockfile diff, low audit,
  signature audit, import, and typecheck evidence.
- `uuid` override: compatibility rationale, manifest/lockfile diff, signature
  audit, import, and typecheck evidence.

Run installation, core/default, and package smokes wherever a changed surface
can affect them.

## Separately authorized release procedure

Publication is never performed by checks and requires separate explicit authorization.
Run the following only after the reviewed implementation is merged and release
publication has been authorized:

```bash
npm run check:release
VERSION="$(node -p "require('./package.json').version")"
mkdir -p dist
npm pack --pack-destination dist
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),path=require("node:path");const f=process.argv[1];process.stdout.write(`${crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex")}  ${path.basename(f)}\n`)' "dist/opencode-agent-orchestration-kit-${VERSION}.tgz" > dist/SHA256SUMS
bash scripts/package-smoke.sh --checksum dist/SHA256SUMS "dist/opencode-agent-orchestration-kit-${VERSION}.tgz"
git diff --check
test -z "$(git status --porcelain)"
TAG="$(git describe --tags --exact-match)"
node scripts/version.mjs --check-tag "$TAG"
npm publish "dist/opencode-agent-orchestration-kit-${VERSION}.tgz"
```

The Node checksum command is canonical on macOS and Linux; neither `shasum`
nor `sha256sum` is required. `dist/` is ignored, so its artifacts do not make
the tracked checkout dirty. The clean-state check still rejects tracked or
untracked non-ignored drift. Tag/version identity is checked immediately after
artifact smoke and immediately before publishing the exact tested tarball.

`SHA256SUMS` contains exactly one line in this format, using the tarball
basename rather than an absolute path:

```text
<64 lowercase hexadecimal characters>  opencode-agent-orchestration-kit-<version>.tgz
```

After npm publication, compare the local tarball's SHA-1 and SHA-512 values
with npm using read-only registry queries. Any mismatch stops the release:

```bash
TARBALL="dist/opencode-agent-orchestration-kit-${VERSION}.tgz"
LOCAL_SHA1="$(node -e 'const fs=require("node:fs"),crypto=require("node:crypto");process.stdout.write(crypto.createHash("sha1").update(fs.readFileSync(process.argv[1])).digest("hex"))' "$TARBALL")"
NPM_SHA1="$(npm view "opencode-agent-orchestration-kit@$VERSION" dist.shasum)"
test "$LOCAL_SHA1" = "$NPM_SHA1"
LOCAL_SHA512="$(node -e 'const fs=require("node:fs"),crypto=require("node:crypto");process.stdout.write(`sha512-${crypto.createHash("sha512").update(fs.readFileSync(process.argv[1])).digest("base64")}`)' "$TARBALL")"
NPM_SHA512="$(npm view "opencode-agent-orchestration-kit@$VERSION" dist.integrity)"
test "$LOCAL_SHA512" = "$NPM_SHA512"
```

Uploading the same tarball and `SHA256SUMS` with the exact command below is
another remote mutation and therefore needs its own separate authorization:

```bash
gh release upload "$TAG" \
  "dist/opencode-agent-orchestration-kit-${VERSION}.tgz" \
  dist/SHA256SUMS
```

Do not replace or delete an existing remote asset automatically. A version
conflict, checksum mismatch, tag mismatch, dirty tracked tree, audit failure,
or package-smoke failure stops publication.
