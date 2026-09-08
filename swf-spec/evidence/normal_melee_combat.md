# Normal melee combat — direct raw SWF evidence

Primary source: user-provided `sgjbgm.swf`, 3,814,810 bytes, CWS / SWF v7 / 24 fps, SHA-256 `47d397d98ed797e2e5e1f7f96c10ba9c3f93d3a3b54b45fbc61401a553c3399c`. The battle code is Sprite 2456. This note is based on regenerated AVM1 for `d`, `atck`, `ido`, `tiky`, and `led`, not on retained behavior summaries.

## Contact contest and `atck` call convention

`shk()` preserves the parsed combat value in `pw2` and then replaces `pw` with `Math.pow(pw, 3)`. In the normal contact branch of `d()`, after opposing-team / `sp==0` / active-state checks, the SWF evaluates `Math.random() * (a.pw + b.pw)` against `a.pw`. Thus the chance that A becomes the attack side is `A_raw^3 / (A_raw^3 + B_raw^3)`.

The AVM1 call sequence is `Push [0.0, ..., ..., 3, "atck"]` followed by `CallFunction`. The final integer `3` is the AVM1 argument count, not a third argument value. The actual normal-contact mode passed to `atck` is `0`. `atck`'s parameters are `sa`, `sb`, `ss`; normal contact calls it with `sa` as the defender/victim, `sb` as the attack side, and `ss=0`.

## Independent `l` assignment and `pp+20`

Near AVM1 offsets `0x1531e91`-`0x15320e8` (decimal disassembly addresses around `02224241`-`02224872`), `atck()` handles the two participants separately.

For `sa` (the normal-contact defender), active `p<89` units pass the `s7`/random/`pp` chain, but normal mode `ss==0` is an additional fallback. Consequently an eligible defender in a normal contact gets `sa.l = sb` even when the `s7` branch itself would have rejected a non-contact retarget. If `sa.p<20` or `sa.p==88`, the SWF sets `sa.p = sa.pp + 20`.

For `sb` (the attack side), the equivalent `l` assignment has no `ss==0` fallback. If raw `s7` is present on a base charge state (`pp<=2`), it only replaces `sb.l` when `random()*100 > 70`; otherwise the previous `l` survives. Other normal strategies, and units without `s7`, retarget normally. The reconstruction maps this raw `s7` behavior to the existing `RUSH` charge ability.

This means normal contact is not a single unconditional symmetric assignment: the two sides are evaluated independently. For ordinary units it normally becomes mutual `l`; a RUSH charge attack side may retain its previous target on the 70% branch while its contacted defender still points back at it.

## Dynamic pursuit and close correction

`ido()` falls through to `tx = l._x`, `ty = l._y` for the `pp+20` pursuit states. The destination is therefore the target's live position, not the position where contact originally occurred. No independent “give up after N pixels” maximum pursuit distance was found in this ordinary pursuit path.

In `d()`, when both source-space axis separations from `l` are strictly below 20, the SWF computes a point 24 source units from the target along the current line of approach and moves the pursuer there if the destination collision cell is empty. The constants are strict `<20` on each axis and spacing `24`; this is a local overlap/separation correction, not an eight-sector persistent approach-slot system. Outside that small window pursuit continues toward the target's live `_x/_y`.

For ranged `tk` users there is a separate hold rule: when target distance is below `tk-10` and the accompanying `pw`/state conditions are satisfied, movement is held. `tk` must not be generalized into one universal melee attack radius.

## Hit reaction, death, retreat, and `led`

Normal hit paths establish `k=10`. `d()` does not enter `tiky()` for `hp<1` until `k==0`, so a fatal hit completes the ten-logic-tick reaction before the death transition. `tiky()` sets death state `p=99` and calls `led(deadUnit)`.

`led(i)` scans the battle roster. For every active pursuer whose `l==i`, it performs the equivalent of `l=-1`, `p=pp`, `ido()`, and `vc()`. Death therefore releases persistent pursuers at the death transition itself.

Emergency retreat is different. The initial retreat states remain chaseable. In the player path, the `p91 -> p93` entry-commit transition at source X `<232` calls `led(self)`; the enemy mirror `p92 -> p94` at X `>1612` does the same. Pursuit therefore continues during the outer retreat, then is released when base entry is committed, before later healing states `97/98`. Healing/rejoin subsequently clear the unit's own `l` as part of their state transitions.

## Reconstruction implications

A conforming reconstruction must therefore preserve all of the following together:

- cubic raw-combat weighting for the normal contact attack side;
- `atck(..., mode=0)` for ordinary contact;
- independent persistent-target assignment for defender and attack side;
- `targetId`/strategy-preservation as the reconstruction equivalent of `l` plus `p=pp+20`;
- direct live-target pursuit with no standalone maximum chase distance;
- strict `<20` source-axis / 24-source-unit local separation correction, with no invented sector/crowd jitter;
- fatal reaction completion before death, followed by immediate `led`-equivalent pursuit release;
- continued pursuit during outer emergency retreat and release at the `93/94` entry-commit boundary.
