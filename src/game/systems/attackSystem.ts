import { COMBAT_TIMING_CONFIG, DEFENSE_CONFIG, REACTION_CONFIG, SPECIAL_ABILITY_CONFIG } from "../config";
import type { RandomSource } from "../stats/soldierStats";
import type { BattleBase, Soldier, Team } from "../types";
import { applyDamage } from "./combatSystem";
import { startHitReaction } from "./reactionSystem";
import { isDamageGuarded } from "./defenseSystem";
import { applyForcedMovement } from "./movementSystem";
import { calculateNormalAttackDamage, hasSpecialAbility } from "./specialAbilitySystem";
import { isValidCombatTarget } from "./combatTargetSystem";
export { cancelAttack, resetAttackRuntime } from "./attackRuntime";
import { cancelAttack, resetAttackRuntime } from "./attackRuntime";
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

function startAttack(attacker: Soldier, targetKind: "SOLDIER", targetId: string, currentTime: number): void {
  attacker.combatActionState = "ATTACK_WINDUP";
  attacker.attackStartedAt = currentTime;
  attacker.attackHitAt = currentTime + COMBAT_TIMING_CONFIG.attackWindupMs;
  attacker.attackRecoveryEndsAt = currentTime + COMBAT_TIMING_CONFIG.attackWindupMs + COMBAT_TIMING_CONFIG.attackRecoveryMs;
  attacker.attackTargetKind = targetKind;
  attacker.attackTargetId = targetId;
  attacker.attackHitApplied = false;
  attacker.lastAttackAt = currentTime;
}

export function startSoldierAttack(attacker: Soldier, target: Soldier, currentTime: number): boolean {
  if (!canStartSoldierAttack(attacker, target, currentTime)) return false;
  startAttack(attacker, "SOLDIER", target.id, currentTime);
  return true;
}

function resolveSoldierHit(attacker: Soldier, soldiers: Soldier[], currentTime: number, random: RandomSource): void {
  const target = soldiers.find((candidate) => candidate.id === attacker.attackTargetId);
  if (!isValidCombatTarget(attacker, target) || attacker.isDead || attacker.state !== "NORMAL") return;
  if (!isWithinNormalContact(attacker, target)) return;
  if (isDamageGuarded(target, "NORMAL_ATTACK", random)) {
    target.combatFeedbackMarker = "S";
    target.combatFeedbackUntil = currentTime + DEFENSE_CONFIG.guardMarkerDurationMs;
    applyForcedMovement(target, target.x - attacker.x, target.y - attacker.y,
      hasSpecialAbility(target, "IRON_WALL")
        ? REACTION_CONFIG.ironWallGuardKnockbackDistance
        : SPECIAL_ABILITY_CONFIG.guardKnockbackDistance);
    return;
  }
  const damage = calculateNormalAttackDamage(attacker, target); applyDamage(target, damage);
  target.combatFeedbackMarker = "H";
  target.combatFeedbackUntil = currentTime + DEFENSE_CONFIG.guardMarkerDurationMs;
  if (!target.isDead) startHitReaction(target, attacker, currentTime, undefined, random, "NORMAL_ATTACK");
}

export function updateAttackStates(
  soldiers: Soldier[],
  _bases: BattleBase[],
  currentTime: number,
  battleEnded = false,
  random: RandomSource = Math.random,
): Team | null {
  if (battleEnded) return null;
  for (const attacker of soldiers) {
    if (attacker.isDead || attacker.state !== "NORMAL" || attacker.reactionState !== "NONE") {
      cancelAttack(attacker);
      continue;
    }

    if (attacker.combatActionState === "ATTACK_WINDUP"
      && attacker.attackHitAt !== null
      && currentTime >= attacker.attackHitAt
      && !attacker.attackHitApplied) {
      attacker.attackHitApplied = true;
      attacker.combatActionState = "ATTACK_RECOVERY";
      if (attacker.attackTargetKind === "SOLDIER") resolveSoldierHit(attacker, soldiers, currentTime, random);
    }

    if (attacker.combatActionState === "ATTACK_RECOVERY"
      && attacker.attackRecoveryEndsAt !== null
      && currentTime >= attacker.attackRecoveryEndsAt) {
      resetAttackRuntime(attacker);
    }

    // Soldier attacks are started only by the combat contest system. Base
    // damage is a movement-contact event handled by baseContactSystem.
  }
  return null;
}
