import { STRATEGY_AI_CONFIG } from "../config";
import type { RandomSource } from "../stats/soldierStats";
import type { Soldier } from "../types";
import { startEngagement } from "./aiSystem";
import { cancelAttack } from "./attackRuntime";
import { applyDamage } from "./combatSystem";
import { recordNormalCombatResult } from "./meritSystem";
import {
  getRawFiToward,
  getRawOppositeFi,
  startRawCombatImpulse,
  SWF_DIRECTION_FX,
  SWF_DIRECTION_FY,
} from "./rawCombatImpulseSystem";
import { startHitReaction } from "./reactionSystem";
import { hasSpecialAbility } from "./specialAbilitySystem";
import { swfLogicTicksToMs } from "./techniqueCombatProfiles";

export const SWF_NORMAL_CONTACT_K_TICKS = 10;
export const SWF_NORMAL_CONTACT_IMPULSE_UNITS = 10;
export const SWF_IRON_WALL_GUARD_IMPULSE_UNITS = 5;
export const SWF_NORMAL_CONTACT_DEFENSE_RANDOM_SCALE = 200;
export const SWF_HORO_GUARD_THRESHOLD_PERCENT = 30;

export interface RawNormalContactAttackResult {
  resolved: boolean;
  guarded: boolean;
  appliedDamage: number;
  defenderFi: number;
}

const rawNormalContactKResumeAt = new WeakMap<Soldier, number>();

function rawKResumeAt(currentTime: number): number {
  // atck() sets k=10 after the current d() already passed its k==0 gate.
  // Ten following d() calls consume k=10..1; ordinary behavior resumes after that.
  return currentTime + swfLogicTicksToMs(SWF_NORMAL_CONTACT_K_TICKS + 1);
}

function applyRawKLock(soldier: Soldier, currentTime: number): void {
  const resumeAt = rawKResumeAt(currentTime);
  rawNormalContactKResumeAt.set(soldier, resumeAt);
  soldier.abilityActionLockUntil = Math.max(soldier.abilityActionLockUntil, resumeAt);
}

export function isRawNormalContactKLocked(soldier: Soldier, currentTime: number): boolean {
  return currentTime < (rawNormalContactKResumeAt.get(soldier) ?? 0);
}

function isRushCharge(soldier: Soldier): boolean {
  return soldier.strategy === "charge" && hasSpecialAbility(soldier, "RUSH");
}

function canReceiveNormalContactEngagement(soldier: Soldier): boolean {
  // Raw l assignment is gated by p<89. NORMAL is the revival-side equivalent.
  return !soldier.isDead && soldier.hp > 0 && soldier.state === "NORMAL";
}

function applyRawPostAttackEngagements(
  attacker: Soldier,
  defender: Soldier,
  currentTime: number,
  random: RandomSource,
): void {
  // These branches occur after the defense/damage section inside atck().
  // Defender mode-0 has a fallback that still assigns l even when RUSH keeps its prior target;
  // the RUSH draw is nevertheless consumed first.
  if (canReceiveNormalContactEngagement(defender)) {
    if (isRushCharge(defender)) random();
    startEngagement(defender, attacker, currentTime);
  }

  if (!canReceiveNormalContactEngagement(attacker)) return;
  const rushKeepsPriorTarget = isRushCharge(attacker)
    && random() * 100 <= STRATEGY_AI_CONFIG.rushRetargetIgnoreChance * 100;
  if (!rushKeepsPriorTarget) startEngagement(attacker, defender, currentTime);
}

export function calculateRawNormalContactDamage(attacker: Soldier, defender: Soldier): number {
  // Direct atck() order: basic -> s10 MIGHT -> s9 FINISHER threshold -> s34 NINJA_HUNTER.
  let damage = 1;
  if (hasSpecialAbility(attacker, "MIGHT")) damage += 1;
  if (hasSpecialAbility(attacker, "FINISHER") && defender.hp - damage < 6) damage += 1;
  if (attacker.rareSpecialAbilities.includes("NINJA_HUNTER") && defender.unitType === "NINJA") damage += 1;
  return damage;
}

export function isRawNormalContactGuarded(
  attacker: Soldier,
  defender: Soldier,
  random: RandomSource = Math.random,
): boolean {
  // Raw mode-0 always consumes the ordinary random*200 roll first.
  let roll = random() * SWF_NORMAL_CONTACT_DEFENSE_RANDOM_SCALE;
  // TEPPOU(ch6) -> NINJA(ch7) forces 999 and skips s12/HORO.
  if (attacker.unitType === "TEPPOU" && defender.unitType === "NINJA") {
    roll = 999;
  } else if (hasSpecialAbility(defender, "HORO")) {
    // s12 succeeds only on strict random*100 > 30; equality does not overwrite the roll.
    if (random() * 100 > SWF_HORO_GUARD_THRESHOLD_PERCENT) roll = 0;
  }
  return roll <= defender.stats.defense;
}

function setAttackerPoseLock(attacker: Soldier, defender: Soldier, currentTime: number): void {
  cancelAttack(attacker);
  attacker.combatActionState = "ATTACK_RECOVERY";
  attacker.attackStartedAt = currentTime;
  attacker.attackHitAt = currentTime;
  attacker.attackRecoveryEndsAt = rawKResumeAt(currentTime);
  attacker.attackTargetKind = "SOLDIER";
  attacker.attackTargetId = defender.id;
  attacker.attackHitApplied = true;
  attacker.lastAttackAt = currentTime;
}

export function resolveRawNormalContactAttack(
  attacker: Soldier,
  defender: Soldier,
  currentTime: number,
  random: RandomSource = Math.random,
): RawNormalContactAttackResult {
  if (attacker.isDead || defender.isDead || attacker.hp <= 0 || defender.hp <= 0
    || attacker.team === defender.team || defender.state === "HEALING") {
    return { resolved: false, guarded: false, appliedDamage: 0, defenderFi: 0 };
  }

  const defenderFi = getRawFiToward(defender, attacker);
  const attackerFi = getRawOppositeFi(defenderFi);
  const guarded = isRawNormalContactGuarded(attacker, defender, random);
  const ironWallGuard = guarded && hasSpecialAbility(defender, "IRON_WALL");

  applyRawKLock(defender, currentTime);
  applyRawKLock(attacker, currentTime);
  setAttackerPoseLock(attacker, defender, currentTime);

  defender.facingX = SWF_DIRECTION_FX[defenderFi];
  defender.facingY = SWF_DIRECTION_FY[defenderFi];
  attacker.facingX = SWF_DIRECTION_FX[attackerFi];
  attacker.facingY = SWF_DIRECTION_FY[attackerFi];

  startRawCombatImpulse(
    defender,
    defenderFi,
    ironWallGuard ? SWF_IRON_WALL_GUARD_IMPULSE_UNITS : SWF_NORMAL_CONTACT_IMPULSE_UNITS,
    currentTime,
  );
  if (ironWallGuard) {
    startRawCombatImpulse(attacker, attackerFi, SWF_NORMAL_CONTACT_IMPULSE_UNITS, currentTime);
  }

  let appliedDamage = 0;
  if (guarded) {
    cancelAttack(defender);
    defender.combatFeedbackMarker = "S";
    defender.combatFeedbackUntil = currentTime + swfLogicTicksToMs(SWF_NORMAL_CONTACT_K_TICKS);
  } else {
    const damage = applyDamage(defender, calculateRawNormalContactDamage(attacker, defender), attacker);
    appliedDamage = damage.appliedDamage;
    defender.combatFeedbackMarker = "H";
    defender.combatFeedbackUntil = currentTime + swfLogicTicksToMs(SWF_NORMAL_CONTACT_K_TICKS);
    // atck() owns the raw fx/fy impulse, so suppress the revival's legacy linear knockback.
    startHitReaction(defender, attacker, currentTime, 0, random, "NORMAL_ATTACK");
  }

  // Raw l/pp updates occur after the defense/damage section.
  applyRawPostAttackEngagements(attacker, defender, currentTime, random);
  recordNormalCombatResult(attacker, defender);
  return { resolved: true, guarded, appliedDamage, defenderFi };
}
