import type { ConfusionClearReason, Soldier } from "../types";
import { clearEngagement } from "./aiSystem";
import { cancelAttack } from "./attackRuntime";

export function applyConfusion(soldier: Soldier): void {
  soldier.isConfused = true; cancelAttack(soldier); clearEngagement(soldier);
  soldier.moveTargetX = null; soldier.moveTargetY = null;
}

export function clearConfusion(soldier: Soldier, _reason: ConfusionClearReason): void {
  soldier.isConfused = false;
}

export function clearConfusionByCommand(soldier: Soldier): void {
  clearConfusion(soldier, "PLAYER_COMMAND");
}
