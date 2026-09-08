import { BASE_CONFIG, BASE_CONTACT_CONFIG, SOLDIER_RADIUS } from "../config";
import { BATTLEFIELD_BASE_WORLD_RECTS, battlefieldSourceDistanceToWorldX } from "../battlefieldLayout";
import type { BattleBase, Soldier, Team } from "../types";
import {
  distanceToRect,
  getBaseAttackSurfaceRect,
} from "./battlefieldGeometry";
import { applyForcedMovement } from "./movementSystem";
import {
  getSwfBaseCollisionCodeAtWorld,
  SWF_ENEMY_RECOVERY_TILE,
  SWF_PLAYER_RECOVERY_TILE,
} from "./swfBaseCollisionGrid";

export function createBattleBase(team: Team): BattleBase {
  const rect = BATTLEFIELD_BASE_WORLD_RECTS[team];
  return {
    id: `${team}-base`,
    team,
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
    hp: BASE_CONFIG.maxHp,
    maxHp: BASE_CONFIG.maxHp,
    width: rect.width,
    height: rect.height,
    isDestroyed: false,
  };
}

export function createBattleBases(): BattleBase[] {
  return [createBattleBase("player"), createBattleBase("enemy")];
}

export function getBaseForTeam(bases: readonly BattleBase[], team: Team): BattleBase {
  const base = bases.find((candidate) => candidate.team === team);
  if (!base) throw new Error(`Missing ${team} base`);
  return base;
}

export function getEnemyBase(bases: readonly BattleBase[], team: Team): BattleBase {
  return getBaseForTeam(bases, team === "player" ? "enemy" : "player");
}

/** Legacy read-only proximity helper. Damage itself is resolved from the SWF collision grid. */
export function distanceToBaseEdge(soldier: Soldier, base: BattleBase): number {
  return distanceToRect(soldier, getBaseAttackSurfaceRect(base));
}

/** Read-only compatibility helper; the active damage path lives in baseContactSystem. */
export function canAttackEnemyBase(soldier: Soldier, enemyBase: BattleBase): boolean {
  if (soldier.isDead || soldier.team === enemyBase.team || soldier.state !== "NORMAL") return false;
  if (enemyBase.isDestroyed || enemyBase.hp <= 0) return false;
  if (soldier.temporaryOrder?.type === "DEFEND_ORDER" || soldier.temporaryOrder?.type === "RALLY") return false;
  return distanceToBaseEdge(soldier, enemyBase) <= SOLDIER_RADIUS;
}

export function damageBase(base: BattleBase, damage: number = BASE_CONFIG.damagePerHit): void {
  if (base.isDestroyed) return;
  base.hp = Math.max(0, base.hp - damage);
  if (base.hp === 0) base.isDestroyed = true;
}

function canPassRecoveryTile(soldier: Soldier, code: 998 | 999): boolean {
  if (soldier.state !== "EMERGENCY_RETREAT") return false;
  return (soldier.team === "enemy" && code === SWF_ENEMY_RECOVERY_TILE)
    || (soldier.team === "player" && code === SWF_PLAYER_RECOVERY_TILE);
}

/**
 * Resolve the SWF's 998/999 recovery-wall collision codes. The original does
 * not make the full reconstructed 189x400 base image a physical rectangle.
 * Matching retreat states may pass their own recovery tile; every other unit
 * receives the corresponding +/-6 source-unit collision response with k=10.
 */
export function resolveBaseAccessCollisions(soldiers: Soldier[], _bases: readonly BattleBase[]): void {
  for (const soldier of soldiers) {
    if (soldier.isDead) continue;
    const code = getSwfBaseCollisionCodeAtWorld(soldier);
    if (code !== SWF_ENEMY_RECOVERY_TILE && code !== SWF_PLAYER_RECOVERY_TILE) continue;
    if (canPassRecoveryTile(soldier, code)) continue;

    const directionX = code === SWF_ENEMY_RECOVERY_TILE ? -1 : 1;
    applyForcedMovement(soldier, directionX, 0, battlefieldSourceDistanceToWorldX(6));
    soldier.baseContactLockTicks = Math.max(soldier.baseContactLockTicks, BASE_CONTACT_CONFIG.lockLogicUpdates);
  }
}
