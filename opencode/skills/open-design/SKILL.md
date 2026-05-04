---
name: open-design
description: Use the Open Design workbench to create editable visual projects, prototypes, landing pages, dashboards, mobile screens, decks, and implementation handoffs.
compatibility: opencode
metadata:
  surface: visual-design
  backend: open-design
---

# Open Design Skill

Use this skill for visual design, UX/UI, prototypes, product visuals, landing pages, dashboards, pricing pages, docs pages, mobile screens, onboarding, decks, and design handoff.

## OPEN_DESIGN_URL

The workbench URL is configured with `OPEN_DESIGN_URL`.

Valid examples:

- `https://open-design.example.com`
- `http://192.168.1.50:7456`

Invalid examples:

- `https://open-design.example.com/projects/my-project`
- `https://open-design.example.com/projects/my-project/files/index.html`

Resolve the tool `baseUrl` from approved configuration or explicit user/lead-provided context before calling Open Design tools. Do not invent, guess, or hardcode a URL. If no approved `baseUrl` is available, stop and ask for the missing configuration/context instead of trying a fallback.

## PRODUCT.md and DESIGN.md

Before using Open Design, inspect the repository for `PRODUCT.md` and `DESIGN.md` or equivalent docs.

If present, they are authoritative. If one or both are missing, the designer should use the optional `impeccable` skill first to create or propose missing context.

## Tools

Use only the Open Design tools:

- `open_design_health`
- `open_design_list_agents`
- `open_design_list_skills`
- `open_design_list_design_systems`
- `open_design_create_project`
- `open_design_run_design`

Pass the resolved `baseUrl` to every Open Design tool call, including health,
list, create, and run calls.

## Modes

### Workbench

Default mode. Use `open_design_create_project` to create an editable project and return its URL.

### Direct generation

Use only when the user explicitly asks to generate the design. Call `open_design_run_design` and return generated files when available.

### Handoff

When no project is needed, return a design brief, Open Design prompt, implementation notes, risks, assumptions, and visual acceptance criteria.

## Skill mapping

- SaaS landing: `saas-landing`
- Generic web prototype: `web-prototype`
- Dashboard: `dashboard`
- Pricing: `pricing-page`
- Docs page: `docs-page`
- Blog/editorial: `blog-post`
- Mobile app: `mobile-app`
- Mobile onboarding: `mobile-onboarding`
- Deck: `simple-deck` or `guizang-ppt`
- Product spec: `pm-spec`
- Motion frames: `motion-frames`
- Email marketing: `email-marketing`
- Social carousel: `social-carousel`

## Suggested design systems

Use the system named by `DESIGN.md` when possible. Otherwise choose intentionally:

- Developer/SaaS: `linear`, `vercel`, `stripe`, `cursor`, `supabase`, `resend`, `raycast`
- Consumer/productivity: `apple`, `notion`, `airbnb`, `figma`
- Neutral baseline: `neutral-modern` or `default`

## Anti-slop rules

Avoid generic gradients, fake metrics, fake testimonials, unsupported brand colors, meaningless glassmorphism, nested cards without hierarchy, weak hero sections, inconsistent spacing, and vague startup copy.

Prefer strong hierarchy, credible content, restrained palettes, responsive behavior, implementable components, accessible contrast, realistic states, deliberate typography, and product-specific interactions.

## Required output

Always return:

1. Design goal.
2. Repository documents used.
3. Whether Impeccable was needed.
4. Selected Open Design skill.
5. Selected design system.
6. Visual direction.
7. Open Design project URL when created.
8. Generated files when available.
9. Prompt used or proposed.
10. Developer handoff.
11. Assumptions, risks, and deviations.
