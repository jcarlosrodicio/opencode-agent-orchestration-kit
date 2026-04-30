# Quickstart

## 1. Configure models

```bash
cp env.example .env
source .env
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

## 4. Try design

```text
/design Read PRODUCT.md and DESIGN.md, create an editable Open Design project for onboarding, and return the URL
```

Expected flow: designer checks docs, optionally uses Impeccable, then uses Open Design.

## 5. Try feature

```text
/feature Add a small settings page with a saved theme preference
```

Expected flow: lead decides research/design needs, then specifier -> developer -> reviewer.
