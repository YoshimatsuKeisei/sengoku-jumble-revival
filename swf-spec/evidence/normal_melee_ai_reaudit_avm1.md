# Normal melee AI re-audit — direct AVM1 evidence

Canonical source: recovered `sgjbgm.swf`, SHA-256 `47d397d98ed797e2e5e1f7f96c10ba9c3f93d3a3b54b45fbc61401a553c3399c`, CWS / SWF v7 / 24 fps. This re-audit uses the regenerated battle Sprite2456 AVM1 with the parent ConstantPool inherited into nested function bodies. Principal functions: `d()`, `scd()`, `vc()`, `ido()`, `atck()`, and `led()`.

All findings below are **【確定】** from raw AVM1 unless explicitly stated otherwise.

## 1. p10 / p11 melee target selection uses fixed roster slots

In `d()` player melee state p10 begins around decompressed AVM1 `0x21621d`:

- `Math.random()*30` -> `Math.floor` -> `+30` selects exactly one `m30..m59` slot.
- The selected object is accepted only when its raw `p < 90`.
- On success the unit stores `l=selected`, `tx=selected._x`, `ty=selected._y`, calls `vc(self)`, and enters `p=pp+20` (p30 for player melee).
- If the holder has s34, that newly selected pursuit state is then changed to `p=pp+30` (p40), but the initial `l/tx/ty` still came from the random p10 draw.
- If the sampled fixed slot is unusable, the code does **not** retry another opponent. It creates a p12 roam target `tx=floor(random*1211)+334`, `ty=floor(random*409)+359`, calls `vc()`, and enters p12.

Enemy p11 mirrors this around `0x216398` with `floor(random*29)+1`, selecting exactly `m1..m29`. This deliberately excludes m0/m200. Invalid selection falls to p13 roam with the same rectangle.

p12/p13 return to p10/p11 only when `abs(tx-_x)+abs(ty-_y) < 150` (strict).

### Reconstruction consequence

Filtering the currently valid enemies first and then drawing from that shorter array is not equivalent. A missing/dead/retreating fixed slot must be allowed to produce the roam branch even when another valid opponent exists.

## 2. p30 / p31 do not continuously home on live `l._x/_y`

The `d()` dispatcher has explicit p30 and p31 cases at approximately `0x2165df` and `0x216615`.

Each case only checks whether s34 is present; if so it changes p30->p40 or p31->p41. It then jumps directly to the common movement block. The p30/p31 branch itself does **not**:

- reload `tx` from `l._x`;
- reload `ty` from `l._y`;
- call `ido()`;
- call `vc()`.

The common movement block at approximately `0x217051` calculates the candidate position by adding the already-stored movement components `x` and `y` to `_x` and `_y`.

Therefore p30/p31 movement between refresh events follows the vector previously produced by `vc()`. It is not frame-by-frame steering toward the current target position.

## 3. `vc()` stores the pursuit vector from the current tx/ty sample

In regenerated `vc()` the direction is calculated from:

- `dx = tx - _x`
- `dy = ty - _y`
- `angle = Math.atan2(dy, dx)`
- movement `x = Math.cos(angle) * s`
- movement `y = Math.sin(angle) * s`

Thus the raw motion is a normalized vector at speed `s`, stored until another call updates it. The important mismatch was not Euclidean normalization; it was how often the vector was recalculated.

## 4. scd refreshes ordinary melee p30/p31 every 23 logic ticks

The `scd()` state switch begins around `0x2198b0`. Explicit cases include p1/2, p3/4, p7, p8/9, p10/11, p12/13, p14/15, p93/94, p97/98, p23/24, p28/29, and p40/41. **p30 and p31 are absent.**

Unlisted states jump to the default block at approximately `0x21a63e`, which performs:

- `tx = l._x`
- `ty = l._y`
- `vc(self)`

The strategy clock is shared with this scd pass: initial counter 19, first trigger after four logic ticks, then every 23 logic ticks.

Therefore ordinary melee pursuit is best described as **piecewise-straight pursuit**: target coordinates are sampled on acquisition/contact/event refresh and again by the periodic scd default, while movement between those refreshes preserves the stored vector.

This corrects the previous evidence statement that the target's live coordinates were used continuously every frame.

## 5. s34 / NINJA_HUNTER uses p40/p41 and only retargets on scd

After a valid p10/p11 random-slot acquisition, an s34 holder enters p40/p41 instead of p30/p31. `d()` does not perform a new frontmost-ninja scan every frame.

`scd()` has explicit p40 and p41 cases around `0x21a5ac` and `0x21a5f5`:

- p40 uses the precomputed enemy-side ninja candidate register.
- p41 uses the mirrored player-side candidate register.
- Only when that register is not `-1` does raw write `l`, `tx`, `ty` and call `vc()`.
- If no qualifying ninja candidate exists, the old `l` and old movement vector are preserved; unlike p30/p31, p40/p41 do not fall through to the generic scd `l` refresh.

The candidate scan is for raw `ch==7` ninjas, requires `p<90`, applies the same projected-front ordering family used by strategy front scans, and requires projected Y strictly inside 324..841. The enemy-side scan uses player slots m1..m29 and therefore excludes m0/m200.

### Reconstruction consequence

`NINJA_HUNTER` must not replace the initial random melee acquisition with a per-frame live-X frontmost-ninja lock. The initial target remains the p10/p11 random slot; s34 retargeting is an scd event.

## 6. close correction and p30/p31

The default `d()` l-pursuit block contains the familiar strict `abs(dx)<20 && abs(dy)<20` correction to a point 24 source units from `l`, subject to collision-cell availability. p30/p31 are explicit dispatcher cases that jump past that default block, so ordinary p30/p31 do not execute that close-correction sub-branch before common movement.

Other pursuit states that reach the default l block retain their own close/ranged behavior. This distinction is why one generic continuously-homing movement helper is not a faithful state model.

## 7. release remains event-driven

`led(i)` scans active roster entries pointing `l` at `i`, clears `l`, restores `p=pp`, and calls `ido()`/`vc()`. Death calls `led()` at the p99 transition. Emergency retreat stays pursuable until the p91->p93 / p92->p94 base-entry commit, where `led(self)` releases pursuers. These previously confirmed release boundaries remain valid; this re-audit changes the **pursuit vector refresh cadence**, not the death/retreat release points.

## Corrected model

For normal persistent pursuit, the reconstructed model should preserve these together:

1. fixed raw roster-slot acquisition for p10/p11;
2. one `tx/ty` sample plus `vc()` when an engagement/retarget event occurs;
3. stored movement vector between refresh events rather than live-coordinate homing every render frame;
4. p30/p31 generic scd refresh every 23 logic ticks;
5. p40/p41 s34 retarget only on scd and only when a valid projected ninja candidate exists;
6. no invented standalone maximum chase distance;
7. existing `led()` death/retreat release boundaries.
