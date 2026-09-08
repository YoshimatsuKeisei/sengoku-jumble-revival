# Ranged attack cycle evidence — raw SWF re-audit

Source fixed for this audit: `/mnt/data/sengoku_jumble_recovered.zip` → `sgjbgm.swf`, SHA-256 `47d397d98ed797e2e5e1f7f96c10ba9c3f93d3a3b54b45fbc61401a553c3399c` (3,814,810 bytes, CWS, SWF v7, 24 fps). The SWF was directly decompressed; 389 AVM1 `DoAction` blocks and the relevant Sprite timelines were regenerated in the current runtime.

## Frames 41-48 are directions, not elapsed attack frames

For the common ranged `spl()` branch, facing index `fi` selects `gotoAndStop(fi + 40)`. Frames 41 through 48 are eight directional attack poses, not a sequential eight-frame cadence.

## Confirmed ranged lock: `k = 10`

The ranged branch requires `k == 0` before resolving the shot. A successful resolution calls `atck()` once and establishes the original `k = 10` action/hit state. The main updater decrements non-zero `k`, so the reconstruction models a ten-logic-step fresh-activation lock.

## One ranged activation resolves one shot

One successful ranged `spl()` contains one `atck()` call; there is no repeated `atck()` loop for that activation. Archer Sprite 1033 and teppou Sprite 1982 share projectile child Sprite 1002, instance name `ya`, with one active child in the selected directional pose.

Direct timeline re-audit corrects one metadata error from the earlier evidence: Sprite 1002 has **5** frames, not 4. Frame 1 is the setup/transparent frame, frames 2-4 display the projectile bitmaps, and frame 5 removes the child and stops. This remains one visual projectile lifecycle, not multiple launches.

## Ranged `scd()` rollover

At `scd()` offsets `0x0795..0x0861`:

- `kd += kp`;
- strict `kd > 200` is required;
- without `s21`, immediately `kd -= 200`;
- with `s21`, `kd > 399 + kp` forces that subtraction;
- otherwise `Math.random() * 100 <= 40` retains the gauge; failure subtracts 200;
- target/range/`k` checks occur only after this consume/retain decision.

There is no explicit fixed hard cap, but arbitrary idle banking is also not original behavior because threshold crossings are processed immediately. The ranged branch's subtraction semantics also mean `s21` retention is not governed by a global “at most two activations” rule.

## Scheduler

A separate direct ClipAction audit confirms `tc = 19` at initialization, `tc++` every EnterFrame, and `scd()` when `tc > 22`, after which `tc = 0`. Thus steady `scd()` cadence is 23 logic frames and the first trigger occurs after 4 frames.
