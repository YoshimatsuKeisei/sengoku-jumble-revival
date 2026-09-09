# Common special abilities s7..s22 — direct AVM1 audit

Source fixed for this audit: recovered `sgjbgm.swf`, SHA-256 `47d397d98ed797e2e5e1f7f96c10ba9c3f93d3a3b54b45fbc61401a553c3399c`, 3,814,810 bytes, CWS, SWF v7, 24 fps. No replacement SWF is used. The CWS body was expanded and the battle Sprite2456 AVM1 was regenerated directly; the principal functions used here are `d()`, `atck()`, `tat()`, `sz()`, `scd()`, `nige()`, `mkjn()/ekjn()`, `mrjo()/erjo()`, and `mskk()/eskk()`.

Evidence grades used below:

- **【確定】**: direct raw SWF / AVM1 branch or value.
- **【強い推定】**: indirect mapping with strong corroboration.
- **【未確定】**: not directly resolved.

This document audits battle behavior. It does **not** claim that the revival's prototype random ability-assignment helper reproduces original character-generation probabilities; assignment/generation is a separate concern.

The task prompt calls s9 `FINISHER` **追撃**. The battle AVM1 itself references the derived token `s9s`, while the current revival UI label table says **討取**. The mechanics below are 【確定】; the Japanese display-wording discrepancy is not changed here because this battle-code audit does not directly decode the original label asset.

## Full 16-ability audit matrix

| raw | 日本語名 | TypeScript ID | raw発動条件 | probability | 対象 | 効果値 | 効果順 | lock / cooldown | merit | 主な相互作用 | player / enemy差 | 現コード | 今回修正 | test ID | 根拠 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| s7 | 突進 | `RUSH` | `atck()`の突撃系・非通常接触retarget分岐 | retarget抑制側 `random*100 <= 70`; `>70`でretarget | 被弾した能力所持兵 | prior target維持 | hit後retarget判定。通常接触は抑制しない | s7固有なし | なし | charge/retarget | mirrored branch、境界同一 | 数式は同値だがraw式でなかった | `random()*100 <= 70`型へ固定 | `CSA-S7-RUSH-RETARGET` | 【確定】 |
| s8 | 攻略 | `SIEGE` | 敵本陣damage cellへ進入し、堅陣でblockされなかった時 | deterministic | 敵本陣 | damage 2（通常1） | base contact bounce/lock → s18 → HP-2 → `rsj+2` → clamp/end | 通常base contact `k=10`相当 | 試行値2を加算。残HP1でも+2。capture bonusなし | s18、NINJA bypass | damage mirrored、raw meritはplayer側 | 旧実装は実ダメージ量で功績化していた | 前段で修正済み維持 | `CSA-S8-SIEGE-BASE-MERIT` | 【確定】 |
| s9 / s9s | 追撃（task）/ 討取（現TS表示） | `FINISHER` | successful `atck()`でbasicとs10適用後のtarget HP `<6` | deterministic | 被弾兵 | +1 damage | **basic → s10 → s9 threshold/+1 → s34忍狩** | s9固有なし | player `rsh`も同順で+1 | s10で閾値へ入れる。s34は閾値に影響してはならない | damage mirrored、raw meritはplayer側 | **不一致**: s34をs9より先に計算 | **今回修正** | `CSA-S9-FINISHER-ORDER` | mechanics【確定】 / 表示語【未確定】 |
| s10 | 膂力 | `MIGHT` | successful unguarded `atck()` | deterministic | 被弾兵 | +1 damage | basic直後、s9より前 | 固有なし | player `rsh +1` | s9閾値を先に満たし得る | mirrored damage | 一致、ただし隣接順序コードが誤っていた | s9/s34順序修正で完全固定 | `CSA-S10-MIGHT-ORDER` | 【確定】 |
| s11 | 鉄壁 | `IRON_WALL` | 通常防御判定が既に成功したguard path | 追加抽選なし | guardした所持兵 | knockback source 10 → 5 | defense success → s11ならknockback半減 | 固有なし | なし | 防御率は上げない | same `atck()` path | 一致 | なし | `CSA-S11-IRON-WALL-KNOCKBACK` | 【確定】 |
| s12 | 母衣 | `HORO` | `atck()` defense phase。通常`random*200`後 | **strict `random*100 >30`**; =30 fail | 防御側所持兵 | stored defense rollを0へ上書き | s19 → defense RNG → attack effects → teppou/ninja例外 **or** s12 RNG → final defense | 固有なし | なし | normalにも適用。`ss=1` specialはs19がない限り最終的にhit。teppou(ch6)→ninja(ch7)はroll=999、s12 skip | same path | **不一致**: ranged限定・順序逆・gun例外逆 | **今回修正** | `CSA-S12-HORO-DEFENSE-ORDER` | 【確定】 |
| s13 | 奮起 | `RALLY_SPIRIT` | 味方がretreatへ入ると同teamの各s13 holder、holder `p<89` | deterministic | holder同teamの`sz(5)`対象、`p<89`、source除外、HP不足 | +1 HP; target s20ならさらに+1 | holder `k=16`,`fx=fy=0` → source-excluding `sz(5)` | `k=16` | holder `rsk +1` / healed target。s20で2HPでも+1 | s20 | team relation mirrored | 旧generic idle/reaction gateが厳しすぎた | 前段修正済み維持 | `CSA-S13-RALLY-PULSE` | 【確定】 |
| s14 | 治療 | `TREATMENT` | same-side holder `p<88`、nearest Manhattan、strict X gate | deterministic after gates | retreat patient | `floor(mp*.2)+2`; s20なら2倍 | s20 patientは先にsource-excluding `sz(5)` → treatment → clamp/merit → `k=12,kf=1` | completion後 `k=12`; base visitまで1回 | healerへactual restored HP | s20、base recovery | player `holderX-30<patientX`; enemy `holderX+30>patientX` | exact30がfloat round-tripで誤通過した | 前段でworld-space strict比較へ修正済み | `CSA-S14-TREATMENT-STRICT-GATE` | 【確定】 |
| s15 | 鼓舞 | `INSPIRE` | 敵がretreatへ入るとopposite-team各s15 holder、holder `p<89` | deterministic | holder同teamの`sz(5)`対象 | +1 HP; s20 targetは+2 total | holder `k=16`,`fx=fy=0` → source-excluding pulse | `k=16` | `rsk +1` / healed target | s20 | trigger relation mirrored | 旧generic gate不一致 | 前段修正済み維持 | `CSA-S15-INSPIRE-PULSE` | 【確定】 |
| s16 | 療所 | `FIELD_HOSPITAL` | patientがbase healingへ入場 | 30slotから**3draw with replacement**、alive filterなし | arriving same-team patient | +30 HP clamp | 3draw全消費 → **last matching holder**保持 → heal/clamp → attribution | 固有なし | player-side holder `rsk += actual heal` | s20で固定+30は倍化しない | effect mirrored、raw merit attributionはplayer側明示 | first-match return型が不一致だった | 前段修正済み維持 | `CSA-S16-FIELD-HOSPITAL-DRAWS` | 【確定】 |
| s17 | 仕掛 | `TRAP` | raw: opponent-half X branch。revival: project decisionで**new enemy fixed-fence contact** | 30slotから2draw、両slot RNG消費 | invading enemy | HP-1、最低2; `k=10`,`t=20` | trigger → 2draw → matchedならdamage/floor → state | `k=10`,`t=20` | なし | 同一fence接触継続中は再rollしない（port） | raw half check mirrored | draw countは修正、triggerは意図的差分 | x=900 invisible lineは復活させずdrawのみ修正 | `CSA-S17-TRAP-DRAWS` | raw【確定】 / active trigger intentional divergence |
| s18 | 堅陣 | `FORTIFY` | base contact。NINJAはcallerでbypass | 2 slot draws。selected slotにs18がある時だけchance RNG。**strict `random*100 >50`** | incoming base hit | any successでblock | contact bounce/lock → attempt1(slot→conditional chance) → attempt2 → damage if unblocked | s18固有なし | block時なし | s8、NINJA | `mkjn/ekjn` mirrored | 旧`<0.5`方向とRNG test cardinality不一致 | 前段修正済み。short-circuit testも固定 | `CSA-S18-FORTIFY-SHORT-CIRCUIT` | 【確定】 |
| s19 | 見切 | `FORESIGHT` | `atck()`の`ss==1`かつdefender s19 | deterministic | defender | `ss`を1→0 | **s19 before `random*200`** → later s12 → final defense | 固有なし | なし | s12をspecialにも有効化。防御値そのものは加算しない | same path | s19単体は概ね一致、s12との順序/範囲が不一致 | **s12修正と一体で今回固定** | `CSA-S19-FORESIGHT-SPECIAL-GUARD` | 【確定】 |
| s20 | 回復 | `RECOVERY_BOOST` | passive modifier: `sz`, base healing, `tat` | deterministic | s20 holder receiving healing | pulse +2 total; base `mp/400`を2回; treatment 2倍 | context dependent。`tat`ではs20 pulseが先 | 固有なし | pulse source meritは**+1のまま**。base self-heal meritなし。treatment healerはactual heal | s13/s15/s14 | arithmetic mirrored | pulse target/merit/orderに旧不一致 | 前段修正済み維持 | `CSA-S20-RECOVERY-MULTIPLIERS` | 【確定】 |
| s21 | 連発 | `DOUBLE_SPECIAL` | `scd()` threshold processing / player manual gauge retention | **`random*100 <=40`**; =40 retain。overflow guard `kd<=399+kp` | holder own gauge | consume/resetをskipしてgauge保持 | threshold → overflow guard → retention RNG → `spl()` opportunity | s21固有なし。技固有lockは通常通り | なし | AI ranged/non-ranged cardinalityが別。即時recursive repeatではない | team差よりcontroller経路差 | player boundary旧実装のinclusive要確認箇所を修正 | 前段修正済み維持 | `CSA-S21-DOUBLE-SPECIAL-INCLUSIVE` | 【確定】 |
| s22 | 逃足 | `FLEET_FOOT` | `nige()`で`current s == ns` | deterministic | retreating holder | `ns=s`; `s+=2`; cap8 | retreat start mutation → retreat → recovery/treatmentで`s=ns` restore | 固有なし | なし | runtimeはbase footをmutateせず等価速度をderive | movement result symmetric。rawにcontroller-specific restore plumbingあり | semantic match | 今回direct cap test追加 | `CSA-S22-FLEET-FOOT-CAP` | 【確定】 |

## Newly corrected direct mismatches in this full pass

### s9 FINISHER must precede s34 NINJA_HUNTER

Regenerated `atck()` directly shows:

- `0x21e714`: basic target HP `-1`;
- `0x21e72a`: s10 check, then another HP `-1` when present;
- `0x21e764`: s9s check;
- `0x21e78a..0x21e79a`: target HP `< 6` strict test;
- `0x21e7a1..0x21e7b6`: s9s HP `-1`;
- only **after that**, `0x21e7b7` begins the s34 branch.

The player merit mirror has the same relative sequence around `0x21df14` (s10), `0x21df46` (s9s), then s34 afterward. Therefore NINJA_HUNTER damage must not be included when testing the s9 threshold. The previous TypeScript did exactly that and could turn a raw 2-damage result into 3 at the HP boundary.

### s12 HORO is not ranged-only, and its RNG occurs after the ordinary defense RNG

In regenerated `atck()`:

- `0x21e0df..0x21e127`: if `ss==1` and defender owns s19, s19 clears the stored `ss` register to 0;
- `0x21e128..0x21e14a`: ordinary `Math.random()*200` defense roll is consumed;
- `0x21e616..0x21e654`: attacker `ch==6` and defender `ch==7` forces stored roll to `999` and jumps past s12. The same raw codebase identifies defender `ch==7` as the ninja class through the s34/NINJA_HUNTER branch; the reconstruction maps `ch==6` to TEPPOU;
- `0x21e659`: s12 presence check;
- `0x21e67e..0x21e6a5`: strict `Math.random()*100 > 30`;
- `0x21e6ab`: successful s12 sets the stored defense roll to zero;
- `0x21e6d3..0x21e6f1`: final condition combines `roll > df` with the `ss==1` bypass.

Normal-contact calls pass `ss=0` (for example the `atck()` calls around `0x217f04` / `0x217f22`), so s12 can force a normal guard. A plain `ss=1` special still hits even if s12 sets roll to zero; s19 must first clear `ss` for that special to become guard-capable. This is why s12 and s19 cannot be implemented as independent unordered checks.

The old TypeScript had three mismatches: it limited HORO to ranged kinds, tested HORO before the ordinary defense roll, and inverted the teppou-vs-ninja forced-hit exception. All three are corrected together.

## `sz()` recovery pulse: HP and merit deliberately differ

Direct `sz()` establishes the common target gate and mode-5 recovery behavior:

- candidate team equals source team;
- candidate `p < 89`;
- candidate is explicitly not the source;
- only a target below max HP is processed;
- HP increments once;
- s20 increments HP once more;
- HP is clamped to max;
- for player-side merit bookkeeping, source `rsk` increments **once**.

The mirrored mode-6 branch uses the same +1 / optional +1 HP and one-`rsk` structure. Thus a two-HP s20 pulse is one recovery-merit event, not two.

## s13 / s15 trigger eligibility

The retreat-handling branches scan holders by raw state `p < 89`. Each matching s13/s15 holder receives `k=16`, `fx=0`, `fy=0`, then calls `sz(holder,5)`. The raw branch does not additionally require combat idle, no hit reaction, or no active technique. Reusing the revival's stricter generic action-capability predicate therefore suppressed valid triggers and was removed for these two abilities.

## s14 treatment selection and completion

Player-side search:

- holder has s14;
- holder is not patient;
- holder `p < 88`;
- nearest by Manhattan distance;
- strict distance `<760`;
- strict `holder._x - 30 < patient._x`.

Enemy-side search mirrors the direction condition as `holder._x + 30 > patient._x`.

`tat()` with s20 first sets the action state and invokes source-excluding `sz(patient,5)`, then performs treatment additions twice for s20 and once otherwise. After clamp and recovery-merit attribution it explicitly assigns `k=12` and `kf=1`. The revival compares the ±30 condition in affine world space so an exact raw 30-unit boundary cannot become `29.999999...` through a world→SWF round-trip.

## s16 / s17 / s18 roster draw cardinality

- `mkjn()/ekjn()`: attempts 1 and 2, strict `random*100 > 50`; the probability random is reached only after the selected slot is confirmed to own s18; no early return.
- `mrjo()/erjo()`: attempts 1..3; all three draws are consumed; the last matching s16 holder is retained.
- `mskk()/eskk()`: attempts 1..2; both slot draws are consumed; last matching holder is retained by the raw helper.

These helpers sample fixed roster slots with replacement. This is why the FORTIFY test sequence `[0.99, 0, 0.51]` consumes only three RNG values: attempt 1 selects slot29 without s18 and short-circuits its chance draw; attempt 2 selects slot0 and then consumes 51%, which succeeds because it is strictly greater than 50.

## s8 base merit

In `d()`, s8 performs base HP `-2` and then attacker `rsj += 2`. Without s8, base HP decrements by one and `rsj += 1`. Only afterward is base HP clamped to zero and the battle-end path taken. There is no separate capture `rsj +2` bonus. A finishing s8 hit at one remaining base HP therefore still credits two `rsj` points.

## s20 base healing and s22 retreat speed

The base-healing path adds `mp/400` to HP and, when s20 is present, immediately adds another `mp/400` before the clamp. `nige()` checks s22 and `s==ns`, stores `ns=s`, adds 2 to `s`, and clamps above 8 back to 8. Recovery paths restore `s=ns`. The revival intentionally represents s22 as a derived retreat speed rather than permanently mutating the base stat, but the resulting +2/cap8/restoration behavior is the same.

## Intentional TRAP trigger divergence

The raw battle code contains the historical source-X half-field trap check around X=900. The revival intentionally does **not** restore an invisible X=900 runtime trigger line. By project decision, active TRAP checks occur only on a **new contact with an enemy-owned fixed fence**; remaining on the same contact does not re-roll. The direct audit preserves the raw X=900 evidence while testing the raw two-draw sampling, HP floor, and lock/state semantics on the adopted fence-contact trigger.
