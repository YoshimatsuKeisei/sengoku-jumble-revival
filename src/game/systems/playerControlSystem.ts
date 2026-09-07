import type { Soldier } from "../types";
import { PLAYER_TECHNIQUE_GAUGE_MAX } from "./combatGaugeSystem";

export function canPlayerContinueManualPursuitDuringWindup(player: Soldier, soldiers: readonly Soldier[]): boolean {
  if (player.combatActionState !== "ATTACK_WINDUP" || player.attackTargetKind !== "SOLDIER") return false;
  return soldiers.find((soldier) => soldier.id === player.attackTargetId)?.state === "EMERGENCY_RETREAT";
}
export function canPlayerMoveInCurrentState(player: Soldier, soldiers: readonly Soldier[]): boolean {
  if (player.isDead || player.isConfused || player.reactionState !== "NONE" || player.activeSpecialTechnique !== null
    || player.state === "HEALING" || player.state === "REJOINING") return false;
  return player.combatActionState === "IDLE" || canPlayerContinueManualPursuitDuringWindup(player, soldiers);
}
export function getSpecialGaugeProgress(player: Soldier, _currentTime: number): number {
  return Math.max(0, Math.min(1, Math.round(player.playerTechniqueGauge) / PLAYER_TECHNIQUE_GAUGE_MAX));
}
