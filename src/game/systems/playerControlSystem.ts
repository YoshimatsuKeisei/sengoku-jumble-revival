import type { Soldier } from "../types";
import { calculateSpecialCooldownMs } from "./specialAttackSystem";

export function canPlayerContinueManualPursuitDuringWindup(player: Soldier, soldiers: readonly Soldier[]): boolean {
  if (player.combatActionState !== "ATTACK_WINDUP" || player.attackTargetKind !== "SOLDIER") return false;
  return soldiers.find((soldier) => soldier.id === player.attackTargetId)?.state === "EMERGENCY_RETREAT";
}
export function canPlayerMoveInCurrentState(player: Soldier, soldiers: readonly Soldier[]): boolean {
  if (player.isDead || player.isConfused || player.reactionState !== "NONE" || player.state === "HEALING" || player.state === "REJOINING") return false;
  return player.combatActionState === "IDLE" || canPlayerContinueManualPursuitDuringWindup(player, soldiers);
}
export function getSpecialGaugeProgress(player: Soldier, currentTime: number): number {
  if (currentTime >= player.specialReadyAt) return 1;
  const cooldown = calculateSpecialCooldownMs(player.stats.skill);
  return Math.max(0, Math.min(1, 1 - (player.specialReadyAt - currentTime) / cooldown));
}
