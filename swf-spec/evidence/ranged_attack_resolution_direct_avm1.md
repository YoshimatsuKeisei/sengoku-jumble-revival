# Ranged attack resolution — direct AVM1 evidence

Primary source: recovered `sgjbgm.swf`, SHA-256 `47d397d98ed797e2e5e1f7f96c10ba9c3f93d3a3b54b45fbc61401a553c3399c`, SWF v7, 24 fps. The relevant code is in Sprite2456. This note was rechecked from the raw `scd()` and `atck()` AVM1 rather than inferred from the reconstruction.

## Ranged scheduler and target latch

`scd()` selects the ranged branch for the archer and teppou character codes. An existing `l` bypasses the ordinary local acquisition scan. When that latched target is outside `tk`, the already-consumed gauge opportunity simply produces no shot; there is no fallback to a different in-range enemy.

When `l == -1`, the scan uses the 36-source-unit `f[][]` grid. Its origin is the predicted next position, equivalent to `round((_x + x) / 36), round((_y + y) / 36)`, not a nearest-enemy sort from the current point. The grid loops are traversed in source order and the first eligible opposing occupant is used.

The unlatched scan calls `atck()` with selector/distance value `5`. A normal activation against an existing `l` calls `atck()` with the measured Euclidean distance. General-command forced ranged `spl()` requires the recipient's existing `l`; it does not invent a replacement target.

## Gameplay resolves inside atck(), not at projectile arrival

For ranged `ss > 4`, defense, HP mutation, and the target response are resolved during `atck()` itself. The arrow/projectile child timeline is visual state. There is no second gameplay range check when the visual reaches the target and no gameplay dependency on later target coordinates.

Accordingly, the reconstruction should sample the visual impact point when the attack is launched. A target moving after launch must not make the visual projectile home to its new coordinates, and it must not cause a second damage/defense resolution at visual arrival.

## Fire arrow ordering (ac15)

The primary defender's raw `s33` / KATON flag is checked before the special ranged pre-effect block. For `ac == 15`, the primary loses one HP from the fire effect before the ordinary direct-arrow defense comparison. The later direct arrow remains guardable.

Therefore a guarded fire arrow can still have already applied the one-point fire pre-effect. Primary KATON suppresses that fire pre-effect but does not suppress the later direct arrow itself.

## Horoku and bombardment ordering (ac16 / ac17)

For `ac == 16` and `ac == 17` the raw sequence is:

1. If the primary is not KATON-protected, the primary receives one pre-defense explosion damage.
2. The code derives the predicted primary grid cell from defender position plus its stored movement vector.
3. A 3 x 3 `f[][]` neighborhood is scanned and each opposing occupant found there loses one HP. The primary cell normally participates in this pass, so the primary commonly receives a second explosion point.
4. Only after the explosion pass does the ordinary direct arrow/bullet defense comparison run.
5. The later direct component is applied only if that defense succeeds as a hit.

There is no independent defense roll inside the 3 x 3 explosion loop. The `s33` / KATON check is also primary-scoped: if the primary has KATON, the whole pre-effect block, including the neighborhood scan, is skipped. If the primary does not have KATON, splash occupants do not get their own KATON test inside that loop.

## Ranged k and impulse

The ranged response converges on `k = 10` for the defender on both hit and guard. The raw response uses a 10-source-unit `fx/fy` vector that decays by `0.7` on subsequent logic ticks. The ordinary-contact IRON_WALL branch that halves the defender response and gives the attacker opposite recoil is skipped for ranged `ss > 4`; ranged IRON_WALL therefore still uses the normal 10-unit defender response and no attacker recoil.

## Safe-port status in this branch

This isolated probe implements:

- existing-target latch behavior and the predicted 36-unit no-l grid scan;
- no target invention for general-forced ranged activation;
- synchronous launch-time damage/defense resolution;
- launch-time projectile impact sampling with visual-only projectile travel;
- fire-arrow / horoku / bombardment pre-effect ordering and primary-scoped KATON semantics;
- the confirmed defender 10-tick action lock / hit-stun response for hit and guard.

The confirmed 10-source-unit decaying `fx/fy` displacement is deliberately **not** enabled in this probe. The original `b191f74` implementation depended on `rawCombatImpulseSystem` inherited from the rejected `f5babce` movement/contact lineage. Importing that positioning layer would risk reintroducing the previously observed circular/snake-like movement regression. The displacement must therefore be added later as its own isolated visual-regression probe after this ranged-resolution stage is accepted.
