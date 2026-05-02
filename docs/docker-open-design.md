# Docker Open Design

```bash
cd docker/open-design
cp .env.example .env
docker compose up -d --build
```

The Docker image pins upstream build inputs by default:

- `OPEN_DESIGN_REF=1592beb96134f9d49b8a90dc6a359b94a69af57e`
- `OPENCODE_AI_VERSION=1.14.31`

Update them intentionally when you want a newer Open Design or OpenCode CLI build:

```bash
docker compose build \
  --build-arg OPEN_DESIGN_REF=<commit-sha> \
  --build-arg OPENCODE_AI_VERSION=<version>
docker compose up -d
```

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
