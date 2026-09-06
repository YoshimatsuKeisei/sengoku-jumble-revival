import {
  battlefieldSourceDistanceToWorldX,
  battlefieldSourcePointToWorld,
} from "../battlefieldLayout";
import type { Soldier } from "../types";
import { cancelAttack } from "./attackRuntime";
import { clearStaleCombatTarget } from "./combatTargetSystem";

export const SWF_BATTLE_OUT_FPS = 24;
export const SWF_BATTLE_OUT_DISTANCE_PER_FRAME = 12;
export const SWF_BATTLE_OUT_EXIT_X = {
  player: 56,
  enemy: 1778,
} as const;

export const BATTLE_OUT_SPEED_WORLD_PER_SECOND = battlefieldSourceDistanceToWorldX(
  SWF_BATTLE_OUT_DISTANCE_PER_FRAME * SWF_BATTLE_OUT_FPS,
);
export const BATTLE_OUT_EXIT_X_WORLD = {
  player: battlefieldSourcePointToWorld({ x: SWF_BATTLE_OUT_EXIT_X.player, y: 0 }).x,
  enemy: battlefieldSourcePointToWorld({ x: SWF_BATTLE_OUT_EXIT_X.enemy, y: 0 }).x,
} as const;

/**
 * Moves HP-0 soldiers directly in world space. This deliberately bypasses
 * foot speed, strategy, pathfinding, grid movement, and obstacle avoidance.
 */
export function updateBattleOutMovement(
  soldiers: readonly Soldier[],
  deltaSeconds: number,
): string[] {
  const completed: string[] = [];
  const distance = BATTLE_OUT_SPEED_WORLD_PER_SECOND * Math.max(0, deltaSeconds);
  for (const soldier of soldiers) {
    if (!soldier.isDead || soldier.battleOutState !== "EXITING") continue;
    const direction = soldier.team === "player" ? -1 : 1;
    const previousX = soldier.x;
    soldier.x += direction * distance;
    soldier.velocityX = soldier.x - previousX;
    soldier.velocityY = 0;
    const outside = soldier.team === "player"
      ? soldier.x < BATTLE_OUT_EXIT_X_WORLD.player
      : soldier.x > BATTLE_OUT_EXIT_X_WORLD.enemy;
    if (!outside) continue;
    soldier.battleOutState = "DONE";
    soldier.velocityX = 0;
    completed.push(soldier.id);
  }
  return completed;
}

export function areBattleOutTransitionsComplete(soldiers: readonly Soldier[]): boolean {
  return soldiers.every((soldier) => soldier.battleOutState !== "EXITING");
}

export function releaseBattleOutTargets(soldiers: readonly Soldier[]): void {
  const withdrawnIds = new Set(soldiers.filter((soldier) => soldier.isDead).map((soldier) => soldier.id));
  if (withdrawnIds.size === 0) return;
  for (const soldier of soldiers) {
    if (soldier.targetId && withdrawnIds.has(soldier.targetId)) clearStaleCombatTarget(soldier);
    if (soldier.attackTargetId && withdrawnIds.has(soldier.attackTargetId)) cancelAttack(soldier);
  }
}
