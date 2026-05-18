# Analysis: iteration-012-lead-shell-allowlist-boundaries

The remaining issue after iteration 011 was not a missing shell permission.
Exact allowlisted commands worked, and unallowlisted commands still asked for
permission as designed.

The failure pattern was agent-level command selection drift:

- exact `which node` passed;
- exact `cd .` passed;
- exact `pwd` stayed blocked by `bash "*": ask`;
- a natural inspection prompt that already named `cd` and `which node` drifted
  to a nearby composed form instead of using the named allowlisted primitives.

The fix belongs in `lead` guidance rather than the tool layer:

- prefer exact allowlisted primitives already named by the user;
- avoid nearby substitutes such as `pwd` when an allowlisted primitive already
  satisfies the check;
- avoid compound shell calls when separate exact calls preserve the boundary;
- keep `bash "*": ask` unchanged.

The post-change replay confirmed the targeted behavior: the natural inspection
case used separate allowlisted calls and no permission request, while `pwd`
remained outside the allowlist.
