import { BASE_CONFIG, BASE_CONTACT_CONFIG, SOLDIER_RADIUS } from "../config";
import { BATTLEFIELD_BASE_WORLD_RECTS, battlefieldSourceDistanceToWorldX } from "../battlefieldLayout";
import type { BattleBase, Soldier, Team } from "../types";
import { distanceToRect, getBaseAttackSurfaceRect } from "./battlefieldGeometry";
import { applyBaseAttackBounce } from "./baseAttackBounceSystem";
import { applyForcedMovement } from "./movementSystem";
import {
  getSwfBaseCollisionCodeAtWorld,
  SWF_ENEMY_BASE_DAMAGE_TILE,
  SWF_ENEMY_RECOVERY_TILE,
  SWF_PLAYER_BASE_DAMAGE_TILE,
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

export function damageBase(base: BattleBase, damage: number = BASE_CONFIG.damagePerHit): number {
  if (base.isDestroyed) return 0;
  const beforeHp = base.hp;
  base.hp = Math.max(0, base.hp - damage);
  if (base.hp === 0) base.isDestroyed = true;
  return beforeHp - base.hp;
}

function canPassRecoveryTile(soldier: Soldier, code: 998 | 999): boolean {
  if (soldier.state !== "EMERGENCY_RETREAT") return false;
  return (soldier.team === "enemy" && code === SWF_ENEMY_RECOVERY_TILE)
    || (soldier.team === "player" && code === SWF_PLAYER_RECOVERY_TILE);
}

function baseForDamageCode(bases: readonly BattleBase[], code: 996 | 997): BattleBase {
  return getBaseForTeam(bases, code === SWF_ENEMY_BASE_DAMAGE_TILE ? "enemy" : "player");
}

/**
 * Resolve the original shk2()/d() headquarters barrier. The visible PNG is not
 * an independent physics rectangle: 996/997 are blocking wall cells first and
 * damage cells second, while 998/999 admit only the matching retreat state.
 */
export function resolveBaseAccessCollisions(soldiers: Soldier[], bases: readonly BattleBase[]): void {
  for (const soldier of soldiers) {
    if (soldier.isDead || soldier.baseContactLockTicks > 0) continue;
    const code = getSwfBaseCollisionCodeAtWorld(soldier);

    if (code === SWF_ENEMY_BASE_DAMAGE_TILE || code === SWF_PLAYER_BASE_DAMAGE_TILE) {
      const base = baseForDamageCode(bases, code);
      const defenders = soldiers.filter((candidate) => candidate.team === base.team);
      applyBaseAttackBounce(soldier, base, defenders);
      soldier.baseContactLockTicks = BASE_CONTACT_CONFIG.lockLogicUpdates;
      continue;
    }

    if (code === SWF_ENEMY_RECOVERY_TILE || code === SWF_PLAYER_RECOVERY_TILE) {
      if (canPassRecoveryTile(soldier, code)) continue;
      const directionX = code === SWF_ENEMY_RECOVERY_TILE ? -1 : 1;
      applyForcedMovement(soldier, directionX, 0, battlefieldSourceDistanceToWorldX(6));
      soldier.baseContactLockTicks = BASE_CONTACT_CONFIG.lockLogicUpdates;
    }
  }
}
