import {
  battlefieldSwfPointToWorld,
  battlefieldWorldPointToSwf,
} from "../battlefieldLayout";
import type { BattleObstacle, Team } from "../types";

export const SWF_BASE_COLLISION_GRID_SIZE = 36;
export const SWF_ENEMY_BASE_DAMAGE_TILE = 996;
export const SWF_PLAYER_BASE_DAMAGE_TILE = 997;
export const SWF_ENEMY_RECOVERY_TILE = 998;
export const SWF_PLAYER_RECOVERY_TILE = 999;
export const SWF_OUTER_BOUNDARY_TILE = 1000;

export const SWF_FENCE_CODES = [901, 902, 903, 904, 905, 906] as const;
export type SwfFenceCode = typeof SWF_FENCE_CODES[number];
export type SwfBaseCollisionCode =
  | typeof SWF_ENEMY_BASE_DAMAGE_TILE
  | typeof SWF_PLAYER_BASE_DAMAGE_TILE
  | typeof SWF_ENEMY_RECOVERY_TILE
  | typeof SWF_PLAYER_RECOVERY_TILE
  | null;
export type SwfStaticCollisionCode = SwfFenceCode
  | Exclude<SwfBaseCollisionCode, null>
  | typeof SWF_OUTER_BOUNDARY_TILE
  | null;

interface FenceGridDefinition {
  code: SwfFenceCode;
  id: string;
  owner: Team;
  x: number;
  minY: number;
  maxY: number;
  routeCenterY: number;
}

/** Direct shk2()/vc3() constants from Sprite2456. */
export const SWF_FENCE_GRID_DEFINITIONS: readonly FenceGridDefinition[] = [
  { code: 901, id: "player-vanguard", owner: "player", x: 15, minY: 14, maxY: 17, routeCenterY: 504 },
  { code: 902, id: "player-lower", owner: "player", x: 18, minY: 21, maxY: 24, routeCenterY: 756 },
  { code: 903, id: "player-upper", owner: "player", x: 18, minY: 8, maxY: 11, routeCenterY: 288 },
  { code: 904, id: "enemy-upper", owner: "enemy", x: 33, minY: 8, maxY: 11, routeCenterY: 288 },
  { code: 905, id: "enemy-lower", owner: "enemy", x: 33, minY: 21, maxY: 24, routeCenterY: 756 },
  { code: 906, id: "enemy-vanguard", owner: "enemy", x: 36, minY: 14, maxY: 17, routeCenterY: 504 },
] as const;

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
  const source = battlefieldWorldPointToSwf(point);
  return {
    x: Math.round(source.x / SWF_BASE_COLLISION_GRID_SIZE),
    y: Math.round(source.y / SWF_BASE_COLLISION_GRID_SIZE),
  };
}

function fenceCodeAtCell(cell: { x: number; y: number }): SwfFenceCode | null {
  const definition = SWF_FENCE_GRID_DEFINITIONS.find((candidate) => candidate.x === cell.x
    && cell.y >= candidate.minY && cell.y <= candidate.maxY);
  return definition?.code ?? null;
}

export function getSwfStaticCollisionCodeAtWorld(point: { x: number; y: number }): SwfStaticCollisionCode {
  const cell = getSwfBaseCollisionCell(point);
  const fence = fenceCodeAtCell(cell);
  if (fence !== null) return fence;
  if (cell.x === 45 && ENEMY_BASE_DAMAGE_Y.has(cell.y)) return SWF_ENEMY_BASE_DAMAGE_TILE;
  if (cell.x === 6 && PLAYER_BASE_DAMAGE_Y.has(cell.y)) return SWF_PLAYER_BASE_DAMAGE_TILE;
  const key = `${cell.x},${cell.y}`;
  if (ENEMY_RECOVERY_CELLS.has(key)) return SWF_ENEMY_RECOVERY_TILE;
  if (PLAYER_RECOVERY_CELLS.has(key)) return SWF_PLAYER_RECOVERY_TILE;
  if (cell.x === 1 || cell.x === 50 || cell.y === 2 || cell.y === 31) return SWF_OUTER_BOUNDARY_TILE;
  return null;
}

export function getSwfBaseCollisionCodeAtWorld(point: { x: number; y: number }): SwfBaseCollisionCode {
  const code = getSwfStaticCollisionCodeAtWorld(point);
  return code === SWF_ENEMY_BASE_DAMAGE_TILE || code === SWF_PLAYER_BASE_DAMAGE_TILE
    || code === SWF_ENEMY_RECOVERY_TILE || code === SWF_PLAYER_RECOVERY_TILE
    ? code : null;
}

export function isSwfFenceCode(code: SwfStaticCollisionCode): code is SwfFenceCode {
  return code !== null && code >= 901 && code <= 906;
}

export function getSwfFenceDefinition(code: SwfFenceCode): FenceGridDefinition {
  const definition = SWF_FENCE_GRID_DEFINITIONS.find((candidate) => candidate.code === code);
  if (!definition) throw new Error(`Unknown SWF fence code ${code}`);
  return definition;
}

export function getSwfFenceOwner(code: SwfFenceCode): Team {
  return getSwfFenceDefinition(code).owner;
}

export function getSwfFenceId(code: SwfFenceCode): string {
  return getSwfFenceDefinition(code).id;
}

export function getSwfFenceCodeById(id: string): SwfFenceCode | null {
  return SWF_FENCE_GRID_DEFINITIONS.find((candidate) => candidate.id === id)?.code ?? null;
}

/** vc3 uses smy[u-900] + 70 as the upper/lower routing split. */
export function getSwfFenceRouteSplitY(code: SwfFenceCode): number {
  return getSwfFenceDefinition(code).routeCenterY + 70;
}

/** Exact round(x/36)/round(y/36) cell rectangle in raw SWF battle coordinates. */
export function getSwfFenceCollisionRect(code: SwfFenceCode): { x: number; y: number; width: number; height: number } {
  const definition = getSwfFenceDefinition(code);
  const x = (definition.x - 0.5) * SWF_BASE_COLLISION_GRID_SIZE;
  const y = (definition.minY - 0.5) * SWF_BASE_COLLISION_GRID_SIZE;
  return {
    x,
    y,
    width: SWF_BASE_COLLISION_GRID_SIZE,
    height: (definition.maxY - definition.minY + 1) * SWF_BASE_COLLISION_GRID_SIZE,
  };
}

export function getSwfFenceWorldObstacle(code: SwfFenceCode): BattleObstacle {
  const raw = getSwfFenceCollisionRect(code);
  const topLeft = battlefieldSwfPointToWorld({ x: raw.x, y: raw.y });
  const bottomRight = battlefieldSwfPointToWorld({ x: raw.x + raw.width, y: raw.y + raw.height });
  return {
    id: getSwfFenceId(code),
    type: "FENCE",
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
}

export const SWF_FIXED_FENCE_WORLD_OBSTACLES: readonly BattleObstacle[] = SWF_FENCE_CODES.map(getSwfFenceWorldObstacle);

function segmentIntersectsRect(
  a: { x: number; y: number },
  b: { x: number; y: number },
  rect: { x: number; y: number; width: number; height: number },
): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let near = 0;
  let far = 1;
  for (const [origin, delta, minimum, maximum] of [
    [a.x, dx, rect.x, rect.x + rect.width],
    [a.y, dy, rect.y, rect.y + rect.height],
  ] as const) {
    if (Math.abs(delta) < 1e-9) {
      if (origin < minimum || origin > maximum) return false;
      continue;
    }
    const first = (minimum - origin) / delta;
    const second = (maximum - origin) / delta;
    near = Math.max(near, Math.min(first, second));
    far = Math.min(far, Math.max(first, second));
    if (near > far) return false;
  }
  return far >= 0 && near <= 1;
}

/** True when the straight contact/chase segment crosses one of raw shk2's 901..906 cells. */
export function doesSwfFenceBlockSegment(
  first: { x: number; y: number },
  second: { x: number; y: number },
): boolean {
  const a = battlefieldWorldPointToSwf(first);
  const b = battlefieldWorldPointToSwf(second);
  return SWF_FENCE_CODES.some((code) => segmentIntersectsRect(a, b, getSwfFenceCollisionRect(code)));
}

export interface SwfBaseContactSegment { x: number; minY: number; maxY: number }

/** First raw 996/997 cell boundary reached by an attacker approaching from the field. */
export function getSwfBaseDamageContactSegment(team: Team): SwfBaseContactSegment {
  const xIndex = team === "enemy" ? 45 : 6;
  const rawX = team === "enemy"
    ? (xIndex - 0.5) * SWF_BASE_COLLISION_GRID_SIZE
    : (xIndex + 0.5) * SWF_BASE_COLLISION_GRID_SIZE;
  const rawMinY = (15 - 0.5) * SWF_BASE_COLLISION_GRID_SIZE;
  const rawMaxY = (18 + 0.5) * SWF_BASE_COLLISION_GRID_SIZE;
  const top = battlefieldSwfPointToWorld({ x: rawX, y: rawMinY });
  const bottom = battlefieldSwfPointToWorld({ x: rawX, y: rawMaxY });
  return { x: top.x, minY: top.y, maxY: bottom.y };
}

export function getSwfBaseDamageTileForTeam(team: Team): 996 | 997 {
  return team === "enemy" ? SWF_ENEMY_BASE_DAMAGE_TILE : SWF_PLAYER_BASE_DAMAGE_TILE;
}

export function getSwfRecoveryTileForTeam(team: Team): 998 | 999 {
  return team === "enemy" ? SWF_ENEMY_RECOVERY_TILE : SWF_PLAYER_RECOVERY_TILE;
}
