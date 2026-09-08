# Raw SWF full re-audit — 2026-09-09

Primary source for this audit is the user-provided recovery archive already attached to this conversation: `/mnt/data/sengoku_jumble_recovered.zip`. The contained `sgjbgm.swf` was extracted directly and verified as 3,814,810 bytes, CWS, SWF v7, 24 fps, SHA-256 `47d397d98ed797e2e5e1f7f96c10ba9c3f93d3a3b54b45fbc61401a553c3399c`.

The SWF was decompressed in the current runtime and its tag stream / AVM1 was regenerated directly. The scan produced 389 `DoAction` blocks and 251 `DefineSprite` tags. The main battle logic is Sprite 2456 and exposes the original `d`, `tiky`, `scd`, `nige`, `atck`, `shk2`, `sz`, `spl`, and related functions.

This re-audit was necessary because earlier conformance work stopped reopening the already-provided SWF and relied on retained summaries. A GREEN test only proves agreement with the encoded specification; it does not prove that specification was read correctly from the original. Every previously promoted rule below was therefore checked again against the raw SWF.

## Re-audit result

### Confirmed and retained

- 36-unit collision grid and 996/997 central base-damage cells.
- Upper/lower base-front cells are recovery/wall cells, not extra base-damage lanes.
- No original full-base-image rectangle snapback mechanism.
- Retreat 91/92 -> entry-committed 93/94 -> recovery tile 999/998 -> healing 97/98.
- Healing `mp/400` each logic update, s20 doubling, strict over-max exit, p7 rejoin coordinates and strict Manhattan `< 50` completion.
- TRAP source-half boundary and active-state retrigger suppression already encoded in the conformance suite.
- Ranged directional pose selection `gotoAndStop(fi + 40)` and `k = 10` action lock.
- One `atck()` call per successful ranged `spl()` activation.
- General command path `sz(mode=4)` -> recipient `fr.kb` -> Sprite 671 -> recipient `spl()`.
- Ranged `scd()` `kd > 200` rollover / s21 retention semantics.

### Corrected after raw re-audit

1. **Generic DOUBLE_SPECIAL max-two rule removed.** Non-ranged and ranged `scd()` branches are different. Non-ranged retains `kd` once then the next eligible crossing is overflow-reset; ranged uses `kd -= 200` and may retain across more than one successive gauge opportunity. There is no global max-two rule.
2. **Non-ranged gauge promoted from unconfirmed to confirmed.** Raw `scd()` shows strict `kd > 400`, `sp == 0`, reset/retain decision before exactly one `spl()` call, and the `399 + kp` / `<= 40` s21 branch.
3. **Gauge scheduler confirmed and initial phase corrected.** The battle clip initializes `tc = 19`, increments on every EnterFrame, runs `scd()` for `tc > 22`, then resets `tc = 0`: steady interval 23 frames, first call after four frames.
4. **Fatal-hit ordering corrected.** Original `atck()` establishes `k = 10` before HP subtraction. `d()` does not call `tiky()` for `hp < 1` until `k == 0`; death state is p99. Fatal hits therefore finish the hit reaction before death transition.
5. **Projectile Sprite1002 metadata corrected from four to five frames.** Frames 2-4 are the visible projectile sequence; frame 5 removes/stops. One-shot cardinality remains unchanged.

All corrections are required to be represented by executable conformance tests before the branch is considered GREEN again.
