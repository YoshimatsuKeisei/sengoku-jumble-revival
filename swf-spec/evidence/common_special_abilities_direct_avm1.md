# Common special abilities s7..s22 — direct AVM1 audit

Source fixed for this audit: recovered `sgjbgm.swf`, SHA-256 `47d397d98ed797e2e5e1f7f96c10ba9c3f93d3a3b54b45fbc61401a553c3399c`, 3,814,810 bytes, CWS, SWF v7, 24 fps. The findings below come from the battle Sprite2456 AVM1, especially `d()`, `atck()`, `tat()`, `sz()`, `scd()`, `nige()`, and the roster-draw helpers.

This document audits battle behavior. It does **not** claim that the revival's prototype random ability-assignment helper reproduces the original game's character-generation probabilities; assignment/generation is a separate concern from the battle hooks below.

| code | label | direct battle finding | revival disposition |
|---|---|---|---|
| s7 | 突進 | charge-state non-contact retarget is suppressed for `random*100 <= 70`; normal contact still retargets | retained |
| s8 | 攻略 | base HP and `rsj` both change by 2; normal hit changes both by 1; `rsj` increment occurs before base HP is clamped | corrected |
| s9/s9s | 討取 | after preceding successful-hit damage, adds one when resulting target HP is `< 6` | retained |
| s10 | 膂力 | adds one successful-hit damage component | retained |
| s11 | 鉄壁 | does not raise guard probability; guarded knockback is halved from source 10 to 5 in the confirmed normal guard path | retained |
| s12 | 母衣 | ranged defense forced to success when `random*100 > 30` (70% branch) | retained |
| s13 | 奮起 | on allied retreat, every holder with `p < 89` gets `k=16`, `fx=fy=0`, then `sz(holder,5)` | corrected holder/target gating |
| s14 | 治療 | nearest same-side holder with `p < 88`, strict Manhattan `<760`, plus mirrored ±30 X-direction gate; `tat()` heals `floor(mp*.2)+2`, twice with s20, then leaves `k=12`, `kf=1` | corrected |
| s15 | 鼓舞 | on enemy retreat, every holder with `p < 89` gets the same `k=16` + `sz(holder,5)` behavior | corrected holder/target gating |
| s16 | 療所 | `mrjo/erjo` perform exactly 3 roster draws with replacement and retain the **last** matching holder; arrival heals 30 with clamp | corrected draw/cardinality attribution |
| s17 | 仕掛 | `mskk/eskk` perform exactly 2 roster draws with replacement and consume both draws | corrected draw consumption; active port intentionally keeps fixed-fence contact trigger |
| s18 | 堅陣 | `mkjn/ekjn` perform exactly 2 roster draws; selected holder succeeds only at strict `random*100 > 50`; loop never early-returns | corrected |
| s19 | 見切 | special-attack defense path is made guard-capable before the ordinary defense roll | retained |
| s20 | 回復 | `sz(5/6)` gives +1 HP and another +1 for s20, but recovery merit is still +1 per healed target; base recovery doubles; `tat()` doubles treatment and invokes an s20 support pulse | corrected pulse eligibility/order where needed |
| s21 | 連発 | retention comparison is inclusive `random*100 <= 40`; ranged and non-ranged gauge retention cardinality differ as documented separately | player boundary corrected; AI retained |
| s22 | 逃足 | retreat speed adds 2, capped at 8, and normal speed is restored after recovery/treatment | retained |

## `sz()` recovery pulse: HP and merit are deliberately different

Direct `sz()` excerpt around offsets `0x02236103..0x02237189` establishes the common target gate and mode-5 recovery behavior:

- candidate team equals source team;
- candidate `p < 89`;
- candidate is explicitly not the source (`reg3 != reg4`);
- only a target below max HP is processed;
- HP increments once;
- s20 increments HP once more;
- HP is clamped to max;
- for the player-side merit branch, source `rsk` increments **once**.

The mirrored mode-6 branch at `0x02237244..0x02237425` uses the same +1 / optional +1 HP and one `rsk` increment structure. Therefore a two-HP s20 pulse is one recovery-merit event, not two.

## s13 / s15 trigger eligibility

`atck()` player-side retreat handling checks s15 at `0x02226520` and s13 at `0x02226815`. Each holder is gated by `p < 89`, then receives `k=16`, `fx=0`, `fy=0`, and calls `sz(holder,5)`. The raw branch does not additionally require combat idle, no hit reaction, or no active technique. Reusing the revival's stricter generic action-capability predicate therefore suppressed valid source triggers.

## s14 treatment selection and completion

Player-side search begins around `0x02225641`:

- holder has s14;
- holder is not patient;
- holder `p < 88`;
- nearest by Manhattan distance;
- strict distance `<760`;
- strict `holder._x - 30 < patient._x`.

Enemy-side search around `0x02227275` mirrors the direction condition as `holder._x + 30 > patient._x`.

`tat()` starts at `0x02231798`. With s20 it first sets `k=16`, zeroes forced movement, and invokes `sz(patient,5)`. It then performs the treatment addition twice for s20 and once otherwise. After clamp and recovery-merit attribution it restores the prior state and explicitly assigns `k=12` and `kf=1`.

## s16 / s17 / s18 roster draws

- `mkjn()` `0x02208781`: attempts 1 and 2, strict `random*100 > 50`, no early return.
- `ekjn()` `0x02209068`: mirrored enemy equivalent.
- `mrjo()` `0x02209338`: attempts 1..3, last matching s16 holder retained.
- `erjo()` `0x02209578`: mirrored enemy equivalent.
- `mskk()` `0x02209801`: attempts 1..2, last matching s17 holder retained.
- `eskk()` `0x02210041`: mirrored enemy equivalent.

These helpers sample roster slots with replacement. Player slot zero is remapped to `m200` by the raw player-side helpers.

## s8 base merit

In `d()` around `0x02191944`, s8 performs `ecp -= 2` and then `attacker.rsj += 2`. Without s8, `ecp--` and `rsj += 1`. Only afterward, at approximately `0x02192115`, base HP below 1 is clamped to zero and the battle-end path begins. There is no separate capture `rsj +2` bonus in this branch. A finishing s8 hit at one remaining base HP therefore still credits two `rsj` points.

## Intentional TRAP trigger divergence

The raw battle code also contains the historical source-X half-field trap check. The revival intentionally does **not** restore an invisible X=900 trigger line: by project decision, active TRAP checks occur on new contact with the enemy-owned fixed fence. This audit only corrects the raw two-draw sampling semantics and leaves that intentional trigger substitution intact.
