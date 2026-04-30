# Synology Deployment

Use Container Manager or Docker Compose.

Recommended setup:

1. Build the image from `docker/open-design`.
2. Keep volumes for `data` and `opencode-auth` outside git.
3. Map port `7456` only on trusted LAN unless protected.
4. Configure Synology reverse proxy with HTTPS if exposing beyond localhost.
5. Protect public access with VPN, Tailscale, WireGuard, or authentication.

Useful operations:

```bash
docker compose logs -f
docker compose restart
docker compose pull
docker compose up -d --build
```
