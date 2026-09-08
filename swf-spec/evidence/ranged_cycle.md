# Ranged attack cycle evidence

The machine-gun symptom had several independently reproducible runtime paths: repeated GENERAL_COMMAND forcing, a forced shot followed by the recipient's own gauge-driven shot in the same update, rapid draining of a large banked ranged gauge after a target enters range, and the former recursive DOUBLE_SPECIAL chain.

## Confirmed SWF ranged action span

The SWF-derived runtime manifest `assets/effect/runtime/action_effect_map.json` identifies its action-name source as the SWF root `act` array. Its ranged entries are marked `confidence: confirmed` and map all currently implemented archer and teppou attacks to character action frames `41-48`:

- archer: 弓矢 (2), 遠射 (3), 火矢 (15), 焙烙 (16)
- teppou: 射撃 (4), 狙撃 (5), 砲撃 (17)

The SWF runs at 24 fps. Frames 41 through 48 inclusive therefore form an eight-frame ranged action interval. The reconstruction's technique action lock represents the period in which a fresh technique activation cannot begin, so a fresh ranged activation must not be admitted again before those eight SWF frames have elapsed. This establishes `RANGED_ACTION_FRAME_LOCK` as confirmed without inventing a separate cooldown value.

GENERAL_COMMAND-forced archer/teppou attacks still execute the same ranged technique and therefore enter the same confirmed frames 41-48 action interval. The forced activation may remain gauge/cooldown-free while still establishing the physical action lock. This removes two reconstruction-only machine-gun paths without assuming anything about command-level same-tick deduplication: two generals can no longer make one ranged recipient begin two firing actions in the same update, and a forced ranged shot can no longer be immediately followed by the recipient's own gauge-driven ranged action in that update.

This does not establish whether two simultaneous GENERAL_COMMAND events are themselves deduplicated by the original SWF for every recipient type. `GENERAL_SAME_TICK_DEDUPE` therefore remains inferred. It also does not establish the exact projectile spawn frame within 41-48, so `RANGED_ATTACK_CYCLE_SINGLE_LAUNCH` remains unconfirmed as a separate claim.

## Gauge banking

The banked-gauge path comes from the combat-gauge migration introduced at commit `492f09613a4017476b0e3664f9b84ee1fd7e7374`: every 23 SWF logic ticks the AI adds `skill` to `combatGauge`; ranged readiness is strictly `> 200`; a normal ranged activation subtracts 200; and no maximum/clamp is applied. A ranged unit with no target in technique range therefore keeps accumulating gauge.

The earlier reconstruction could dump a skill-100 archer's banked gauge from 1000 to 200 with four launches in roughly 150 ms. After applying the confirmed eight-frame action span, the same short observation window admits only the first launch; gauge banking itself is intentionally left unchanged because the SWF maximum/carry-over semantics remain unrecovered.

Therefore `RANGED_GAUGE_BANKING_LIMIT` remains unconfirmed and no arbitrary cap should be introduced.

Arrow projectile lifetime itself is less suspicious: the current projectile updater returns `active: false` after impact and BattleScene removes that projectile, so the same arrow is not normally retained to deal impact damage every subsequent frame.
