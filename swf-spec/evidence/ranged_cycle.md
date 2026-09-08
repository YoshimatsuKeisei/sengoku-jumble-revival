# Ranged attack cycle evidence

Source: original `sgjbgm.swf`, SHA-256 `47d397d98ed797e2e5e1f7f96c10ba9c3f93d3a3b54b45fbc61401a553c3399c` (3,814,810 bytes, CWS, SWF v7, 24 fps). The cadence and launch statements below come directly from regenerated AVM1 (`spl`, `atck`, battle update `d`) and the extracted character/effect timelines.

## Important correction: frames 41-48 are directions, not elapsed attack frames

The earlier reconstruction interpreted character frames `41-48` as an eight-frame animation interval and used that as an eight-tick action lock. Direct AVM1 disproves that interpretation.

For the common ranged branch (archer codes 2/3/15/16 and teppou codes 4/5/17), `spl()` stores the facing index `fi` and selects the character pose with:

`gotoAndStop(fi + 40)`

`fi` is the eight-direction facing index, so source frames 41 through 48 are eight **directional attack poses**. They are not played sequentially at 24 fps and cannot establish an eight-tick cadence by themselves.

## Confirmed original ranged lock: `k = 10`

The same ranged `spl()` branch requires all of the following before resolving the shot, including `k == 0`. It calls `atck()` exactly once for that successful activation. During the attack resolution, the SWF sets the attacker's `k = 10`.

The main battle updater `d()` checks `k` before ordinary action logic. When `k != 0`, ordinary action processing is skipped, and the updater decrements `k` by one. This makes the next fresh ranged activation available only after the ten-step `k` lock has elapsed. The reconstruction's ranged action lock therefore needs to model **10 SWF logic ticks**, not the previous guessed value of 8.

## One ranged activation resolves one shot

All seven currently implemented ranged technique codes converge on the same `spl()` ranged branch. One successful branch execution contains one call to `atck()`; there is no loop that invokes `atck()` repeatedly for that activation.

The extracted visual timeline independently matches that cardinality. Archer Sprite `1033` and teppou Sprite `1982` use the same projectile child Sprite `1002`, instance name `ya`. Across directional poses 41-48, the display list contains one active `ya` instance for the selected pose. Some source frames remove/re-place it at another depth as the directional artwork changes, but the resulting pose contains one projectile child rather than multiple concurrent projectile instances.

Sprite 1002 itself is a non-looping four-frame effect:

- SWF frame 1: transparent;
- frames 2-4: bitmap 996, 998, 1000;
- `loop = false`.

Therefore `RANGED_ATTACK_CYCLE_SINGLE_LAUNCH` is confirmed as one ranged attack resolution/projectile launch per successful `spl()` activation. The four-frame child visual is playback of that one projectile effect, not four launches.

## GENERAL_COMMAND interaction

General command eventually calls the recipient's own `spl()` through the original `fr.kb` callback. A commanded archer/teppou therefore uses the same `k == 0` gate and the same `k = 10` post-attack lock. The command can bypass the recipient's gauge trigger while still being subject to the physical/action state that prevents immediate repeated ranged resolution.

## Gauge banking remains unresolved

The reconstruction currently accumulates AI combat gauge and does not clamp a banked ranged gauge. The direct evidence above establishes launch cardinality and the `k=10` action cadence, but it does not yet establish the original maximum/carry-over rule for the reconstruction's gauge abstraction. `RANGED_GAUGE_BANKING_LIMIT` therefore remains `unconfirmed`; no arbitrary cap should be introduced.
