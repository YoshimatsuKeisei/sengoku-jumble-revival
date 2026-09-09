import type { RandomSource } from "../stats/soldierStats";
import type { Soldier } from "../types";
import { cancelAttack } from "./attackRuntime";
import { applyDamage } from "./combatSystem";
import { isDamageGuarded } from "./defenseSystem";
import {
  getRawFiToward,
  getRawOppositeFi,
  startRawCombatImpulse,
  SWF_DIRECTION_FX,
  SWF_DIRECTION_FY,
} from "./rawCombatImpulseSystem";
import { startHitReaction } from "./reactionSystem";
import { calculateNormalAttackDamage, hasSpecialAbility } from "./specialAbilitySystem";
import { isWithinNormalContact, swfLogicTicksToMs } from "./techniqueCombatProfiles";

export const SWF_NORMAL_CONTACT_MODE = 0;
export const SWF_NORMAL_CONTACT_K_TICKS = 10;
export const SWF_NORMAL_CONTACT_IMPULSE_UNITS = 10;
export const SWF_IRON_WALL_GUARD_IMPULSE_UNITS = 5;

export interface RawNormalContactAttackResult {
  resolved: boolean;
  guarded: boolean;
  appliedDamage: number;
  defenderFi: number;
}

function rawKResumeAt(currentTime: number): number {
  // atck() sets k=10 after d() already passed its k==0 gate. The following ten
  // d() calls consume k=10..1; ordinary d() behavior resumes on the next call.
  return currentTime + swfLogicTicksToMs(SWF_NORMAL_CONTACT_K_TICKS + 1);
}

function applyRawKLock(soldier: Soldier, currentTime: number): void {
  soldier.abilityActionLockUntil = rawKResumeAt(currentTime);
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

export function isRawNormalContactKLocked(soldier: Soldier, currentTime: number): boolean {
  return currentTime < soldier.abilityActionLockUntil;
}

export function resolveRawNormalContactAttack(
  attacker: Soldier,
  defender: Soldier,
  currentTime: number,
  random: RandomSource = Math.random,
): RawNormalContactAttackResult {
  if (attacker.isDead || defender.isDead || attacker.hp <= 0 || defender.hp <= 0
    || attacker.team === defender.team || !isWithinNormalContact(attacker, defender)) {
    return { resolved: false, guarded: false, appliedDamage: 0, defenderFi: 0 };
  }

  // atck() derives fi from atan2(sb-sa), where sa is the defender and sb the
  // attacker. Preserve its eight-direction quantization and exact fx/fy tables.
  const defenderFi = getRawFiToward(defender, attacker);
  const attackerFi = getRawOppositeFi(defenderFi);
  const guarded = isDamageGuarded(defender, "NORMAL_ATTACK", random);
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

  if (guarded) {
    cancelAttack(defender);
    defender.combatFeedbackMarker = "S";
    defender.combatFeedbackUntil = currentTime + swfLogicTicksToMs(SWF_NORMAL_CONTACT_K_TICKS);
    return { resolved: true, guarded: true, appliedDamage: 0, defenderFi };
  }

  const result = applyDamage(defender, calculateNormalAttackDamage(attacker, defender), attacker);
  defender.combatFeedbackMarker = "H";
  defender.combatFeedbackUntil = currentTime + swfLogicTicksToMs(SWF_NORMAL_CONTACT_K_TICKS);
  // Normal atck() already owns the raw fx/fy impulse. Reuse the confirmed
  // k=10 hit-state/death-order machinery while suppressing its legacy linear push.
  startHitReaction(defender, attacker, currentTime, 0, random, "NORMAL_ATTACK");
  return { resolved: true, guarded: false, appliedDamage: result.appliedDamage, defenderFi };
}
