# Raw normal-contact k lock and impulse evidence

Direct source: `sgjbgm.swf`, AVM1 `atck(sa, sb, ss)` and `d(i)`.

For normal contact (`ss = 0`):

- defender facing `fi` is computed toward the attacker;
- after the facing/pose section the direction is rotated by four slots (wrapped 1..8) before the ordinary defender `fx/fy` are assigned, so physical motion is **away from the attacker**;
- ordinary defender impulse starts at 10 source units and decays by `0.7` on each later `d()` k-branch update;
- both participants receive `k = 10` from `atck()`; because the current `d()` invocation already passed the `k != 0` branch, the next ten `d()` calls consume `k = 10..1`, and ordinary logic resumes on the following call;
- `s11` / IRON_WALL successful guard changes the defender outward impulse to 5 source units and gives the attacker a 10-source-unit recoil away from the defender;
- attacker facing after resolution is the direction opposite the defender-facing `fi` while the defender remains alive.

This is the sign distinction missed by rejected commit `e82ac536a...`: the defender must **face toward** the attacker but **move in the opposite direction**.

Revival mapping in this stage:

- `abilityActionLockUntil` is used only as the compatibility carrier for the raw k=10 action/movement lock;
- the existing `HIT_STUN` duration is retained for the visual hit pose, but its legacy proportional knockback distance is set to zero for normal melee because raw `fx/fy` now owns displacement;
- `rawCombatImpulseSystem` performs the 24 Hz, 0.7-decay displacement already validated by ranged-hit behavior.
