import { COMBAT_TIMING_CONFIG, DEFENSE_CONFIG, SPECIAL_ABILITY_CONFIG } from "../config";
import type { RandomSource } from "../stats/soldierStats";
import type { BattleBase, Soldier, Team } from "../types";
import { canAttackEnemyBase, damageBase, getEnemyBase } from "./baseSystem";
import { distanceBetween } from "./aiSystem";
import { applyDamage } from "./combatSystem";
import { startHitReaction } from "./reactionSystem";
import { isDamageGuarded } from "./defenseSystem";
import { applyForcedMovement } from "./movementSystem";
import { calculateBaseAttackDamage, calculateNormalAttackDamage, aggregateProcChance, countTeamAbility, hasSpecialAbility } from "./specialAbilitySystem";
import { clearEngagement, startEngagement } from "./aiSystem";
import { queueMoutaiOnDamage } from "./cavalryChargeSystem";
import { isValidCombatTarget } from "./combatTargetSystem";
export { cancelAttack, resetAttackRuntime } from "./attackRuntime";
import { cancelAttack, resetAttackRuntime } from "./attackRuntime";
import { applyBaseAttackBounce } from "./baseAttackBounceSystem";

function cooldownReady(soldier: Soldier, currentTime: number): boolean {
  return currentTime - soldier.lastAttackAt >= soldier.attackCooldownMs;
}

export function canStartSoldierAttack(attacker: Soldier, target: Soldier, currentTime: number): boolean {
  return !attacker.isDead
    && attacker.state === "NORMAL"
    && attacker.reactionState === "NONE"
    && attacker.combatActionState === "IDLE"
    && isValidCombatTarget(attacker, target)
    && distanceBetween(attacker, target) <= attacker.attackRange
    && cooldownReady(attacker, currentTime);
}

export function canStartBaseAttack(attacker: Soldier, base: BattleBase, currentTime: number): boolean {
  return attacker.combatActionState === "IDLE"
    && !attacker.isConfused
    && canAttackEnemyBase(attacker, base)
    && cooldownReady(attacker, currentTime);
}

function startAttack(attacker: Soldier, targetKind: "SOLDIER" | "BASE", targetId: string, currentTime: number): void {
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

export function startBaseAttack(attacker: Soldier, base: BattleBase, currentTime: number): boolean {
  if (!canStartBaseAttack(attacker, base, currentTime)) return false;
  startAttack(attacker, "BASE", base.id, currentTime);
  return true;
}

function resolveSoldierHit(attacker: Soldier, soldiers: Soldier[], currentTime: number, random: RandomSource): void {
  const target = soldiers.find((candidate) => candidate.id === attacker.attackTargetId);
  if (!isValidCombatTarget(attacker, target) || attacker.isDead || attacker.state !== "NORMAL") return;
  if (distanceBetween(attacker, target) > attacker.attackRange) return;
  if (hasSpecialAbility(target, "RUSH")) startEngagement(target, attacker, currentTime);
  if (isDamageGuarded(target, "NORMAL_ATTACK", random)) {
    target.combatFeedbackMarker = "S";
    target.combatFeedbackUntil = currentTime + DEFENSE_CONFIG.guardMarkerDurationMs;
    if (!hasSpecialAbility(target, "IRON_WALL")) applyForcedMovement(target, target.x - attacker.x, target.y - attacker.y,
      SPECIAL_ABILITY_CONFIG.guardKnockbackDistance);
    return;
  }
  const damage = calculateNormalAttackDamage(attacker, target); applyDamage(target, damage); queueMoutaiOnDamage(target, damage);
  target.combatFeedbackMarker = "H";
  target.combatFeedbackUntil = currentTime + DEFENSE_CONFIG.guardMarkerDurationMs;
  if (!target.isDead) startHitReaction(target, attacker, currentTime);
}

function resolveBaseHit(attacker: Soldier, bases: BattleBase[], soldiers: Soldier[], random: RandomSource): Team | null {
  const base = bases.find((candidate) => candidate.id === attacker.attackTargetId);
  if (!base || !canAttackEnemyBase(attacker, base)) return null;
  const count = countTeamAbility(soldiers, base.team, "FORTIFY");
  const guarded = attacker.unitType !== "NINJA" && random() < aggregateProcChance(count, SPECIAL_ABILITY_CONFIG.fortifyPerHolderChance,
    SPECIAL_ABILITY_CONFIG.fortifyMaxChance);
  if (!guarded) damageBase(base, calculateBaseAttackDamage(attacker));
  if (!base.isDestroyed) applyBaseAttackBounce(attacker, base);
  return base.isDestroyed ? base.team : null;
}

export function updateAttackStates(
  soldiers: Soldier[],
  bases: BattleBase[],
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
      else if (attacker.attackTargetKind === "BASE") {
        const destroyedTeam = resolveBaseHit(attacker, bases, soldiers, random);
        if (destroyedTeam) return destroyedTeam;
      }
    }

    if (attacker.combatActionState === "ATTACK_RECOVERY"
      && attacker.attackRecoveryEndsAt !== null
      && currentTime >= attacker.attackRecoveryEndsAt) {
      resetAttackRuntime(attacker);
      if (hasSpecialAbility(attacker, "RUSH")) clearEngagement(attacker);
    }

    if (attacker.combatActionState !== "IDLE") continue;
    // Soldier attacks are started only by the combat contest system.
    if (attacker.targetId) continue;
    const enemyBase = getEnemyBase(bases, attacker.team);
    startBaseAttack(attacker, enemyBase, currentTime);
  }
  return null;
}
