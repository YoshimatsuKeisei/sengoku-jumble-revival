import { DEFENSE_CONFIG, REACTION_CONFIG, SPECIAL_ABILITY_CONFIG } from "../config";
import type { RandomSource } from "../stats/soldierStats";
import type { BattleBase, Soldier, Team } from "../types";
import { applyDamage } from "./combatSystem";
import { startHitReaction } from "./reactionSystem";
import { isRawNormalContactGuarded } from "./defenseSystem";
import { applyForcedMovement } from "./movementSystem";
import { calculateNormalAttackDamage, hasSpecialAbility } from "./specialAbilitySystem";
import { isValidCombatTarget } from "./combatTargetSystem";
import { getRawFiToward, SWF_DIRECTION_FX, SWF_DIRECTION_FY } from "./rawCombatImpulseSystem";
export { cancelAttack, resetAttackRuntime, canStartSoldierAttack, startSoldierAttack } from "./attackRuntime";
import { cancelAttack, resetAttackRuntime } from "./attackRuntime";
import { isWithinNormalContact } from "./techniqueCombatProfiles";

function faceNormalMeleeDefenderAtAttacker(target: Soldier, attacker: Soldier): void {
  const fi = getRawFiToward(target, attacker);
  target.facingX = SWF_DIRECTION_FX[fi];
  target.facingY = SWF_DIRECTION_FY[fi];
}

function resolveSoldierHit(attacker: Soldier, soldiers: Soldier[], currentTime: number, random: RandomSource): void {
  const target = soldiers.find((candidate) => candidate.id === attacker.attackTargetId);
  if (!isValidCombatTarget(attacker, target) || attacker.isDead || attacker.state !== "NORMAL") return;
  if (!isWithinNormalContact(attacker, target)) return;
  faceNormalMeleeDefenderAtAttacker(target, attacker);
  if (isRawNormalContactGuarded(target, random)) {
    target.combatFeedbackMarker = "S";
    target.combatFeedbackUntil = currentTime + DEFENSE_CONFIG.guardMarkerDurationMs;
    applyForcedMovement(target, target.x - attacker.x, target.y - attacker.y,
      hasSpecialAbility(target, "IRON_WALL")
        ? REACTION_CONFIG.ironWallGuardKnockbackDistance
        : SPECIAL_ABILITY_CONFIG.guardKnockbackDistance);
    return;
  }
  const damage = calculateNormalAttackDamage(attacker, target);
  applyDamage(target, damage, attacker);
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
  }
  return null;
}
