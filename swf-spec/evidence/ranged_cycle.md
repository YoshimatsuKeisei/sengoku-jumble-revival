# Ranged attack cycle evidence

The current machine-gun symptom has multiple independently reproducible runtime paths: repeated GENERAL_COMMAND forcing, a forced shot followed by the recipient's own gauge-driven shot in the same update, and rapid draining of a large banked ranged gauge after a target enters range. DOUBLE_SPECIAL recursive chaining was another path and has already been corrected under a separate confirmed rule.

The banked-gauge path comes from the combat-gauge migration introduced at commit `492f09613a4017476b0e3664f9b84ee1fd7e7374`: every 23 SWF logic ticks the AI adds `skill` to `combatGauge`; ranged readiness is strictly `> 200`; a normal ranged activation subtracts 200; and no maximum/clamp is applied. A ranged unit with no target in technique range therefore keeps accumulating gauge. Runtime characterization demonstrates that a skill-100 archer can bank 1000, then launch four arrows in roughly 150 ms when a target enters range, draining 1000→800→600→400→200.

This proves a concrete machine-gun mechanism in the reconstruction, but it does not by itself prove that the original SWF capped the gauge or used different banking semantics. The SWF gauge maximum/carry-over behavior has not yet been recovered from direct AVM1 evidence, so `RANGED_GAUGE_BANKING_LIMIT` remains unconfirmed and no arbitrary cap should be introduced.

Arrow projectile lifetime itself is less suspicious: the current projectile updater returns `active: false` after impact and BattleScene removes that projectile, so the same arrow is not normally retained to deal impact damage every subsequent frame.

The exact SWF launch cadence and gauge banking semantics still need direct evidence. Therefore `RANGED_ATTACK_CYCLE_SINGLE_LAUNCH` also remains unconfirmed.
