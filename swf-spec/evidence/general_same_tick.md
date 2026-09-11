# Same-tick general command evidence

Source: original `sgjbgm.swf`, SHA-256 `47d397d98ed797e2e5e1f7f96c10ba9c3f93d3a3b54b45fbc61401a553c3399c` (3,814,810 bytes, CWS, SWF v7, 24 fps). The statements below were recovered directly from the regenerated AVM1 functions `spl` and `sz` plus the relevant SWF timelines.

## Command dispatch

General command attack code `14` enters the `spl()` branch that calls `sz(general, 4)`, then shows the general's `as.gri` effect. `sz()` scans nearby same-team soldiers and excludes the source soldier. In mode `4`, the affected recipient must satisfy both:

- character code `ch != 3` (generals are excluded), and
- `sp == 0` (the recipient is not already in a special-action state).

For an accepted ordinary AI recipient, mode 4 does **not** call the recipient technique immediately. It selects the recipient's `fr` effect frame `kb` with `gotoAndStop("kb")`.

The player-controlled `m200` branch is separate: when its gauge is below 99, mode 4 raises `m200.kd` to `99` instead of routing that unit through the automatic `kb -> spl()` callback.

## `kb` callback is a single 13-frame timeline

The `fr` selector is SWF Sprite `800`. Its frame 3 is labelled `kb` and places one child Sprite `671` at display-list depth 1. Direct parsing of Sprite 671 confirms **13 timeline frames**. Its frame-13 AVM1 action calls the battle root's `spl(recipient)` exactly once, then returns the recipient movie clip to frame 1 and stops.

Because a newly placed child begins on frame 1, the frame-13 callback is reached after **12 frame advances**. At the battle SWF's 24 fps that is 500 ms. The reconstruction therefore schedules the automatic AI recipient callback at `12 * (1000 / 24)` ms after the command selects `kb`, rather than firing in the command's own update.

The callback re-enters the same `spl()` function used by the recipient's own technique. For ranged recipients this means the callback still obeys the ordinary ranged branch: it requires the existing `l`, verifies range and `k == 0`, and only then resolves one shot. A command does not invent a new ranged target.

## Same-instant overlap and later callbacks

If two generals select the same recipient at the same logical instant, both mode-4 calls address the same recipient `fr` movie clip and the same `kb` frame/depth. Flash display lists cannot hold two independent Sprite-671 children simultaneously at that depth. The second `gotoAndStop("kb")` therefore does not create a second concurrent callback, so at most one callback is pending for that same-instant overlap.

This does **not** imply that a recipient's own ranged shot and the command callback must collapse into the same attack. They occur on different timeline events. A ranged self-activation may fire when the command is issued, establish `k = 10`, and finish that 10-tick lock before the `kb` frame-13 callback arrives after 12 advances. If the original `l` is still valid and in range at callback time, the command can then produce another, time-separated shot.

The recipient state checks still reject genuinely incompatible later activations. Mode 4 requires `sp == 0`, and ranged `spl()` requires `k == 0` at callback time.
