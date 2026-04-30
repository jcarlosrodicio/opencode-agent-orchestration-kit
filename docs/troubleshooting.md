# Troubleshooting

## OPEN_DESIGN_URL is empty

Export the base URL:

```bash
export OPEN_DESIGN_URL="https://open-design.example.com"
```

## curl /api/health fails

Check Open Design is running and reachable:

```bash
curl -sS "$OPEN_DESIGN_URL/api/health"
```

## opencode does not appear in /api/agents

Install OpenCode, ensure it is on `PATH`, and run `opencode auth login`.

## crypto.randomUUID fails on HTTP LAN

Prefer HTTPS. Browser secure-context rules can block APIs on plain HTTP remote hosts.

## jq is broken by another distribution

Use system package manager jq, or avoid jq in scripts. This kit's checks do not require jq.

## using-superpowers loads by accident

Check plugin config and agent skill permissions. Designer intentionally denies Superpowers.

## designer cannot see open-design

Verify `opencode/skills/open-design/SKILL.md` exists and `OPEN_DESIGN_URL` is set.

## tool accepts invented URL

It should not. `open_design.ts` must not expose URL arguments and must read only `OPEN_DESIGN_URL`.

## Docker permissions

Ensure mounted directories are writable by the container user.

## Auth in container

Run:

```bash
docker exec -it open-design bash
opencode auth login
```
