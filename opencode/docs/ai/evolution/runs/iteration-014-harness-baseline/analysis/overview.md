# Analysis: iteration-014-harness-baseline

The useful root cause was checker brittleness, not agent behavior. The checker
was using exact `String.includes()` checks for rules that are semantic prompt
contracts, such as "Do not edit code" and "delegate to `researcher`".

The recommended change was narrow:

- keep YAML permissions and agent names as exact literals;
- replace semantic phrase tokens with bounded regex checks;
- keep literal fallbacks for the most critical prohibition rules;
- do not change routing, providers, models, permissions, or agent behavior.

No public raw transcripts or machine-local paths are required for this evidence.
