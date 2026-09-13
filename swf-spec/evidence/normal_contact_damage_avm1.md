# Raw AVM1 evidence: normal-contact damage order

Source: recovered `sgjbgm.swf`, `atck(sa, sb, ss)` body. For normal contact, `sa` is the defender, `sb` is the attacker, and `ss == 0`.

The successful normal-contact hit branch applies damage in-place to `sa.hp` in this exact order:

1. `2221831..2221865`: store pre-hit HP in register 26, then subtract the unconditional base 1 damage.
2. `2221866..2221923`: if attacker `ss` contains `s10` (膂力 / MIGHT), subtract another 1.
3. `2221924..2222006`: if attacker `ss` contains `s9s` (討取 / FINISHER), read the defender's **current HP after base + MIGHT**, compare it with strict `< 6`, and subtract 1 only when that condition is true.
4. `2222007..2222089`: if attacker `ss` contains `s34` (忍狩 / NINJA_HUNTER) and defender `ch == 7` (ninja), subtract another 1.

Therefore NINJA_HUNTER must not contribute to the FINISHER threshold check. A useful distinguishing case is a ninja defender at HP 7 with FINISHER + NINJA_HUNTER and no MIGHT:

- base 1: HP 7 -> 6
- FINISHER check: `6 < 6` is false
- NINJA_HUNTER: HP 6 -> 5
- total damage = 2

If NINJA_HUNTER is incorrectly applied before FINISHER, that same case becomes 3 damage, which does not match the AVM1 sequence.

This stage intentionally changes only `calculateNormalAttackDamage()`. The shared technique/special damage helper remains untouched so ranged and special-technique paths are not broadened by this normal-contact migration.
