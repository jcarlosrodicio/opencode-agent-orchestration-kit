# Frontend Review Profile

## Activation

Activate for web, mobile, desktop, UI components, client state, navigation,
local storage, client networking, or user-visible behavior. This profile is
framework-neutral and does not require a domain layer, repository pattern,
specific state manager, or feature-folder structure.

## Questions

- Does every async path represent loading, success, empty when meaningful, and
  error/retry behavior without impossible boolean combinations?
- Can double taps, repeated submits, stale responses, cancellation, navigation,
  or lifecycle changes duplicate effects or update disposed/stale UI?
- Is there one owned source of truth, with derived state instead of manual
  duplication?
- Does the UI expose correct semantics, focus/keyboard behavior, labels,
  contrast, text scaling, and assistive-technology behavior for the platform?
- Does it remain usable at applicable viewport sizes, orientations, input
  methods, and platform constraints?
- Are navigation, deep links, restoration, and back behavior correct when they
  are affected?
- Are user-visible strings, dates, numbers, currencies, pluralization, and RTL
  behavior handled through project localization conventions?
- Are secrets and authorization decisions kept out of the client security
  boundary, and is local sensitive data minimized/protected?
- Does the change introduce unnecessary rerenders, unbounded lists, main-thread
  work, oversized assets, layout shifts, or resource leaks?
- Is the real rendered behavior verified when static/component tests cannot
  prove it?

## Required Evidence By Risk

- State/domain logic: focused unit tests.
- Loading/error/empty/data UI: component or widget tests for affected states.
- Visual/layout change: runtime render, screenshot, or equivalent visual
  evidence at relevant sizes/themes.
- Interaction/navigation: runtime flow or integration evidence.
- Accessibility: semantic/focus checks plus manual/runtime evidence when tools
  cannot prove behavior.
- Remote/local contract changes: DTO/storage compatibility and upgrade path.
- Performance claim: profile/measurement before and after.

## Typical Blocking Findings

- New async flow with no reachable error state or recovery.
- Duplicate submission or stale-response race with real user-visible effects.
- Inaccessible primary action, missing semantics, broken focus, or unreadable
  content introduced by the change.
- Visual change not verified in a runtime where layout behavior is acceptance
  critical.
- Direct exposure of sensitive data or reliance on client-only authorization.
- Breaking remote/local data compatibility for installed clients.

## Non-blocking Or Contextual Findings

- Pre-existing visual/accessibility debt not worsened by the diff.
- A preferred state-management library or component decomposition unsupported
  by local conventions.
- Strict layering suggestions when the declared frontend profile is inactive.
- Hypothetical device/layout cases outside the product's supported matrix.
