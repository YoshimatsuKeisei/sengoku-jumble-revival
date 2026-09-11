# TRAP fence-collision gate — direct raw SWF evidence

Source: original `sgjbgm.swf`, SHA-256 `47d397d98ed797e2e5e1f7f96c10ba9c3f93d3a3b54b45fbc61401a553c3399c` (3,814,810 bytes, CWS, SWF v7, 24 fps). The file was directly decompressed and the relevant AVM1 in battle Sprite 2456 was parsed from the uncompressed bytes.

## TRAP is entered from the high collision-code branch, not from X=900 alone

Inside `d()`, the runtime first computes the predicted next collision-grid occupant from `f[][]` and stores its code in register 4 (`2191450..2191549`). At `2191616..2191627` the code is compared with `900`. Only `reg4 > 900` enters the high-code collision switch.

That switch handles the base/recovery/boundary codes `996`, `997`, `998`, `999`, and `1000` explicitly. The default high-code branch begins at `2194253`; the fixed battlefield fences are the confirmed `901..906` grid codes, so their collision path reaches this default branch.

Therefore the raw sequence is:

`predicted f[][] collision -> code > 900 -> fixed-fence/default collision branch -> optional TRAP roster lookup`.

The source-space X=900 comparison is **not** a standalone collision line or a standalone TRAP trigger.

## What X=900 actually does

Once the fixed-fence/default collision block is already active, X=900 selects which defending roster lookup can be used:

- `2194285..2194328`: `_x > 900 && e == 1`; if true, `2194350..2194369` calls `eskk()`.
- `2194518..2194561`: `_x < 900 && e == 2`; if true, `2194583..2194602` calls `mskk()`.

Thus X=900 distinguishes an invading player-side soldier on the enemy side from an invading enemy-side soldier on the player side **inside an actual high-code collision response**. Crossing the center boundary while standing in ordinary code-0 terrain does not enter this block and performs no TRAP draw.

## `mskk()` / `eskk()` and `s17`

`mskk` is defined at `2209801` (body `2209816..2210041`). It performs exactly two random player-roster slot draws with replacement and returns the first soldier whose special-code list contains `s17`, otherwise `0`.

`eskk` is defined at `2210041` (body `2210056..2210264`). It likewise performs exactly two random enemy-roster slot draws with replacement and checks for `s17`.

In this collision path, a successful lookup executes the TRAP response: one HP damage with a floor of 2 HP, the explosion effect/sound, and the stronger collision reversal. This directly identifies `s17` as the TRAP ability used by the fence-collision branch.

## Common fence response

After the optional TRAP lookup, the common default-collision tail runs whether or not an `s17` holder was found:

- `2194765..2194777`: `k = 10`;
- `2194778..2194790`: `t = 20`;
- `2194791..2194806`: calls `vc3(...)` for fence routing.

So the original 10/20 state is fundamentally part of the fence collision response; the HP loss/effect is the optional TRAP addition.

## Reconstruction consequence

The revival must not recreate an invisible X=900 trigger line. Its active TRAP check is tied to new enemy fixed-fence contact, which matches the raw call-path category established above. The current port still uses reconstruction fence-contact geometry rather than fully replaying raw `f[][]` movement collision, so the geometry proxy and the raw `901..906` grid remain separate concerns. The important invariant for TRAP is that merely crossing the opposing half never causes a draw; an enemy fixed-fence collision/contact is required first.
