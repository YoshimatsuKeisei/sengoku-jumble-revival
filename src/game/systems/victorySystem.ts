import type { BattleBase, BattleResult, Soldier } from "../types";
import { getBaseForTeam } from "./baseSystem";

export function getBattleResult(soldiers: Soldier[], bases?: BattleBase[]): BattleResult {
  if (bases) {
    if (getBaseForTeam(bases, "enemy").hp <= 0) return "VICTORY";
    if (getBaseForTeam(bases, "player").hp <= 0) return "DEFEAT";
  }
  const playerAlive = soldiers.some((soldier) => soldier.team === "player" && !soldier.isDead);
  const enemyAlive = soldiers.some((soldier) => soldier.team === "enemy" && !soldier.isDead);
  if (!enemyAlive) return "VICTORY";
  if (!playerAlive) return "DEFEAT";
  return null;
}
