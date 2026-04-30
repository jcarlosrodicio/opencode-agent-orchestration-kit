# Docker Open Design

```bash
cd docker/open-design
cp .env.example .env
docker compose up -d --build
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
