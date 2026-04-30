# Security

- Do not expose Open Design directly to the Internet without protection.
- Do not commit auth files, sessions, `.env`, logs, or provider credentials.
- Do not commit private product/design docs unless intended.
- Open Design can execute agent CLIs and write files in project workspaces.
- Prefer localhost, LAN, VPN, Tailscale, WireGuard, or authenticated HTTPS reverse proxy.
- Review generated files before copying them into application code.
