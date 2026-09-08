# Ranged attack cycle evidence

Source: original `sgjbgm.swf`, SHA-256 `47d397d98ed797e2e5e1f7f96c10ba9c3f93d3a3b54b45fbc61401a553c3399c` (3,814,810 bytes, CWS, SWF v7, 24 fps). The cadence, launch, and gauge statements below come directly from regenerated AVM1 (`spl`, `atck`, battle update `d`, gauge routine `scd`) and the extracted character/effect timelines.

## Important correction: frames 41-48 are directions, not elapsed attack frames

The earlier reconstruction interpreted character frames `41-48` as an eight-frame animation interval and used that as an eight-tick action lock. Direct AVM1 disproves that interpretation.

For the common ranged branch, `spl()` stores the facing index `fi` and selects the character pose with `gotoAndStop(fi + 40)`. `fi` is the eight-direction facing index, so source frames 41 through 48 are eight directional attack poses. They are not played sequentially at 24 fps and cannot establish an eight-tick cadence by themselves.

## Confirmed original ranged lock: `k = 10`

The ranged `spl()` branch requires `k == 0` before resolving the shot. It calls `atck()` exactly once for that successful activation, and the attack resolution sets the attacker's `k = 10`. The battle updater `d()` decrements non-zero `k` by one while ordinary action processing is skipped. The reconstruction therefore models a 10-logic-step ranged action lock.

## One ranged activation resolves one shot

One successful ranged `spl()` execution contains one call to `atck()`; there is no repeated `atck()` loop for that activation. Archer Sprite `1033` and teppou Sprite `1982` share projectile child Sprite `1002`, instance name `ya`, with one active projectile child in the selected directional pose. Sprite 1002 is a non-looping four-frame visual (transparent frame followed by three bitmap frames). The child timeline is playback of one projectile effect, not multiple launches.

## GENERAL_COMMAND interaction

General command reaches the recipient's own `spl()` through the original `fr.kb` callback. A commanded archer/teppou therefore uses the same `k == 0` physical/action gate and receives the same `k = 10` post-attack lock, while the command path itself does not require the recipient's normal gauge trigger.

## Confirmed ranged gauge rollover: `scd()`

The unresolved banking behavior is directly visible in the original `scd()` routine. For ranged character codes `ch == 2` and `ch == 6`, the SWF uses `kd` as the accumulated gauge and `kp` as the amount added on each gauge-processing step.

The relevant AVM1 sequence is:

- `0x0795-0x07aa`: `kd = kd + kp`.
- `0x07ab-0x07bd`: continue only when `kd > 200`; the threshold is strict.
- `0x07c2-0x07e1`: test for special ability `s21` (連発 / DOUBLE_SPECIAL).
- without `s21`, `0x07e6-0x07fb` immediately performs `kd = kd - 200`.
- with `s21`, `0x0801-0x0819` checks whether `kd > 399 + kp`; overflow forces the normal 200-point subtraction.
- otherwise `0x081f-0x0847` evaluates `Math.random() * 100 <= 40`. Only that retention result skips the subtraction; the other result executes the same `kd -= 200` at `0x084c-0x0861`.
- only after this consume/retain decision does the routine calculate target distance and check range, `k == 0`, battle state, and finally call `atck()` at `0x0961-0x0977`.

This ordering is important: crossing the ranged threshold is processed before the SWF knows whether the shot will actually pass its later range/action checks. A missed attack opportunity therefore does not leave an arbitrarily banked ready gauge waiting for a future target.

There is no separate literal hard-cap assignment such as `kd = max(...)` or `min(...)`. The correct model is instead a dynamic rollover rule: every ranged gauge-processing step adds `kp`, and every strict `kd > 200` crossing is immediately consumed by 200 unless the `s21` retention branch succeeds. Even `s21` retention is bounded by the `399 + kp` overflow guard, which forces consumption once exceeded.

Therefore the old reconstruction scenario in which an idle ranged soldier accumulates `kd`/`combatGauge` to 1000 and later dumps that bank is not original SWF behavior. `RANGED_GAUGE_BANKING_LIMIT` is confirmed as **no explicit fixed cap, but no arbitrary unbounded banking either**. The reconstruction must model threshold-time consumption/retention rather than inventing a fixed maximum.

The existing reconstruction cadence constant for when gauge-processing steps occur is not re-derived by this evidence. This finding changes the banking/consumption semantics only; it does not independently change the scheduler interval.
