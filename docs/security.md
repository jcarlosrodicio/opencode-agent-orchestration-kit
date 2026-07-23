# Security

- Do not expose Open Design directly to the Internet without protection.
- Do not commit auth files, sessions, `.env`, logs, or provider credentials.
- Do not commit private product/design docs unless intended.
- Open Design can execute agent CLIs and write files in project workspaces.
- Prefer localhost, LAN, VPN, Tailscale, WireGuard, or authenticated HTTPS reverse proxy.
- Review generated files before copying them into application code.
- Keep shipped npm manifests together and use `npm ci --ignore-scripts` for
  automated installs. Review every lockfile `resolved` URL, integrity change,
  lifecycle script, and non-registry dependency when updating it.
- Run the low-threshold dependency audit and `npm audit signatures` before a
  release. A registry or network failure blocks that release attempt.
- Publish only the exact package-smoked tarball after verifying its canonical
  SHA-256 checksum. Checks never publish; npm publication and GitHub Release
  upload each require separate explicit authorization. See
  [the supply-chain policy](supply-chain.md).
