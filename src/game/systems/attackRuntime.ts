import type { Soldier } from "../types";

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
