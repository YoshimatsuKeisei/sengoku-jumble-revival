# Raw normal-contact k lock and impulse evidence

Direct source: `sgjbgm.swf`, AVM1 `atck(sa, sb, ss)` and `d(i)`.

For normal contact (`ss = 0`):

- defender facing `fi` is computed toward the attacker;
- after the facing/pose section the direction is rotated by four slots (wrapped 1..8) before the ordinary defender `fx/fy` are assigned, so physical motion is **away from the attacker**;
- ordinary defender impulse starts at 10 source units and decays by `0.7` on each later `d()` k-branch update;
- both participants receive `k = 10` from `atck()`; because the current `d()` invocation already passed the `k != 0` branch, the next ten `d()` calls consume `k = 10..1`, and ordinary logic resumes on the following call;
- `s11` / IRON_WALL successful guard changes the defender outward impulse to 5 source units and gives the attacker a 10-source-unit recoil away from the defender;
- attacker facing after resolution is the direction opposite the defender-facing `fi` while the defender remains alive.

Direct `d(i)` control flow also fixes an important integration detail. At the top of `d(i)`, `k != 0` jumps directly to the k branch. That branch decrements `k`, proposes `_x + fx` / `_y + fy`, multiplies `fx/fy` by `0.7`, applies the proposed point only when the destination grid cell is free, and does **not** execute the later ordinary dynamic-contact / 32-24 / k=3 branch for that update. Therefore a normal-contact `atck()` participant must not receive the separate physical-contact k=3 impulse while its atck-created k=10 lock is active.

For an unobstructed cardinal ordinary hit, the raw ten-tick displacement is the geometric sum `10 * (1 - 0.7^10) / (1 - 0.7) = 32.39174293...` SWF source units. This is a useful audit value, not a replacement tuning constant. A revival result larger than that after coordinate conversion indicates another movement source is stacking on top of raw `fx/fy` rather than evidence that the raw initial value should be arbitrarily reduced.

This is the sign distinction missed by rejected commit `e82ac536a...`: the defender must **face toward** the attacker but **move in the opposite direction**.

Revival mapping in this stage:

- `abilityActionLockUntil` remains the compatibility carrier for the movement/action lock, while a dedicated raw-normal-contact k runtime also tells the sequential contact resolver to skip its ordinary physical branch for the same interval;
- the existing `HIT_STUN` duration is retained for the visual hit pose, but its legacy proportional knockback distance is set to zero for normal melee because raw `fx/fy` now owns displacement;
- `rawCombatImpulseSystem` performs the 24 Hz, 0.7-decay displacement already validated by ranged-hit behavior.
