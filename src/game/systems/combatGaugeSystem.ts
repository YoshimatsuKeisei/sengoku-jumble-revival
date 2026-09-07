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

export function isRangedGaugeTechnique(soldier: Pick<Soldier, "technique">): boolean {
  return soldier.technique.startsWith("ARCHER_") || soldier.technique.startsWith("TEPPOU_");
}

export function advanceCombatGauge(soldier: Soldier, currentTime: number): void {
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
  soldier.combatGauge += intervals * soldier.stats.skill;
  soldier.combatGaugeUpdatedAt += intervals * COMBAT_GAUGE_UPDATE_INTERVAL_MS;
}

export function hasTechniqueGauge(soldier: Soldier): boolean {
  if (soldier.controller === "player") return true;
  return soldier.combatGauge > (isRangedGaugeTechnique(soldier) ? RANGED_GAUGE_THRESHOLD : SPECIAL_GAUGE_THRESHOLD);
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

  // A successful 連発 grants exactly one repeat. The repeat consumes that grant
  // without rolling 連発 again, preventing a single proc from recursively becoming
  // a third/fourth/etc. activation. Probability and gauge thresholds are unchanged.
  const consumingRepeat = consumeDoubleSpecialRepeat(soldier);
  const keepGauge = !consumingRepeat
    && hasSpecialAbility(soldier, "DOUBLE_SPECIAL")
    && soldier.combatGauge <= 399 + soldier.stats.skill
    && random() < 0.4;
  if (keepGauge) grantDoubleSpecialRepeat(soldier);
  else {
    if (isRangedGaugeTechnique(soldier)) soldier.combatGauge = Math.max(0, soldier.combatGauge - RANGED_GAUGE_THRESHOLD);
    else soldier.combatGauge = 0;
  }
  return true;
}

export function clearTechniqueActionIfComplete(soldier: Soldier, currentTime: number): void {
  if (soldier.specialWavesRemaining === 0 && currentTime >= soldier.specialLockUntil) {
    soldier.activeSpecialTechnique = null;
    soldier.nextSpecialWaveAt = null;
  }
}
