# Ranged attack resolution — direct AVM1 evidence

Canonical source: `/mnt/data/sengoku_jumble_recovered/sengoku_jumble_recovered/sgjbgm.swf`, SHA-256 `47d397d98ed797e2e5e1f7f96c10ba9c3f93d3a3b54b45fbc61401a553c3399c`, SWF v7, 24 fps.

The relevant Sprite2456 AVM1 functions were disassembled with the parent ConstantPool preserved. `atck(sa,sb,ss)` uses `sa` as defender, `sb` as attacker, and the third argument `ss` as the ranged distance/special selector. Ordinary contact passes `0`; normal ranged `scd()` passes the measured distance; the local no-`l` scan passes `5`.

## Ranged scheduler and target latch

`scd()` selects the ranged branch for `ch == 2` (archer) and `ch == 6` (teppou).

At `0x2192f8..0x21933b`, an existing `l` bypasses the local scan unless the raw `pp` special cases 14/15 apply. When `l == -1`, the scan computes its cell window from `tk` and the 36-unit grid and takes the first opposing `p < 95` unit encountered. It does not perform a nearest-enemy sort.

At `0x219572..0x21963f`, `kd += kp` and the strict `kd > 200` consumption/`s21` retention decision happens before range, `k`, or target-state checks. With an existing `l`, `0x21963f..0x219738` computes the Euclidean distance only to that latched target. If it is outside `tk`, the already-consumed activation opportunity simply produces no shot; there is no fallback to a different in-range enemy. A successful normal ranged activation calls `atck(distance,self,l)` at `0x21973e..0x219755`.

The `l == -1` scan calls `atck(5,self,candidate)` at `0x2194e9..0x2194fd`. General-command forced callbacks reach the ranged `spl()` branch instead; that branch requires an existing `l` and likewise does not invent a replacement target.

## Gameplay resolves inside `atck()`, not at projectile arrival

At `0x21e14b`, `ss > 4` enters the ranged part of `atck()`. The visual range/orientation values (`sr`, `sl`) are configured there, but HP effects and defense are resolved in the same function call. The projectile child timeline is therefore visual state, not a delayed gameplay hit test.

The ordinary defense sample (`Math.random()*200`) is already stored before the ranged effect branch. Defender `k = 10` is assigned at `0x21e6bc`, and the direct weapon HP decrement begins at `0x21e714`. Attacker `k = 10` is assigned later at `0x21ef85`. There is no second range check at projectile arrival and no live-target homing dependency for damage.

## ac15 fire arrow ordering

At `0x21e20e`, the ranged pre-effect block first checks raw `s33` (KATON) on the PRIMARY defender.

For `ac == 15`, `0x21e272..0x21e2d7`:

- switches the primary effect to `fire`;
- if primary HP is still positive, decrements HP by 1;
- only after returning to the common path does the normal defense comparison run at `0x21e6d3..0x21e6f1`;
- the direct arrow damage then runs on the hit branch.

Therefore fire damage is pre-defense/unguardable, while the direct arrow component remains guardable. Primary KATON skips the fire component but not the later direct arrow.

## ac16 horoku and ac17 bombardment ordering

`ac == 16` and `ac == 17` share the branch beginning at `0x21e2dc`.

1. The primary receives `exp` and loses 1 HP if positive (`0x21e2dc..0x21e340`).
2. The code computes a predicted target grid position from defender position plus its stored movement vector.
3. `0x21e3ee..0x21e4fe` scans a 3 x 3 grid. For each opposing `p < 95` occupant, it plays `exp` and decrements HP by 1 if positive.
4. Only after the whole explosion scan does execution reach the ordinary defense decision at `0x21e6bc..0x21e6f1` and the direct arrow/bullet hit stack.

There is no defense roll inside the 3 x 3 loop.

### KATON scope is primary-gated

The `s33` test at `0x21e20e..0x21e22e` is performed once on the PRIMARY defender before dispatching ac15/ac16/ac17. If the primary has KATON, the entire pre-effect block is skipped, including the ac16/ac17 3 x 3 explosion scan. If the primary does not have KATON, splash occupants do not receive an individual `s33` check inside that loop.

This is intentionally asymmetric and must not be replaced by per-splash immunity checks.

## Ranged k and impulse

Both hit and guard paths converge on the common response tail. `r20` starts at 10 at `0x21f2e9`. The s11/guard special branch tests `ss == 1 || ss > 4` at `0x21f32f..0x21f352`. For ranged `ss > 4`, it jumps directly to `0x21f3af`, skipping both the `/2` reduction and the attacker's opposite recoil assignment.

Consequently a ranged defender receives the normal 10-unit raw `fx/fy` impulse even when the shot is guarded and even when the defender carries IRON_WALL. The 5-unit IRON_WALL guarded impulse plus opposite 10-unit attacker recoil belongs to the ordinary contact (`ss == 0`) path, not ranged attacks.

The defender `fx/fy` assignment is at `0x21f3af..0x21f3dc`. As with the already-confirmed normal-contact response, subsequent `d()` k-updates apply that stored vector and multiply it by `0.7` per logic tick.

## Reconstruction consequences

The conformance implementation therefore requires:

- skill-gauge opportunity consumption before target/range success;
- no opportunistic fallback when a latched ranged target is merely out of range;
- no new target invention for general-forced ranged `spl()`;
- synchronous arrow/gun gameplay resolution at launch;
- projectile visuals travelling to a launch-time impact point rather than homing to live coordinates;
- ac15 fire before direct defense;
- ac16/ac17 primary + 3 x 3 explosion before direct defense, with no splash guard rolls;
- primary-scoped KATON gating of the whole pre-effect block;
- defender `k=10` and 10-unit decaying impulse on ranged hit or guard;
- no ranged IRON_WALL 5-unit reduction and no ranged attacker recoil.
