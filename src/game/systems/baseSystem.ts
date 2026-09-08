import { BASE_CONFIG, BASE_CONTACT_CONFIG, BATTLEFIELD_CONFIG, SOLDIER_RADIUS } from "../config";
import { BATTLEFIELD_BASE_WORLD_RECTS, battlefieldSourceDistanceToWorldX } from "../battlefieldLayout";
import type { BattleBase, Soldier, Team } from "../types";
import {
  distanceToRect,
  getBaseAttackSurfaceRect,
  getBaseFrontAccessBoundaryX,
  getBaseRect,
  isPointInsideRect,
  isPointWithinBaseGateSpan,
} from "./battlefieldGeometry";
import { applyBaseAttackBounce } from "./baseAttackBounceSystem";
import { applyForcedMovement } from "./movementSystem";
import {
  getSwfBaseCollisionCodeAtWorld,
  SWF_ENEMY_BASE_DAMAGE_TILE,
  SWF_ENEMY_RECOVERY_TILE,
  SWF_PLAYER_BASE_DAMAGE_TILE,
  SWF_PLAYER_RECOVERY_TILE,
} from "./swfBaseCollisionGrid";

type RecoveryEntryRuntime = Soldier & { recoveryEntryCommitted?: boolean };

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
 * The 2026-09-07 build used the visible headquarters rectangle as a runtime
 * access guard. That guard is intentionally preserved here because the SWF
 * 996..999 lookup cells do not cover every visual entry path in the revival's
 * reconstructed geometry. Raw SWF cell behavior is still applied first.
 */
function canOccupyOwnVisualBase(soldier: Soldier, base: BattleBase): boolean {
  if (soldier.team !== base.team) return false;
  if (soldier.state === "HEALING" || soldier.state === "REJOINING") return true;
  if (soldier.state !== "EMERGENCY_RETREAT") return false;
  if (Boolean((soldier as RecoveryEntryRuntime).recoveryEntryCommitted)) return true;
  return soldier.recoveryGate
    ? isPointWithinBaseGateSpan(soldier, base, soldier.recoveryGate)
    : isPointWithinBaseGateSpan(soldier, base, "TOP") || isPointWithinBaseGateSpan(soldier, base, "BOTTOM");
}

function enforceVisualBaseAccessGuard(soldier: Soldier, bases: readonly BattleBase[]): void {
  for (const base of bases) {
    if (canOccupyOwnVisualBase(soldier, base)) continue;
    const rect = getBaseRect(base);
    const frontBoundaryX = getBaseFrontAccessBoundaryX(base);
    const overlapsFrontFace = soldier.y >= rect.y - SOLDIER_RADIUS
      && soldier.y <= rect.y + rect.height + SOLDIER_RADIUS
      && (base.team === "enemy"
        ? soldier.x > frontBoundaryX && soldier.x < rect.x
        : soldier.x < frontBoundaryX && soldier.x > rect.x + rect.width);
    if (overlapsFrontFace) {
      soldier.x = frontBoundaryX;
      continue;
    }
    if (!isPointInsideRect(soldier, rect)) continue;
    const distances = {
      left: rect.x <= 0 ? Number.POSITIVE_INFINITY : Math.abs(soldier.x - rect.x),
      right: rect.x + rect.width >= BATTLEFIELD_CONFIG.width
        ? Number.POSITIVE_INFINITY
        : Math.abs(rect.x + rect.width - soldier.x),
      top: Math.abs(soldier.y - rect.y),
      bottom: Math.abs(rect.y + rect.height - soldier.y),
    };
    const nearest = (Object.keys(distances) as Array<keyof typeof distances>)
      .reduce((best, side) => distances[side] < distances[best] ? side : best, "left");
    if ((base.team === "enemy" && nearest === "left")
      || (base.team === "player" && nearest === "right")) {
      soldier.x = frontBoundaryX;
    } else if (nearest === "left") soldier.x = rect.x - SOLDIER_RADIUS;
    else if (nearest === "right") soldier.x = rect.x + rect.width + SOLDIER_RADIUS;
    else if (nearest === "top") soldier.y = rect.y - SOLDIER_RADIUS;
    else soldier.y = rect.y + rect.height + SOLDIER_RADIUS;
  }
}

/**
 * Resolve raw 996..999 collisions, then restore the proven 2026-09-07 visual
 * headquarters access guard for the zero-code gaps created by reconstruction.
 */
export function resolveBaseAccessCollisions(soldiers: Soldier[], bases: readonly BattleBase[]): void {
  for (const soldier of soldiers) {
    if (soldier.isDead) continue;
    const code = getSwfBaseCollisionCodeAtWorld(soldier);

    if (soldier.baseContactLockTicks <= 0) {
      if (code === SWF_ENEMY_BASE_DAMAGE_TILE || code === SWF_PLAYER_BASE_DAMAGE_TILE) {
        const base = baseForDamageCode(bases, code);
        const defenders = soldiers.filter((candidate) => candidate.team === base.team);
        applyBaseAttackBounce(soldier, base, defenders);
        soldier.baseContactLockTicks = BASE_CONTACT_CONFIG.lockLogicUpdates;
      } else if (code === SWF_ENEMY_RECOVERY_TILE || code === SWF_PLAYER_RECOVERY_TILE) {
        if (!canPassRecoveryTile(soldier, code)) {
          const directionX = code === SWF_ENEMY_RECOVERY_TILE ? -1 : 1;
          applyForcedMovement(soldier, directionX, 0, battlefieldSourceDistanceToWorldX(6));
          soldier.baseContactLockTicks = BASE_CONTACT_CONFIG.lockLogicUpdates;
        }
      }
    }

    // Raw special cells keep their own response. The restored visual guard is
    // specifically for the reconstructed zero-code gaps that caused soldiers
    // to enter the fenced headquarters and fight inside it.
    if (code === null) enforceVisualBaseAccessGuard(soldier, bases);
  }
}
