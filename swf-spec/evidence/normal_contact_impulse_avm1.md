# Raw normal-contact k lock and impulse evidence

Direct source: `sgjbgm.swf`, AVM1 `atck(sa, sb, ss)` and `d(i)`.

For normal contact (`ss = 0`):

- defender facing `fi` is computed toward the attacker;
- after the facing/pose section the direction is rotated by four slots (wrapped 1..8) before the ordinary defender `fx/fy` are assigned, so physical motion is **away from the attacker**;
- ordinary defender impulse starts at 10 source units and decays by `0.7` on each later `d()` k-branch update;
- both participants receive `k = 10` from `atck()`; because the current `d()` invocation already passed the `k != 0` branch, the next ten `d()` calls consume `k = 10..1`, and ordinary logic resumes on the following call;
- `s11` / IRON_WALL successful guard changes the defender outward impulse to 5 source units and gives the attacker a 10-source-unit recoil away from the defender;
- attacker facing after resolution is the direction opposite the defender-facing `fi` while the defender remains alive.

## k-branch movement gate

The displacement is **not** an unconditional ten-tick slide. Direct `d(i)` offsets `2197109..2197317` show this order on every locked update:

1. decrement `k`;
2. compute proposed `x = _x + fx`, `y = _y + fy`;
3. decay both `fx` and `fy` by `0.7`;
4. read `f[round(x / 36)][round(y / 36)]`;
5. write the proposed position only when that shared grid cell is exactly `0`.

At the start of `d(i)`, offsets `2185549..2185682` clear the unit's current dynamic `f[][]` cell when its stored code is below 900. Therefore a nearby soldier in the proposed 36-unit cell can suppress an impulse tick, and that blocked tick still consumes `k` and the 0.7 decay. This is especially important in dense melee: summing `10 + 7 + 4.9 + ...` as unconditional free-space movement exaggerates the visible knockback whenever surrounding soldiers should occupy the proposed cells.

This is the sign distinction missed by rejected commit `e82ac536a...`: the defender must **face toward** the attacker but **move in the opposite direction**. It also explains the excessive-distance device regression in rejected candidate `47def17abc72...`: direction was corrected, but `rawCombatImpulseSystem` initially checked only visual/static obstacles and omitted the raw dynamic `f[][]` gate.

Revival mapping in the corrected stage:

- `abilityActionLockUntil` is used only as the compatibility carrier for the raw k=10 action/movement lock;
- the existing `HIT_STUN` duration is retained for the visual hit pose, but its legacy proportional knockback distance is set to zero for normal melee because raw `fx/fy` now owns displacement;
- `rawCombatImpulseSystem` performs the 24 Hz, 0.7-decay displacement already validated by ranged-hit behavior;
- before each raw impulse move, the proposed 36-unit dynamic contact cell must be unoccupied; a blocked tick advances k/decay without moving the soldier.
