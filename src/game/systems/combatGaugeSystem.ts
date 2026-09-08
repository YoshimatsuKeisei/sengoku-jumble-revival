import type { RandomSource } from "../stats/soldierStats";
import type { Soldier } from "../types";
import { consumeDoubleSpecialRepeat, grantDoubleSpecialRepeat } from "./doubleSpecialState";
import { hasSpecialAbility } from "./specialAbilitySystem";
import {
  COMBAT_GAUGE_UPDATE_TICKS,
  RANGED_GAUGE_THRESHOLD,
  SPECIAL_GAUGE_THRESHOLD,
  getTechniqueProfile,
  swfLogicTicksToMs,
} from "./techniqueCombatProfiles";

export const COMBAT_GAUGE_UPDATE_INTERVAL_MS = swfLogicTicksToMs(COMBAT_GAUGE_UPDATE_TICKS);

/**
 * The original ranged scd() routine consumes/retains kd when the gauge-processing
 * step crosses 200, before range/k/state checks. A crossing therefore grants an
 * attack opportunity for that same processing pass even if the stored kd has
 * already rolled back below 200. Keep that transient opportunity outside Soldier.
 */
const pendingRangedGaugeTrigger = new WeakSet<Soldier>();

export function isRangedGaugeTechnique(soldier: Pick<Soldier, "technique">): boolean {
  return soldier.technique.startsWith("ARCHER_") || soldier.technique.startsWith("TEPPOU_");
}

function processRangedGaugeStep(soldier: Soldier, random: RandomSource): boolean {
  soldier.combatGauge += soldier.stats.skill;
  if (soldier.combatGauge <= RANGED_GAUGE_THRESHOLD) return false;

  const retainsGauge = hasSpecialAbility(soldier, "DOUBLE_SPECIAL")
    && soldier.combatGauge <= 399 + soldier.stats.skill
    && random() * 100 <= 40;
  if (!retainsGauge) {
    soldier.combatGauge = Math.max(0, soldier.combatGauge - RANGED_GAUGE_THRESHOLD);
  }
  return true;
}

export function advanceCombatGauge(
  soldier: Soldier,
  currentTime: number,
  random: RandomSource = Math.random,
): void {
  // A SWF scd() attack opportunity does not survive until a later processing pass.
  pendingRangedGaugeTrigger.delete(soldier);
  if (soldier.controller !== "ai" || soldier.isDead || soldier.hp <= 0) return;
  if (soldier.state !== "NORMAL") {
    soldier.combatGaugeUpdatedAt = currentTime;
    return;
  }
  if (soldier.combatGaugeUpdatedAt === null) {
    soldier.combatGaugeUpdatedAt = currentTime;
    return;
  }
  const intervals = Math.floor((currentTime - soldier.combatGaugeUpdatedAt) / COMBAT_GAUGE_UPDATE_INTERVAL_MS);
  if (intervals <= 0) return;

  if (isRangedGaugeTechnique(soldier)) {
    let crossedThreshold = false;
    // Usually one interval is processed per game update. Iterate catch-up intervals
    // so kd itself still follows the SWF rollover rule instead of becoming a bank.
    for (let interval = 0; interval < intervals; interval += 1) {
      crossedThreshold = processRangedGaugeStep(soldier, random) || crossedThreshold;
    }
    if (crossedThreshold) pendingRangedGaugeTrigger.add(soldier);
  } else {
    // Non-ranged scd() has additional sp-state ordering. Preserve the existing
    // reconstruction until that separate branch is promoted with direct evidence.
    soldier.combatGauge += intervals * soldier.stats.skill;
  }
  soldier.combatGaugeUpdatedAt += intervals * COMBAT_GAUGE_UPDATE_INTERVAL_MS;
}

export function hasTechniqueGauge(soldier: Soldier): boolean {
  if (soldier.controller === "player") return true;
  if (isRangedGaugeTechnique(soldier)) return pendingRangedGaugeTrigger.has(soldier);
  return soldier.combatGauge > SPECIAL_GAUGE_THRESHOLD;
}

export function beginTechniqueAction(
  soldier: Soldier,
  currentTime: number,
  random: RandomSource,
  consumeGauge: boolean,
): boolean {
  if (soldier.isDead || soldier.hp <= 0 || soldier.state !== "NORMAL" || soldier.reactionState !== "NONE"
    || soldier.combatActionState !== "IDLE" || currentTime < soldier.specialLockUntil) return false;
  if (consumeGauge && soldier.controller === "ai" && !hasTechniqueGauge(soldier)) return false;
  if (consumeGauge && soldier.controller === "player" && currentTime < soldier.specialReadyAt) return false;

  const techniqueProfile = getTechniqueProfile(soldier.technique);
  soldier.specialLockUntil = currentTime + swfLogicTicksToMs(techniqueProfile.actionLockTicks);
  soldier.activeSpecialTechnique = soldier.technique;
  soldier.specialWavesRemaining = Math.max(0, techniqueProfile.waveCount - 1);
  soldier.nextSpecialWaveAt = soldier.specialWavesRemaining > 0 ? currentTime + swfLogicTicksToMs(1) : null;
  if (!consumeGauge) return true;

  if (soldier.controller === "player") {
    // The SWF protagonist gauge uses a separate 0..100 scale. Until that UI/runtime
    // exists, preserve the player-only cooldown without sharing the AI gauge.
    soldier.specialReadyAt = soldier.specialLockUntil;
    return true;
  }

  if (isRangedGaugeTechnique(soldier)) {
    // scd() has already applied kd += kp and its consume/retain decision before
    // range/k/state checks. Successful execution must not consume kd a second time.
    pendingRangedGaugeTrigger.delete(soldier);
    return true;
  }

  // Non-ranged DOUBLE_SPECIAL remains on the pre-existing reconstruction path
  // until its separate scd() branch is migrated with dedicated conformance tests.
  const consumingRepeat = consumeDoubleSpecialRepeat(soldier);
  const keepGauge = !consumingRepeat
    && hasSpecialAbility(soldier, "DOUBLE_SPECIAL")
    && soldier.combatGauge <= 399 + soldier.stats.skill
    && random() < 0.4;
  if (keepGauge) grantDoubleSpecialRepeat(soldier);
  else soldier.combatGauge = 0;
  return true;
}

export function clearTechniqueActionIfComplete(soldier: Soldier, currentTime: number): void {
  if (soldier.specialWavesRemaining === 0 && currentTime >= soldier.specialLockUntil) {
    soldier.activeSpecialTechnique = null;
    soldier.nextSpecialWaveAt = null;
  }
}
