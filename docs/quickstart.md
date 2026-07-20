# Quickstart

## 1. Configure models

```bash
cp env.example .env
source .env
(cd opencode && npm install)
```

## 2. Configure Open Design

```bash
export OPEN_DESIGN_URL="https://open-design.example.com"
```

Use the base URL only.

## 3. Try scope

```text
/scope Research whether this repo should use Stripe Checkout or Payment Element and produce an MVP spec
```

Expected flow: researcher -> scoper synthesis -> specifier.

## 4. Try plan

```text
/plan Add a dry-run flag to the harness check without implementing it yet
```

Expected flow: lead -> researcher -> specifier -> reviewer, with no implementation.

## 5. Try bounded direct routing

```text
Change the Settings heading to Account settings and run the smallest relevant validation.
```

Expected flow: lead chooses the direct path and delegates the small change to developer. No full feature orchestration.

## 6. Try design

```text
/design Read PRODUCT.md and DESIGN.md, create an editable Open Design project for onboarding, and return the URL
```

Expected flow: designer checks docs, optionally uses Impeccable, then uses Open Design.

## 7. Try feature

```text
/feature Add a small settings page with a saved theme preference
```

Expected flow: lead decides research/design needs, then specifier -> developer -> reviewer.

## 8. Validate the harness

```bash
npm run check
```

The check validates the contracts and runs every bundled `node:test` suite. Use
`npm run check:quick` for the contract-only path or `npm run check:release` for
the dependency install, typecheck, audit, and installation smoke used for
release readiness.
