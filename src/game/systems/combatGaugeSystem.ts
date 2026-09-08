import type { RandomSource } from "../stats/soldierStats";
import type { Soldier } from "../types";
import { hasSpecialAbility } from "./specialAbilitySystem";
import {
  COMBAT_GAUGE_UPDATE_TICKS,
  RANGED_GAUGE_THRESHOLD,
  SPECIAL_GAUGE_THRESHOLD,
  SWF_COMBAT_FPS,
  getTechniqueProfile,
  swfLogicTicksToMs,
} from "./techniqueCombatProfiles";

export const COMBAT_GAUGE_INITIAL_COUNTER = 19;
export const COMBAT_GAUGE_FIRST_TRIGGER_TICKS = COMBAT_GAUGE_UPDATE_TICKS - COMBAT_GAUGE_INITIAL_COUNTER;
export const COMBAT_GAUGE_UPDATE_INTERVAL_MS = swfLogicTicksToMs(COMBAT_GAUGE_UPDATE_TICKS);
export const PLAYER_TECHNIQUE_GAUGE_MAX = 100;
export const PLAYER_TECHNIQUE_GAUGE_SKILL_DIVISOR = 30;
export const PLAYER_TECHNIQUE_GAUGE_FRAME_MS = 1000 / SWF_COMBAT_FPS;

/**
 * Original scd() produces a one-pass activation opportunity. The stored kd may
 * already have been consumed/reset by the time spl() is reached, so readiness
 * for that pass must be tracked separately from the displayed/stored gauge.
 */
const pendingRangedGaugeTrigger = new WeakSet<Soldier>();
const pendingNonRangedGaugeTrigger = new WeakSet<Soldier>();

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

function processNonRangedGaugeStep(soldier: Soldier, random: RandomSource): boolean {
  soldier.combatGauge += soldier.stats.skill;
  if (soldier.combatGauge <= SPECIAL_GAUGE_THRESHOLD) return false;

  // Original non-ranged scd() also requires sp == 0. activeSpecialTechnique is
  // the reconstruction's closest explicit equivalent to that special-action state.
  if (soldier.activeSpecialTechnique !== null) return false;

  const retainsGauge = hasSpecialAbility(soldier, "DOUBLE_SPECIAL")
    && soldier.combatGauge <= 399 + soldier.stats.skill
    && random() * 100 <= 40;
  if (!retainsGauge) soldier.combatGauge = 0;
  return true;
}

function completedIntervals(currentTime: number, previousTime: number): number {
  const ratio = (currentTime - previousTime) / COMBAT_GAUGE_UPDATE_INTERVAL_MS;
  // Source timing is integer-frame based. Runtime milliseconds are fractional at
  // 24 fps, so absorb only floating-point roundoff at exact frame boundaries.
  return Math.floor(ratio + 1e-9);
}

export function advanceCombatGauge(
  soldier: Soldier,
  currentTime: number,
  random: RandomSource = Math.random,
): void {
  if (soldier.controller === "player") {
    advancePlayerTechniqueGauge(soldier, currentTime);
    return;
  }

  pendingRangedGaugeTrigger.delete(soldier);
  pendingNonRangedGaugeTrigger.delete(soldier);
  if (soldier.controller !== "ai" || soldier.isDead || soldier.hp <= 0) return;
  if (soldier.state !== "NORMAL") {
    soldier.combatGaugeUpdatedAt = currentTime;
    return;
  }

  if (soldier.combatGaugeUpdatedAt === null) {
    // The original battle clip starts tc at 19 and calls scd when tc becomes 23.
    // Seed the runtime clock 19 logic frames behind so the first trigger is after 4.
    soldier.combatGaugeUpdatedAt = currentTime - swfLogicTicksToMs(COMBAT_GAUGE_INITIAL_COUNTER);
  }

  const intervals = completedIntervals(currentTime, soldier.combatGaugeUpdatedAt);
  if (intervals <= 0) return;

  let crossedThreshold = false;
  if (isRangedGaugeTechnique(soldier)) {
    for (let interval = 0; interval < intervals; interval += 1) {
      crossedThreshold = processRangedGaugeStep(soldier, random) || crossedThreshold;
    }
    if (crossedThreshold) pendingRangedGaugeTrigger.add(soldier);
  } else {
    for (let interval = 0; interval < intervals; interval += 1) {
      crossedThreshold = processNonRangedGaugeStep(soldier, random) || crossedThreshold;
    }
    if (crossedThreshold) pendingNonRangedGaugeTrigger.add(soldier);
  }

  soldier.combatGaugeUpdatedAt += intervals * COMBAT_GAUGE_UPDATE_INTERVAL_MS;
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
  return isRangedGaugeTechnique(soldier)
    ? pendingRangedGaugeTrigger.has(soldier)
    : pendingNonRangedGaugeTrigger.has(soldier);
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

  if (soldier.controller === "player") {
    soldier.specialReadyAt = soldier.specialLockUntil;
    const keepGauge = hasSpecialAbility(soldier, "DOUBLE_SPECIAL") && random() < 0.4;
    if (!keepGauge) soldier.playerTechniqueGauge = 0;
    return true;
  }

  // Both AI gauge branches already made their consume/retain decision inside scd().
  // Action start must consume only the transient opportunity and never re-roll s21.
  if (isRangedGaugeTechnique(soldier)) pendingRangedGaugeTrigger.delete(soldier);
  else pendingNonRangedGaugeTrigger.delete(soldier);
  return true;
}

export function clearTechniqueActionIfComplete(soldier: Soldier, currentTime: number): void {
  if (soldier.specialWavesRemaining === 0 && currentTime >= soldier.specialLockUntil) {
    soldier.activeSpecialTechnique = null;
    soldier.nextSpecialWaveAt = null;
  }
}
