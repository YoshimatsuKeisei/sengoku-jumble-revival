import {
  battlefieldSourceDistanceToWorldX,
  battlefieldSourcePointToWorld,
} from "../battlefieldLayout";
import type { Soldier } from "../types";
import { getSoldierMoveSpeed } from "../stats/soldierStats";
import { cancelAttack } from "./attackRuntime";
import { clearStaleCombatTarget } from "./combatTargetSystem";

export const SWF_BATTLE_OUT_FPS = 24;
export const SWF_BATTLE_OUT_DISTANCE_PER_FRAME = 12;
export const SWF_BATTLE_OUT_EXIT_X = {
  player: 56,
  enemy: 1778,
} as const;
export const SWF_BATTLE_END_EXIT_X = {
  player: 247,
  enemy: 1590,
} as const;

export const BATTLE_OUT_SPEED_WORLD_PER_SECOND = battlefieldSourceDistanceToWorldX(
  SWF_BATTLE_OUT_DISTANCE_PER_FRAME * SWF_BATTLE_OUT_FPS,
);
export const BATTLE_OUT_EXIT_X_WORLD = {
  player: battlefieldSourcePointToWorld({ x: SWF_BATTLE_OUT_EXIT_X.player, y: 0 }).x,
  enemy: battlefieldSourcePointToWorld({ x: SWF_BATTLE_OUT_EXIT_X.enemy, y: 0 }).x,
} as const;
export const BATTLE_END_EXIT_X_WORLD = {
  player: battlefieldSourcePointToWorld({ x: SWF_BATTLE_END_EXIT_X.player, y: 0 }).x,
  enemy: battlefieldSourcePointToWorld({ x: SWF_BATTLE_END_EXIT_X.enemy, y: 0 }).x,
} as const;

export function startBattleEndWithdrawal(soldiers: readonly Soldier[]): void {
  for (const soldier of soldiers) {
    if (soldier.isDead || soldier.battleOutState === "DONE") continue;
    cancelAttack(soldier);
    clearStaleCombatTarget(soldier);
    soldier.battleOutState = "ENDING";
    soldier.moveTargetX = null;
    soldier.moveTargetY = null;
    soldier.velocityY = 0;
  }
}

/** HP-zero exits keep the fixed SWF d2 speed. Battle-end p=201 exits use foot. */
export function updateBattleOutMovement(
  soldiers: readonly Soldier[],
  deltaSeconds: number,
): string[] {
  const completed: string[] = [];
  const distance = BATTLE_OUT_SPEED_WORLD_PER_SECOND * Math.max(0, deltaSeconds);
  for (const soldier of soldiers) {
    const hpZeroExit = soldier.isDead && soldier.battleOutState === "EXITING";
    const battleEndExit = soldier.battleOutState === "ENDING";
    if (!hpZeroExit && !battleEndExit) continue;
    const direction = soldier.team === "player" ? -1 : 1;
    soldier.facingX = direction;
    soldier.facingY = 0;
    soldier.aimX = null;
    soldier.aimY = null;
    const previousX = soldier.x;
    const moveDistance = battleEndExit
      ? getSoldierMoveSpeed(soldier) * Math.max(0, deltaSeconds)
      : distance;
    soldier.x += direction * moveDistance;
    soldier.velocityX = soldier.x - previousX;
    soldier.velocityY = 0;
    const outside = battleEndExit
      ? soldier.team === "player"
        ? soldier.x < BATTLE_END_EXIT_X_WORLD.player
        : soldier.x > BATTLE_END_EXIT_X_WORLD.enemy
      : soldier.team === "player"
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
  return soldiers.every((soldier) =>
    soldier.battleOutState !== "EXITING" && soldier.battleOutState !== "ENDING");
}

export function releaseBattleOutTargets(soldiers: readonly Soldier[]): void {
  const withdrawnIds = new Set(soldiers.filter((soldier) => soldier.isDead).map((soldier) => soldier.id));
  if (withdrawnIds.size === 0) return;
  for (const soldier of soldiers) {
    if (soldier.targetId && withdrawnIds.has(soldier.targetId)) clearStaleCombatTarget(soldier);
    if (soldier.attackTargetId && withdrawnIds.has(soldier.attackTargetId)) cancelAttack(soldier);
  }
}
