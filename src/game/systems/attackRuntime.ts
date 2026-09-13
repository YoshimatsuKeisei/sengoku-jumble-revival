import { COMBAT_TIMING_CONFIG } from "../config";
import type { Soldier } from "../types";
import { isValidCombatTarget } from "./combatTargetSystem";
import { isWithinNormalContact } from "./techniqueCombatProfiles";

function cooldownReady(soldier: Soldier, currentTime: number): boolean {
  return currentTime - soldier.lastAttackAt >= soldier.attackCooldownMs;
}

export function canStartSoldierAttack(attacker: Soldier, target: Soldier, currentTime: number): boolean {
  return !attacker.isDead
    && attacker.state === "NORMAL"
    && attacker.reactionState === "NONE"
    && attacker.activeSpecialTechnique === null
    && currentTime >= attacker.abilityActionLockUntil
    && attacker.combatActionState === "IDLE"
    && isValidCombatTarget(attacker, target)
    && isWithinNormalContact(attacker, target)
    && cooldownReady(attacker, currentTime);
}

export function startSoldierAttack(attacker: Soldier, target: Soldier, currentTime: number): boolean {
  if (!canStartSoldierAttack(attacker, target, currentTime)) return false;
  attacker.combatActionState = "ATTACK_WINDUP";
  attacker.attackStartedAt = currentTime;
  attacker.attackHitAt = currentTime + COMBAT_TIMING_CONFIG.attackWindupMs;
  attacker.attackRecoveryEndsAt = currentTime + COMBAT_TIMING_CONFIG.attackWindupMs + COMBAT_TIMING_CONFIG.attackRecoveryMs;
  attacker.attackTargetKind = "SOLDIER";
  attacker.attackTargetId = target.id;
  attacker.attackHitApplied = false;
  attacker.lastAttackAt = currentTime;
  return true;
}

export function resetAttackRuntime(soldier: Soldier): void {
  soldier.combatActionState = "IDLE";
  soldier.attackStartedAt = null;
  soldier.attackHitAt = null;
  soldier.attackRecoveryEndsAt = null;
  soldier.attackTargetKind = null;
  soldier.attackTargetId = null;
  soldier.attackHitApplied = false;
}

export function cancelAttack(soldier: Soldier): void {
  resetAttackRuntime(soldier);
}
