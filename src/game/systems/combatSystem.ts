import type { Soldier } from "../types";
import { clearConfusion } from "./confusionSystem";
import { recordBattleOut, recordSoldierDamage } from "./meritSystem";

export function isWithdrawn(soldier: Pick<Soldier, "hp" | "isDead">): boolean {
  return soldier.isDead || soldier.hp <= 0;
}

export const isOutOfBattle = isWithdrawn;

export interface DamageApplicationResult {
  appliedDamage: number;
  battleOutStarted: boolean;
}

/**
 * Raw damage changes HP immediately, but a newly fatal normal hit does not enter
 * death state p99 until the k reaction lock has completed. Cleanup is separated
 * into finalizeFatalDamage() so the reaction system can preserve that ordering.
 */
export function applyDamage(target: Soldier, damage: number, attacker?: Soldier): DamageApplicationResult {
  if (target.isDead) return { appliedDamage: 0, battleOutStarted: false };
  const beforeHp = target.hp;
  target.hp = Math.max(0, target.hp - Math.max(0, damage));
  target.hpBarHp = target.hp;
  const appliedDamage = beforeHp - target.hp;
  recordSoldierDamage(attacker, target, appliedDamage);
  const becameFatal = beforeHp > 0 && target.hp === 0;
  if (becameFatal) recordBattleOut(attacker, target);
  return { appliedDamage, battleOutStarted: becameFatal };
}

export function finalizeFatalDamage(target: Soldier): boolean {
  if (target.isDead || target.hp > 0) return false;
  target.activeSpecialTechnique = null;
  target.specialWavesRemaining = 0;
  target.nextSpecialWaveAt = null;
  target.pendingMoutaiSpecials = 0;
  target.moutaiTriggeredForRetreat = false;
  target.abilityActionLockUntil = 0;
  target.trapStateUntil = 0;
  clearConfusion(target, "BATTLE_OUT");
  target.isDead = true;
  target.battleOutState = "EXITING";
  target.facingX = target.team === "player" ? -1 : 1;
  target.facingY = 0;
  target.aimX = null;
  target.aimY = null;
  target.targetId = null;
  target.engagementStartedAt = null;
  target.engagementOriginX = null;
  target.engagementOriginY = null;
  target.combatActionState = "IDLE";
  target.attackStartedAt = null;
  target.attackHitAt = null;
  target.attackRecoveryEndsAt = null;
  target.attackTargetKind = null;
  target.attackTargetId = null;
  target.attackHitApplied = false;
  target.reactionState = "NONE";
  target.reactionStartedAt = null;
  target.reactionEndsAt = null;
  target.knockbackDirectionX = 0;
  target.knockbackDirectionY = 0;
  target.knockbackRemainingDistance = 0;
  target.combatFeedbackMarker = null;
  target.combatFeedbackUntil = 0;
  target.preferredApproachAngle = null;
  target.preferredApproachTargetId = null;
  target.moveTargetX = null;
  target.moveTargetY = null;
  target.recoveryGate = null;
  target.recoveryGateEntered = false;
  return true;
}
