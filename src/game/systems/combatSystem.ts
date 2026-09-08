import type { Soldier } from "../types";
import { clearConfusion } from "./confusionSystem";

export function isWithdrawn(soldier: Pick<Soldier, "hp" | "isDead">): boolean {
  return soldier.isDead || soldier.hp <= 0;
}

export const isOutOfBattle = isWithdrawn;

/**
 * Damage changes HP immediately, but the original SWF does not enter death state
 * 99 until the hit-response k counter has finished. Fatal cleanup is therefore
 * separated from raw HP subtraction and is finalized by the reaction updater.
 */
export function applyDamage(target: Soldier, damage: number): void {
  if (target.isDead) return;
  target.hp = Math.max(0, target.hp - damage);
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
