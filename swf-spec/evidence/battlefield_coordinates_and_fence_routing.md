# Direct AVM1 evidence: battlefield coordinates, fixed fences, and soldier contact

## Source

Primary source is the recovered original `sgjbgm.swf`, SHA-256
`47d397d98ed797e2e5e1f7f96c10ba9c3f93d3a3b54b45fbc61401a553c3399c`
(3,814,810 bytes, CWS, Flash 7, 24 fps). The battle code is Sprite2456.

The reconstruction manifest independently records that Bitmap226, from which
`battlefield_overlay_clean.png` and the base PNGs were reconstructed, is placed
at Sprite2456 coordinate `(53,149)`. Consequently raw AVM1 soldier/collision
coordinates and bitmap-local pixels are different coordinate spaces:

```
bitmapX = swfX - 53
bitmapY = swfY - 149
```

Only after that translation is the 1736x885 bitmap-local battlefield scaled to
the revival's 2400x900 world. The earlier zero-offset conversion was invalid;
it could round-trip internally while still disagreeing with the rendered art.

## `shk2()` collision grid

`shk2` starts at AVM1 offset 2233427. The battle initializes `h=36` around
2252757 and samples the collision field as the equivalent of
`f[Math.round(x/h)][Math.round(y/h)]`.

Besides headquarters values 996..999 and outer value 1000, `shk2` writes the
six fixed battlefield fences directly into the grid:

| code | x index | y indices | reconstructed fence |
| --- | ---: | --- | --- |
| 901 | 15 | 14..17 | player-vanguard |
| 902 | 18 | 21..24 | player-lower |
| 903 | 18 | 8..11 | player-upper |
| 904 | 33 | 8..11 | enemy-upper |
| 905 | 33 | 21..24 | enemy-lower |
| 906 | 36 | 14..17 | enemy-vanguard |

These assignments are in the `shk2` block around offsets 2235018..2235625.
After subtracting Bitmap226's `(53,149)` placement, the raw grid rectangles
line up with the extracted alpha components: their X starts differ by at most
2 bitmap pixels, and the grid/alpha overlap exceeds 87% for every fixed fence.
The roughly ten-pixel vertical overhang is part of the original coarse 36-unit
collision grid, not a reason to replace it with an independently tuned alpha
rectangle.

## Collision response and `vc3()` routing

For a collision value 901..906, `d()` enters the generic `>900` obstacle path
around 2194253. It rejects the colliding candidate, applies the impact response,
sets `k=10` and `t=20`, and calls `vc3(code, unit)` around 2194791.

The impact branch assigns horizontal `fx=-2*x`; while `k` is non-zero the
common k branch moves with `fx/fy` and multiplies them by `0.7` each logic tick
(offsets 2197109..2197318).

`vc3` is defined at 2219081. It computes the vector from the unit to its current
target `(tx,ty)`, compares current Y with `smy[code-900]+70`, and rotates that
vector by exactly `+1.5` or `-1.5` radians. It then writes the rotated movement
components at the unit's normal speed. The `smy` array is initialized around
2252446 as:

```
[0, 504, 756, 288, 288, 756, 504]
```

After the ten impact ticks, the `t>0` branch preserves that `vc3` movement for
20 logic ticks before `ido()/vc()` restore the ordinary target-driven vector.
This is why the original can travel around a long fixed fence while retaining a
live combat target. A short speculative look-ahead/left-right steering system
is not the raw mechanism.

## Soldier occupancy is sequential and grid-gated

The earlier interpretation of the 24-unit branch as a generic all-pairs
separator was wrong. `d(i)` does not iterate over every soldier pair.

At the beginning of `d(i)`, the current soldier's existing collision cell is
computed from `_x/_y`. If that cell contains a value below 900, the cell is
cleared to zero (2185549..2185682). At the end of `d(i)`, the current cell is
recomputed and, again only when it is below 900, the soldier's numeric `i`
value is written back to `f[][]` (2198289..2198418).

For ordinary movement, `d(i)` computes the proposed point
`(_x+x, _y+y)` at 2191441..2191484 and reads exactly one collision value from
`f[round(proposedX/36)][round(proposedY/36)]` at 2191485..2191549.

If that value is zero and there is no forced current-target contact, the current
soldier simply moves to the proposed point and exits this collision branch
(2191550..2191611). Values above 900 go to fixed/base collision handling.
Values 1..200 are interpreted as dynamic soldier IDs; only then is the
corresponding `m<id>` soldier loaded as the contact candidate
(2194817..2194904).

This makes the raw contact system sequential and asymmetric: one soldier clears
its own old cell, evaluates one proposed destination cell, resolves that event,
and writes its new cell before another soldier's `d()` update occurs. It is not
an unconditional post-movement pairwise separation pass.

## Current-target close-contact override

There is one deliberate route that can enter soldier-contact handling even when
the proposed grid cell is not occupied. In the default target-following path,
`d(i)` compares the current target `l` against the current soldier.

When both absolute axis deltas are strictly below 20 source units
(2190575..2190696), register 17 is set to 1. The code then proposes a position
24 source units away from `l` and applies it only when the destination `f[][]`
cell is zero (2190714..2190968).

Later, when register 17 is 1, the collision candidate ID is explicitly replaced
with `l.i` before the normal 1..200 candidate lookup (2194817..2194852). Thus
this is a targeted close-contact override, not permission to process every
nearby soldier pair.

## Enemy attack gate before physical contact response

Once a dynamic soldier candidate is resolved, the branch at 2194909..2195145
first checks whether this pair is eligible for the immediate normal-attack path.
The attack path requires both units to have moved away from their stored
`bx/by` contact positions, opposing teams, `sp==0` on both sides, candidate
`p<95`, and candidate `fr._currentframe != 6`.

When those conditions hold, `atck(...,3)` is called, both units' `bx/by` values
are updated to their current positions, and the code skips the physical
24-unit correction for that event (2195150..2195324).

This saved-position gate is another reason the 24-unit branch cannot be modeled
as a generic continuously-running separator.

## Physical soldier-contact response

If the pair does not take the attack branch, the physical response begins at
2195329. It computes the angle from the current soldier to the candidate.

Only when both absolute axis deltas are strictly below 32 source units does it
propose a new current-soldier position exactly 24 source units from the
candidate. That proposed point is accepted only when the destination
`f[round(x/36)][round(y/36)]` entry equals zero
(2195419..2195705). The immediate position assignment affects only the current
soldier.

The branch then derives an eight-direction index from `round(angle/0.75)+5`,
assigns the candidate and current soldier opposite `fx/fy` vectors scaled by
their respective movement-speed value `s`, and sets a short `k=3` contact
impulse. While `k` is non-zero, the common movement branch applies `fx/fy` and
multiplies both by `0.7` each logic tick. Candidate `t` is also increased by 10
and capped at 25 under its normal-contact gate.

So the raw response is a one-event grid collision plus short decaying impulse;
it is not repeated teleport-style correction of every nearby pair each render
update.

## Reconstruction consequence from the failed device replay

The experimental commit `cf0ef57` applied the `<32 axis -> 24 source-unit`
position rule inside the revival's global `separateSoldiers()` all-pairs pass.
Real-device testing immediately restored the previously observed circular
movement and caused the player character to be dragged by allied contact.
Rolling back that single commit to `c63d327` removed both regressions.

That device result is consistent with the re-read AVM1 control flow above: the
numeric 32/24 geometry was real, but the trigger scope was wrong. The raw rule
must not be reintroduced as a global all-pairs post-pass.

## Reconstruction requirements

- Raw Sprite2456 points must always pass through the `(53,149)` SWF-to-bitmap
  translation before world scaling.
- Bitmap crop/alpha rectangles stay bitmap-local and must not be passed through
  the raw SWF point transform.
- 901..906 and 996..999 share the same 36-unit `f` collision source.
- Fixed-fence movement must begin on actual grid collision, not a look-ahead
  sensor.
- Soldier contact must be gated by the sequential 36-unit occupancy grid, or by
  the explicit current-target `<20` override.
- The `<32` / `24` correction is only part of that already-selected contact
  event; it must never be applied to all nearby pairs every frame.
- The raw physical contact event also includes opposite `fx/fy`, `k=3`, and
  `0.7` decay; implementing only the position snap is incomplete.
- Collision/UI tests must compare the raw grid after coordinate conversion with
  the reconstructed PNG geometry; round-trip tests alone are insufficient.
