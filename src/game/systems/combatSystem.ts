import type { Soldier } from "../types";
import { clearConfusion } from "./confusionSystem";

export function isWithdrawn(soldier: Pick<Soldier, "hp" | "isDead">): boolean {
  return soldier.isDead || soldier.hp <= 0;
}

export const isOutOfBattle = isWithdrawn;

export function applyDamage(target: Soldier, damage: number): void {
  if (target.isDead) return;
  target.hp = Math.max(0, target.hp - damage);
  if (target.hp === 0) {
    target.activeSpecialTechnique = null;
    target.specialWavesRemaining = 0;
    target.nextSpecialWaveAt = null;
    target.pendingMoutaiSpecials = 0;
    target.moutaiTriggeredForRetreat = false;
    target.abilityActionLockUntil = 0;
    target.trapStateUntil = 0;
    clearConfusion(target, "BATTLE_OUT");
    // `isDead` is retained as a legacy runtime flag. HP 0 means battle withdrawal.
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
  }
}
