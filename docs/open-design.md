# Open Design

Open Design is an optional workbench for editable design projects and generated visual artifacts.

This kit integrates through `opencode/tools/open_design.ts` and `opencode/skills/open-design/SKILL.md`.

## OPEN_DESIGN_URL

Use the base URL:

- `https://open-design.example.com`
- `http://192.168.1.50:7456`

Do not use project or file URLs.

## Deployment options

- localhost
- Docker local
- Docker on a NAS
- HTTPS reverse proxy

## Security

Do not expose Open Design directly to the Internet without authentication, VPN, Tailscale, WireGuard, or a secure reverse proxy.

## Runtime budgets

The Open Design client uses fixed safety budgets for remote calls: 5 seconds to
receive response headers, 15 seconds of read-idle time, 120 seconds total per
request, 1 MiB for JSON responses, 8 MiB for SSE responses, 2 MiB per stdout or
stderr channel, and 10,000 SSE events. Oversized, stalled, or incomplete
responses fail with a bounded diagnostic instead of being retained indefinitely.
