# Direct AVM1 evidence: battlefield coordinates, fixed fences, and contact spacing

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

`shk2` starts at AVM1 offset 2233427. The battle initializes `h=36`, and `d()`
samples the collision field as the equivalent of
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

## Generic soldier contact spacing

The ordinary per-unit collision branch around 2195329 computes the pair angle.
When both absolute axis deltas are strictly below 32 source units, it proposes a
position exactly 24 source units from the other unit. The candidate is accepted
only when the corresponding `f[round(x/36)][round(y/36)]` entry equals zero
(offsets 2195489..2195705).

Therefore the previous revival-only Euclidean `SOLDIER_RADIUS*2` separator was
not an SWF rule and allowed much denser sprite piles than the original contact
geometry.

## Reconstruction requirements

- Raw Sprite2456 points must always pass through the `(53,149)` SWF-to-bitmap
  translation before world scaling.
- Bitmap crop/alpha rectangles stay bitmap-local and must not be passed through
  the raw SWF point transform.
- 901..906 and 996..999 share the same 36-unit `f` collision source.
- Fixed-fence movement must begin on actual grid collision, not a look-ahead
  sensor.
- Collision/UI tests must compare the raw grid after coordinate conversion with
  the reconstructed PNG geometry; round-trip tests alone are insufficient.
