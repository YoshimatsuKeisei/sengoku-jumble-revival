# DOUBLE_SPECIAL / 連発 — raw SWF re-audit

Source fixed for this audit: `/mnt/data/sengoku_jumble_recovered.zip` → `sgjbgm.swf`, SHA-256 `47d397d98ed797e2e5e1f7f96c10ba9c3f93d3a3b54b45fbc61401a553c3399c`, 3,814,810 bytes, CWS, SWF v7, 24 fps. The SWF was decompressed directly and 389 AVM1 `DoAction` blocks were regenerated. The rules below come from the original `scd()` function, not from the previous project summary.

The previous generic rule “one successful 連発 occurrence is always capped to exactly two total activations” was too broad and is withdrawn.

## Non-ranged branch

At `scd()` offsets `0x09c0..0x0aad`, non-ranged units execute `kd += kp`, then require strict `kd > 400` and `sp == 0`.

Without `s21`, the SWF assigns `kd = 0` before calling `spl()`.

With `s21`, it first tests `kd > 399 + kp`. Overflow forces `kd = 0`. Otherwise it evaluates `Math.random() * 100 <= 40`; success preserves `kd`, failure resets `kd = 0`. `spl()` is called after that decision.

Because a successful retention necessarily leaves `kd > 400`, the next eligible gauge step adds another `kp`, which makes the value greater than `399 + kp` and therefore forces reset. Thus the non-ranged branch can retain one following gauge-trigger opportunity, but this is a gauge-retention mechanism, not an immediate recursive call made by the runtime.

## Ranged branch

At `scd()` offsets `0x0795..0x0861`, ranged units use strict `kd > 200`. Normal consumption is `kd -= 200`; `s21` may skip that subtraction when `kd <= 399 + kp` and `Math.random() * 100 <= 40`.

Because the ranged branch subtracts 200 rather than resetting to zero, a retained ranged gauge can satisfy later threshold opportunities more than once. Therefore there is no valid global “max two activations” rule covering both ranged and non-ranged units.

Conformance must model the two branches separately.
