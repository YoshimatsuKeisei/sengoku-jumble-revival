import type { RandomSource } from "../stats/soldierStats";
import type { Soldier } from "../types";
import { hasSpecialAbility } from "./specialAbilitySystem";
import {
  COMBAT_GAUGE_UPDATE_TICKS,
  RANGED_GAUGE_THRESHOLD,
  SPECIAL_GAUGE_THRESHOLD,
  getTechniqueProfile,
  swfLogicTicksToMs,
} from "./techniqueCombatProfiles";
import { SWF_COMBAT_FPS } from "./techniqueCombatProfiles";

export const COMBAT_GAUGE_UPDATE_INTERVAL_MS = swfLogicTicksToMs(COMBAT_GAUGE_UPDATE_TICKS);
export const PLAYER_TECHNIQUE_GAUGE_MAX = 100;
export const PLAYER_TECHNIQUE_GAUGE_SKILL_DIVISOR = 30;
export const PLAYER_TECHNIQUE_GAUGE_FRAME_MS = 1000 / SWF_COMBAT_FPS;

export function isRangedGaugeTechnique(soldier: Pick<Soldier, "technique">): boolean {
  return soldier.technique.startsWith("ARCHER_") || soldier.technique.startsWith("TEPPOU_");
}

/**
 * Advances the SWF combat gauge and reports whether this update is also an
 * autonomous technique-decision tick. The original check lived in the same
 * 23-tick battle loop as gauge accumulation; Phaser render updates must not
 * drain a banked gauge once per frame.
 */
export function advanceCombatGauge(soldier: Soldier, currentTime: number): boolean {
  if (soldier.controller === "player") {
    advancePlayerTechniqueGauge(soldier, currentTime);
    return false;
  }
  if (soldier.isDead || soldier.hp <= 0) return false;
  if (soldier.state !== "NORMAL") {
    soldier.combatGaugeUpdatedAt = currentTime;
    return false;
  }
  if (soldier.combatGaugeUpdatedAt === null) {
    soldier.combatGaugeUpdatedAt = currentTime;
    // A restored/precharged runtime may already be ready. Permit one initial
    // decision, then require the normal 23-tick cadence for later decisions.
    return hasTechniqueGauge(soldier);
  }
  const intervals = Math.floor((currentTime - soldier.combatGaugeUpdatedAt) / COMBAT_GAUGE_UPDATE_INTERVAL_MS);
  if (intervals <= 0) return false;
  soldier.combatGauge += intervals * soldier.stats.skill;
  soldier.combatGaugeUpdatedAt += intervals * COMBAT_GAUGE_UPDATE_INTERVAL_MS;
  return true;
}

export function advancePlayerTechniqueGauge(soldier: Soldier, currentTime: number): void {
  if (soldier.controller !== "player" || soldier.isDead || soldier.hp <= 0) return;
  if (soldier.state !== "NORMAL") {
    soldier.playerTechniqueGaugeUpdatedAt = currentTime;
    return;
  }
  if (soldier.playerTechniqueGaugeUpdatedAt === null) {
    soldier.playerTechniqueGaugeUpdatedAt = currentTime;
    return;
  }
  const frames = Math.floor(Math.max(0, currentTime - soldier.playerTechniqueGaugeUpdatedAt) / PLAYER_TECHNIQUE_GAUGE_FRAME_MS);
  if (frames <= 0) return;
  soldier.playerTechniqueGaugeUpdatedAt += frames * PLAYER_TECHNIQUE_GAUGE_FRAME_MS;
  soldier.playerTechniqueGauge = Math.min(
    PLAYER_TECHNIQUE_GAUGE_MAX,
    soldier.playerTechniqueGauge + soldier.stats.skill / PLAYER_TECHNIQUE_GAUGE_SKILL_DIVISOR * frames,
  );
}

export function hasTechniqueGauge(soldier: Soldier): boolean {
  if (soldier.controller === "player") return soldier.playerTechniqueGauge >= PLAYER_TECHNIQUE_GAUGE_MAX;
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
  if (consumeGauge && soldier.controller === "player"
    && (currentTime < soldier.specialReadyAt || !hasTechniqueGauge(soldier))) return false;

  const techniqueProfile = getTechniqueProfile(soldier.technique);
  soldier.specialLockUntil = currentTime + swfLogicTicksToMs(techniqueProfile.actionLockTicks);
  soldier.activeSpecialTechnique = soldier.technique;
  soldier.specialWavesRemaining = Math.max(0, techniqueProfile.waveCount - 1);
  soldier.nextSpecialWaveAt = soldier.specialWavesRemaining > 0 ? currentTime + swfLogicTicksToMs(1) : null;
  if (!consumeGauge) return true;

  const keepGauge = hasSpecialAbility(soldier, "DOUBLE_SPECIAL")
    && (soldier.controller === "player" || soldier.combatGauge <= 399 + soldier.stats.skill)
    && random() < 0.4;

  if (soldier.controller === "player") {
    soldier.specialReadyAt = soldier.specialLockUntil;
    if (!keepGauge) soldier.playerTechniqueGauge = 0;
    return true;
  }

  if (!keepGauge) {
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
