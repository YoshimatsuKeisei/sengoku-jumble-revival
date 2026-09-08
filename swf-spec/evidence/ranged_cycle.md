# Ranged attack cycle evidence

The current machine-gun symptom has multiple independently reproducible runtime paths: repeated GENERAL_COMMAND forcing, a forced shot followed by the recipient's own gauge-driven shot in the same update, and rapid draining of a large banked ranged gauge after a target enters range. DOUBLE_SPECIAL recursive chaining was another path and has already been corrected under a separate confirmed rule.

## Confirmed SWF ranged action span

The SWF-derived runtime manifest `assets/effect/runtime/action_effect_map.json` identifies its action-name source as the SWF root `act` array. Its ranged entries are marked `confidence: confirmed` and map all currently implemented archer and teppou attacks to character action frames `41-48`:

- archer: 弓矢 (2), 遠射 (3), 火矢 (15), 焙烙 (16)
- teppou: 射撃 (4), 狙撃 (5), 砲撃 (17)

The SWF runs at 24 fps. Frames 41 through 48 inclusive therefore form an eight-frame ranged action interval. The reconstruction's technique action lock represents the period in which a fresh technique activation cannot begin, so a fresh ranged activation must not be admitted again before those eight SWF frames have elapsed. This establishes `RANGED_ACTION_FRAME_LOCK` as confirmed without inventing a separate cooldown value.

This does not by itself establish the exact projectile spawn frame within 41-48, so `RANGED_ATTACK_CYCLE_SINGLE_LAUNCH` remains unconfirmed as a separate claim.

## Gauge banking

The banked-gauge path comes from the combat-gauge migration introduced at commit `492f09613a4017476b0e3664f9b84ee1fd7e7374`: every 23 SWF logic ticks the AI adds `skill` to `combatGauge`; ranged readiness is strictly `> 200`; a normal ranged activation subtracts 200; and no maximum/clamp is applied. A ranged unit with no target in technique range therefore keeps accumulating gauge. Runtime characterization demonstrates that a skill-100 archer can bank 1000, then launch four arrows in roughly 150 ms under the current one-tick ranged action lock, draining 1000→800→600→400→200.

This proves a concrete machine-gun mechanism in the reconstruction, but it does not prove that the original SWF capped the gauge or used different banking semantics. The SWF gauge maximum/carry-over behavior has not yet been recovered from direct AVM1 evidence, so `RANGED_GAUGE_BANKING_LIMIT` remains unconfirmed and no arbitrary cap should be introduced.

Arrow projectile lifetime itself is less suspicious: the current projectile updater returns `active: false` after impact and BattleScene removes that projectile, so the same arrow is not normally retained to deal impact damage every subsequent frame.
