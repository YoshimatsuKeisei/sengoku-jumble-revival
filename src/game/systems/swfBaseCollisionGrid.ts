import { battlefieldWorldPointToSource } from "../battlefieldLayout";
import type { Team } from "../types";

export const SWF_BASE_COLLISION_GRID_SIZE = 36;
export const SWF_ENEMY_BASE_DAMAGE_TILE = 996;
export const SWF_PLAYER_BASE_DAMAGE_TILE = 997;
export const SWF_ENEMY_RECOVERY_TILE = 998;
export const SWF_PLAYER_RECOVERY_TILE = 999;

export type SwfBaseCollisionCode =
  | typeof SWF_ENEMY_BASE_DAMAGE_TILE
  | typeof SWF_PLAYER_BASE_DAMAGE_TILE
  | typeof SWF_ENEMY_RECOVERY_TILE
  | typeof SWF_PLAYER_RECOVERY_TILE
  | null;

const ENEMY_BASE_DAMAGE_Y = new Set([15, 16, 17, 18]);
const PLAYER_BASE_DAMAGE_Y = new Set([15, 16, 17, 18]);
const ENEMY_RECOVERY_CELLS = new Set([
  "45,12", "45,13", "45,14", "45,19", "45,20", "45,21",
  "46,12", "46,21", "47,12", "47,21", "48,12", "48,21", "49,12", "49,21",
]);
const PLAYER_RECOVERY_CELLS = new Set([
  "2,12", "2,21", "3,12", "3,21", "4,12", "4,21", "5,12", "5,21",
  "6,12", "6,13", "6,14", "6,19", "6,20", "6,21",
]);

export function getSwfBaseCollisionCell(point: { x: number; y: number }): { x: number; y: number } {
  const source = battlefieldWorldPointToSource(point);
  return {
    x: Math.round(source.x / SWF_BASE_COLLISION_GRID_SIZE),
    y: Math.round(source.y / SWF_BASE_COLLISION_GRID_SIZE),
  };
}

export function getSwfBaseCollisionCodeAtWorld(point: { x: number; y: number }): SwfBaseCollisionCode {
  const cell = getSwfBaseCollisionCell(point);
  if (cell.x === 45 && ENEMY_BASE_DAMAGE_Y.has(cell.y)) return SWF_ENEMY_BASE_DAMAGE_TILE;
  if (cell.x === 6 && PLAYER_BASE_DAMAGE_Y.has(cell.y)) return SWF_PLAYER_BASE_DAMAGE_TILE;
  const key = `${cell.x},${cell.y}`;
  if (ENEMY_RECOVERY_CELLS.has(key)) return SWF_ENEMY_RECOVERY_TILE;
  if (PLAYER_RECOVERY_CELLS.has(key)) return SWF_PLAYER_RECOVERY_TILE;
  return null;
}

export function getSwfBaseDamageTileForTeam(team: Team): 996 | 997 {
  return team === "enemy" ? SWF_ENEMY_BASE_DAMAGE_TILE : SWF_PLAYER_BASE_DAMAGE_TILE;
}

export function getSwfRecoveryTileForTeam(team: Team): 998 | 999 {
  return team === "enemy" ? SWF_ENEMY_RECOVERY_TILE : SWF_PLAYER_RECOVERY_TILE;
}
