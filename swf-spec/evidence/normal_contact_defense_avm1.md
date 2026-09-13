# Raw AVM1 evidence: mode-0 normal-contact defense

Source: recovered `sgjbgm.swf`, `atck(sa, sb, ss)` with the normal-contact call mode `ss=0`.

## Confirmed bytecode order

- `2220328..2220358`: `Math.random()*200` is evaluated first and stored as the defense roll (`r18`). This happens before the later HORO branch.
- `2221590..2221652`: the gun-specific class branch may force `r18=999`; this is not the ordinary mode-0 melee path integrated in this stage.
- `2221657..2221689`: defender ability list `ss` is checked for raw `s12` (HORO / 母衣).
- `2221694..2221724`: when HORO is present, a second `Math.random()*100` roll is evaluated.
- `2221724..2221755`: only when that second percentage is **strictly greater than 30** is `r18` overwritten with `0`. Equality at 30 does not overwrite the original defense roll.
- `2221756..2221778`: defender `k=10` and facing are assigned later. Those effects are outside this isolated defense-integration stage.
- `2221779..2221809`: ordinary mode-0 hit/guard resolution uses `r18 > defender.df` for a hit. Therefore guard is the complementary `r18 <= defender.df` case.

## Consequences for the revival

For ordinary normal-contact melee only:

1. consume one random draw for `roll = random*200`;
2. if defender has HORO, consume a second draw;
3. if `second*100 > 30`, force guard by treating the roll as zero;
4. otherwise compare the original first roll against defense with `<=` meaning guard.

This stage deliberately does not alter damage, `k=10`, hit reaction duration, knockback direction/distance, death timing, or ranged-defense behavior.
