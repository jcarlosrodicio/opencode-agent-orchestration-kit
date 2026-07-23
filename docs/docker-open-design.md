# Docker Open Design

```bash
cd docker/open-design
cp .env.example .env
docker compose up -d --build
```

The Docker image pins upstream build inputs by default:

- `node:24-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d`
- `OPEN_DESIGN_REF=1592beb96134f9d49b8a90dc6a359b94a69af57e`
- `OPENCODE_AI_VERSION=1.14.31`
- `pnpm@10.33.2` with `pnpm install --frozen-lockfile`

Update them intentionally when you want a newer Open Design or OpenCode CLI build:

```bash
docker compose build \
  --build-arg OPEN_DESIGN_REF=<commit-sha> \
  --build-arg OPENCODE_AI_VERSION=<version>
docker compose up -d
```

Treat changes to any of these values as reviewed supply-chain updates and
follow [the per-surface checklist](supply-chain.md). The image digest,
upstream commit, tool versions, and JavaScript lockfile are fixed. Debian APT
repository state and BuildKit metadata are not fixed, so this experimental
adapter does not promise a bit-for-bit Docker rebuild.

Authenticate OpenCode inside the container:

```bash
docker exec -it open-design bash
opencode auth login
opencode models openai --refresh
exit
```

The compose file mounts:

- `./data` for Open Design runtime data;
- `./opencode-od` for isolated OpenCode config;
- `./opencode-auth` for container-local OpenCode auth.

Do not commit `data` or `opencode-auth`.

## HTTP LAN and crypto.randomUUID

Some browser APIs require a secure context. If Open Design frontend code calls `crypto.randomUUID` and your browser blocks it over HTTP LAN, prefer HTTPS. Only patch upstream frontend code as a local operational workaround.
