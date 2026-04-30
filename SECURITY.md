# Security Policy

This kit configures coding agents and an optional Open Design workbench. Treat both as powerful developer tools.

## Supported use

- Use Open Design on localhost, a trusted LAN, VPN, Tailscale, WireGuard, or behind an authenticated reverse proxy.
- Do not expose Open Design directly to the public Internet without authentication and network controls.
- Keep OpenCode auth files, provider credentials, sessions, logs, and `.env` files out of git.

## Report a vulnerability

Open an issue with a minimal reproduction and no secrets. If the report contains sensitive information, contact the maintainer privately before publishing details.

## Local risks

Open Design can run agent CLIs that read and write files in the project workspace. Review prompts and target directories before running generation on private repositories.
