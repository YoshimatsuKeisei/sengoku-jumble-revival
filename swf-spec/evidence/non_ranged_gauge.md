# Non-ranged special gauge and scheduler — raw SWF re-audit

Source fixed for this audit: `/mnt/data/sengoku_jumble_recovered.zip` → `sgjbgm.swf`, SHA-256 `47d397d98ed797e2e5e1f7f96c10ba9c3f93d3a3b54b45fbc61401a553c3399c`, 3,814,810 bytes, CWS, SWF v7, 24 fps. The SWF was directly decompressed and its AVM1 regenerated in the current runtime.

## Non-ranged `scd()`

The original `scd()` instruction sequence at `0x09c0..0x0aad` is unambiguous:

- `kd = kd + kp`;
- continue only for strict `kd > 400`;
- additionally require `sp == 0`;
- without `s21`, assign `kd = 0`;
- with `s21`, overflow `kd > 399 + kp` forces `kd = 0`;
- otherwise `Math.random() * 100 <= 40` preserves `kd`, while failure assigns `kd = 0`;
- after the consume/retain decision, call `spl(unit)` exactly once.

The previous `unconfirmed` entry was an audit error caused by not reopening the already-provided SWF. It is superseded by this direct instruction evidence.

The important ordering is that the gauge decision belongs to `scd()`. A reconstruction must not run a second independent 連発 random decision later inside `beginTechniqueAction()`.

## Gauge scheduler

The battle clip initializes `tc = 19`. Its EnterFrame ClipAction increments `tc` every frame, tests strict `tc > 22`, then resets `tc = 0` and calls `_parent.scd()`.

Therefore:

- steady-state `scd()` interval = 23 logic frames;
- initial counter = 19;
- first `scd()` after initialization occurs after 4 EnterFrame updates, not after a full 23-frame wait.

This directly confirms the steady interval and also identifies an initial-phase difference in the reconstruction that previously initialized the timer from zero/null.
