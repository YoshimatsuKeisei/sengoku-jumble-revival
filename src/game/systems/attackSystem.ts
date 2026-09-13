import { DEFENSE_CONFIG } from "../config";
import type { RandomSource } from "../stats/soldierStats";
import type { BattleBase, Soldier, Team } from "../types";
import { applyDamage } from "./combatSystem";
import { startHitReaction } from "./reactionSystem";
import { isRawNormalContactGuarded } from "./defenseSystem";
import { calculateNormalAttackDamage, hasSpecialAbility } from "./specialAbilitySystem";
import { isValidCombatTarget } from "./combatTargetSystem";
import {
  getRawFiToward,
  getRawOppositeFi,
  startRawCombatImpulse,
  SWF_DIRECTION_FX,
  SWF_DIRECTION_FY,
} from "./rawCombatImpulseSystem";
export { cancelAttack, resetAttackRuntime, canStartSoldierAttack, startSoldierAttack } from "./attackRuntime";
import { cancelAttack, resetAttackRuntime } from "./attackRuntime";
import { isWithinNormalContact, swfLogicTicksToMs } from "./techniqueCombatProfiles";

export const SWF_NORMAL_CONTACT_K_TICKS = 10;
export const SWF_NORMAL_CONTACT_IMPULSE_UNITS = 10;
export const SWF_IRON_WALL_GUARD_IMPULSE_UNITS = 5;

function rawNormalContactResumeAt(currentTime: number): number {
  // atck() sets k=10 after the current d() has already passed its k==0 gate.
  // The next ten d() calls consume k=10..1, and ordinary logic resumes on call 11.
  return currentTime + swfLogicTicksToMs(SWF_NORMAL_CONTACT_K_TICKS + 1);
}

function applyRawNormalContactKLock(soldier: Soldier, currentTime: number): void {
  soldier.abilityActionLockUntil = Math.max(soldier.abilityActionLockUntil, rawNormalContactResumeAt(currentTime));
}

function faceNormalMeleePair(target: Soldier, attacker: Soldier): number {
  const defenderFacingFi = getRawFiToward(target, attacker);
  const attackerFacingFi = getRawOppositeFi(defenderFacingFi);
  target.facingX = SWF_DIRECTION_FX[defenderFacingFi];
  target.facingY = SWF_DIRECTION_FY[defenderFacingFi];
  attacker.facingX = SWF_DIRECTION_FX[attackerFacingFi];
  attacker.facingY = SWF_DIRECTION_FY[attackerFacingFi];
  return defenderFacingFi;
}

function resolveSoldierHit(attacker: Soldier, soldiers: Soldier[], currentTime: number, random: RandomSource): void {
  const target = soldiers.find((candidate) => candidate.id === attacker.attackTargetId);
  if (!isValidCombatTarget(attacker, target) || attacker.isDead || attacker.state !== "NORMAL") return;
  if (!isWithinNormalContact(attacker, target)) return;

  const defenderFacingFi = faceNormalMeleePair(target, attacker);
  const defenderOutwardFi = getRawOppositeFi(defenderFacingFi);
  applyRawNormalContactKLock(attacker, currentTime);
  applyRawNormalContactKLock(target, currentTime);

  if (isRawNormalContactGuarded(target, random)) {
    target.combatFeedbackMarker = "S";
    target.combatFeedbackUntil = currentTime + DEFENSE_CONFIG.guardMarkerDurationMs;
    const ironWall = hasSpecialAbility(target, "IRON_WALL");
    startRawCombatImpulse(
      target,
      defenderOutwardFi,
      ironWall ? SWF_IRON_WALL_GUARD_IMPULSE_UNITS : SWF_NORMAL_CONTACT_IMPULSE_UNITS,
      currentTime,
    );
    if (ironWall) {
      // Defender-facing fi points from defender -> attacker, so it is also the
      // attacker's outward direction away from the defender.
      startRawCombatImpulse(attacker, defenderFacingFi, SWF_NORMAL_CONTACT_IMPULSE_UNITS, currentTime);
    }
    return;
  }

  const damage = calculateNormalAttackDamage(attacker, target);
  applyDamage(target, damage, attacker);
  target.combatFeedbackMarker = "H";
  target.combatFeedbackUntil = currentTime + DEFENSE_CONFIG.guardMarkerDurationMs;
  startRawCombatImpulse(target, defenderOutwardFi, SWF_NORMAL_CONTACT_IMPULSE_UNITS, currentTime);
  if (!target.isDead) {
    // Raw atck() owns the decaying fx/fy displacement. Keep HIT_STUN timing but
    // suppress the revival's older proportional linear knockback.
    startHitReaction(target, attacker, currentTime, 0, random, "NORMAL_ATTACK");
  }
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
