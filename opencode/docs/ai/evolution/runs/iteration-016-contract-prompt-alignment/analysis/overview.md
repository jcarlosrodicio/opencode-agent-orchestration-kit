# Overview - Iteration 016

## Failure Pattern

The harness checker had coverage gaps for command and agent prompt drift. It
verified that agents and commands were documented, but not enough of the
contract-to-prompt alignment was enforced mechanically.

The follow-up review found three concrete risks:

- prose evidence containing markdown filenames could be misread as a missing path;
- ordered flows could pass when the required agent names appeared in the wrong order;
- cross-agent checks could pass when a prompt matched only one invariant.

## Root Cause

The checker grew incrementally. Existing checks protected the lead router,
`/feature`, and `/plan`, but `/evolve`, `/scope`, `/design`, and broader
contract-to-prompt alignment were not covered consistently.

## Applied Fix

The checker now adds bounded checks for `/evolve`, `/scope`, `/design`, and
agent-prompt invariants. The path parser now accepts only strings that look like
standalone repository-relative file paths. Regression tests cover the previously
observed false positive and false negatives.

## Risk

These checks are intentionally bounded regex checks, not a natural-language
parser. Future prompt rewrites may need checker pattern updates when wording
changes but the contract remains valid.
