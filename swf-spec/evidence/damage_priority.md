# Damage reaction order — raw SWF re-audit

Source fixed for this audit: `/mnt/data/sengoku_jumble_recovered.zip` → `sgjbgm.swf`, SHA-256 `47d397d98ed797e2e5e1f7f96c10ba9c3f93d3a3b54b45fbc61401a553c3399c`, 3,814,810 bytes, CWS, SWF v7, 24 fps. The SWF was directly decompressed and the battle AVM1 (`atck`, `d`, `tiky`) was regenerated in the current runtime.

The former rule `death > hit_stun > emergency_retreat` was incorrect for a fatal hit.

## Fatal hits still enter `k = 10`

In original `atck()`, the struck soldier receives `k = 10` before the HP subtraction path. The main battle updater `d()` tests `k` at its top. If `k != 0`, it skips the ordinary state machine, decrements `k`, and applies the hit-response movement/decay.

The HP-death branch in `d()` requires both `hp < 1` and `k == 0` before calling `tiky()` (`d` around `0x2cd9..0x2d33`). `tiky()` then sets the soldier state `p = 99`.

Therefore a hit that reduces HP below one does not skip the hit reaction. The confirmed order for a fresh damaging hit is:

1. establish the hit reaction (`k = 10`);
2. reduce HP;
3. while `k != 0`, consume the hit reaction updates;
4. once `k == 0`, if `hp < 1`, call `tiky()` and enter death state 99;
5. only surviving units proceed to emergency-retreat / ordinary state handling.

A critical-but-surviving hit similarly cannot begin retreat movement while the `k` hit reaction is still active. Additional damage must not be hidden by making hit reaction itself invulnerable; the rule is ordering, not immunity.
