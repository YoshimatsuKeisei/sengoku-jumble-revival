# Ranged target impulse — direct AVM1 evidence

Primary source: `/mnt/data/sengoku_jumble_recovered.zip` → `sengoku_jumble_recovered/sgjbgm.swf`.

Verified source properties: 3,814,810 bytes, CWS, SWF v7, 24 fps, SHA-256 `47d397d98ed797e2e5e1f7f96c10ba9c3f93d3a3b54b45fbc61401a553c3399c`.

This evidence was regenerated directly from Sprite 2456 in the raw SWF. It does not infer behavior from the TypeScript implementation or existing tests.

## Normal ranged call uses `ss = 5`

Inside `scd()`, the ranged branch for the ranged unit classes reaches the direct call at raw offsets `0x219D09`-equivalent decimal `2200809..2200828`:

- pushes `5`, the current soldier, and the selected target in reverse AVM1 argument order;
- calls `atck` with three arguments.

The resulting source-order call is `atck(target, attacker, 5)`.

`atck` is a `DefineFunction2` at decimal offset `2219552`, body `2219579..2228784`, with parameters:

- register 3 = `sa` = target;
- register 5 = `sb` = attacker;
- register 16 = `ss` = 5 for this ranged path.

Therefore `ss` is not a technique ID here. Earlier readings that compared `ss` with technique numbers such as shooting/sniping/bombardment were incorrect.

## Facing direction is target → attacker

`atck()` computes:

- `reg23 = attacker._x - target._x` at `2220110..2220126`;
- `reg25 = attacker._y - target._y` at `2220128..2220149`;
- `Math.atan2(reg25, reg23)` at `2220150..2220175`;
- divide by `0.75`, round, then add 5 at `2220176..2220217`;
- wrap values greater than 8 back by 8.

This becomes local direction register `reg12`. Thus the initial `fi` points from the target toward the attacker.

The target is assigned `k = 10` and `fi = reg12` at `2221756..2221778`, so the hit target faces the attacker during the reaction.

## The movement direction is then reversed by four directions

After the hit/guard visual branch rejoins, `atck()` performs:

- `reg12 += 4` at `2223956..2223971`;
- if the result is greater than 8, subtract 8 at `2223972..2224004`.

This is an exact 180-degree direction reversal. The movement direction therefore points from the attacker away through the target, even though the target continues to face the attacker.

## Ranged target receives the full 10-unit impulse; attacker gets no new recoil

The common impulse tail starts with `reg20 = 10` at `2224873..2224885`.

The close-contact branch checks `ss == 1` / `ss <= 4` at `2224943..2224978`. For normal ranged resolution `ss = 5`, execution takes the `ss > 4` path and jumps directly to `2225071`. It therefore skips:

- halving `reg20` to 5;
- the `attacker.fx/fy = -direction * 10` assignment used by the close-contact branch.

The ranged path then assigns the target:

- `target.fx = root.fx[reversedFi] * 10` at `2225071..2225093`;
- `target.fy = root.fy[reversedFi] * 10` at `2225094..2225116`.

The same common impulse tail is reached after the hit/guard result branches, so the ranged target impulse remains the full 10 units when the shot is guarded as well.

In an isolated fresh ranged activation, the shooter receives no new `fx/fy` recoil from this ranged tail.

## Direction arrays

The root arrays are directly initialized near the end of Sprite 2456 (`2252500..2252675`). Accounting for AVM1 reverse argument push order, they are:

`fx = [0, -1, -0.6, 0, 0.6, 1, 0.6, 0, -0.6]`

`fy = [0, 0, -0.6, -1, -0.6, 0, 0.6, 1, 0.6]`

These match the eight-direction table used by the reconstruction.

## Ten `k` ticks with 0.7 decay

The main `d()` updater handles nonzero `k` by decrementing `k`, applying the current impulse to position, then decaying both components:

- `k = k - 1` at `2197109..2197122`;
- `_x += fx` at `2197123..2197144`;
- `_y += fy` at `2197145..2197166`;
- `fx *= 0.7` at `2197167..2197192`;
- `fy *= 0.7` at `2197193..2197218`.

With ranged `k = 10`, the first raw movement tick is 10 source units on a cardinal axis, followed by 7, 4.9, and so on for the remaining `k` ticks. The encoded value 10 is therefore the initial impulse component, not the total accumulated displacement.

## Reconstruction consequence

For a shooter at source x=500 and target at source x=700 on the same y-coordinate:

- target facing after `atck()` is left, toward the shooter;
- the impulse direction is reversed to the right;
- the first raw movement tick changes target source x by `+10`;
- the shooter receives no new ranged recoil.

The conformance test must preserve this face-toward / move-away distinction.
