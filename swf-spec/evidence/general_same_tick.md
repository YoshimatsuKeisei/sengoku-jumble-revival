# Same-tick general command evidence

Source: original `sgjbgm.swf`, SHA-256 `47d397d98ed797e2e5e1f7f96c10ba9c3f93d3a3b54b45fbc61401a553c3399c` (3,814,810 bytes, CWS, SWF v7, 24 fps). The statements below were recovered directly from the regenerated AVM1 functions `spl` and `sz` plus the relevant SWF timelines.

## Command dispatch

General command attack code `14` enters the `spl()` branch that calls `sz(general, 4)`, then shows the general's `as.gri` effect. `sz()` scans nearby same-team soldiers and excludes the source soldier. In mode `4`, the affected recipient must satisfy both:

- character code `ch != 3` (generals are excluded), and
- `sp == 0` (the recipient is not already in a special-action state).

For an accepted recipient, mode 4 does not directly invoke a second copy of the recipient technique. It selects the recipient's `fr` effect frame `kb` with `gotoAndStop("kb")`.

## `kb` callback is a single timeline instance

The `fr` selector is SWF Sprite `800`. Its frame 3 is labelled `kb` and places one child Sprite `671` at display-list depth 1. Sprite 671 has a 13-frame timeline. Its frame-13 AVM1 action calls the battle root's `spl(recipient)` with the affected soldier, then returns the recipient movie clip to frame 1.

Therefore a command recipient is routed back through the same `spl()` function used by its own technique, rather than through a separate reconstruction-only attack path.

If two generals select the same recipient at the same logical instant, both mode-4 calls address the same recipient `fr` movie clip and the same `kb` frame/depth. Flash display lists cannot hold two independent objects simultaneously at the same depth; the second `gotoAndStop("kb")` does not create a second concurrent Sprite-671 callback. The recipient consequently receives at most one forced `spl()` activation from that same-instant overlap.

The recipient state checks reinforce this behavior after activation. `sp == 0` is required by mode 4, while ranged `spl()` additionally requires `k == 0`; a successful ranged resolution sets `k = 10`. Thus a later command while the recipient is already active is rejected by the original state machine rather than being blindly stacked.

This confirms the invariant represented by `GENERAL_SAME_TICK_DEDUPE`: overlapping same-logical-instant general commands must not produce more than one forced activation for the same recipient. This does **not** ban a later, genuinely separate general command from triggering another activation after the original recipient state permits it again.
