# Token vs Semantics

## Structural Tokens

These remain exact literals:

- `edit: deny`
- `"cd": allow`
- `"cd *": allow`
- `"which": allow`
- `"which *": allow`
- agent identifiers such as `developer`, `researcher`, `designer`, and
  `specifier`

## Semantic Tokens

These are prompt-contract concepts and can be verified with bounded regexes:

- fast router behavior;
- asking the user when real ambiguity changes routing;
- lead must not edit code;
- lead must not develop or deeply investigate code;
- implementation corrections return to `developer`;
- handoffs are self-contained;
- diff review belongs to `reviewer`;
- discovery is delegated to `researcher`.

## Acceptance Bar

The semantic checker is acceptable only if it passes equivalent rewrites while
still failing real omissions and structural permission changes.
