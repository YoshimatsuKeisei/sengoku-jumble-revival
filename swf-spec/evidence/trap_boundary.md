# TRAP fixed-fence entry and half eligibility — direct raw AVM1

Source: recovered `sgjbgm.swf`, SHA-256 `47d397d98ed797e2e5e1f7f96c10ba9c3f93d3a3b54b45fbc61401a553c3399c`, CWS / SWF v7 / 24 fps. The offsets below are from the directly decompressed FWS image.

## The first `> 900` is a collision-code comparison, not X position

The earlier reconstruction note conflated two different values named around 900. Re-reading the raw `d()` action list shows that the branch entering fixed-fence/TRAP handling starts from the battlefield collision grid:

- `2191485..2191549`: read `f[round(candidateX / h)][round(candidateY / h)]` into register 4 (`h = 36`).
- `2191616..2191628`: test **register 4 > 900**. This is the collision-grid code, not `_x`.
- `2191642..2191715`: dispatch special codes `996`, `997`, `998`, `999`, `1000` first.
- `2191720`: every other `>900` code falls through to `2194253`, the common fixed-fence response/TRAP block.

The battlefield grid independently identifies the six fixed fences as codes `901..906`, so those are exactly the ordinary codes that enter this default branch. There is therefore no raw invisible X=900 trigger line.

## X=900 is only the opposing-half eligibility test after fence collision

Inside the fixed-fence block, the source X comparison appears only after the collision-code gate:

- `2194285..2194326`: `_x > 900 && e == 1`; if true, call enemy-side `eskk()` at `2194350`.
- `2194518..2194559`: mirrored `_x < 900 && e == 2`; if true, call player-side `mskk()` at `2194583`.

Thus X=900 chooses whether a soldier already colliding with a >900 fixed-fence cell is on the opposing side. Crossing X=900 by itself does not enter this block and cannot roll TRAP.

On a successful TRAP lookup the raw code plays the explosion response and subtracts one HP with a floor of 2. The common fence tail then establishes `k = 10` at `2194765`, `t = 20` at `2194778`, and calls `vc3()` for the fence response route.

## Reconstruction consequence

The revival's active trigger — a new contact with an enemy-owned fixed fence — is consistent with the raw gate rather than an intentional deviation from it. `touchingEnemyFenceIds` remains useful to prevent reconstruction-side repeated contact processing while a soldier remains geometrically overlapped, but the authoritative reason the event exists is the raw `f[][]` collision-code path for fence codes `901..906`.

The old statement that raw SWF contains a standalone half-field TRAP trigger is withdrawn.
