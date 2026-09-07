import { BASE_CONFIG, BATTLEFIELD_CONFIG, SOLDIER_RADIUS } from "../config";
import { BATTLEFIELD_BASE_WORLD_RECTS } from "../battlefieldLayout";
import type { BattleBase, Soldier, Team } from "../types";
import {
  distanceToRect,
  getBaseAttackSurfaceRect,
  getBaseFrontAccessBoundaryX,
  getBaseRect,
  isPointInsideRect,
  isPointWithinBaseGateSpan,
} from "./battlefieldGeometry";

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

export function distanceToBaseEdge(soldier: Soldier, base: BattleBase): number {
  return distanceToRect(soldier, getBaseAttackSurfaceRect(base));
}

/** Read-only proximity helper retained for callers/tests; damage is resolved only by baseContactSystem. */
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

function canOccupyOwnBase(soldier: Soldier, base: BattleBase): boolean {
  if (soldier.team !== base.team) return false;
  if (soldier.state === "HEALING" || soldier.state === "REJOINING") return true;
  if (soldier.state !== "EMERGENCY_RETREAT") return false;
  return soldier.recoveryGate
    ? isPointWithinBaseGateSpan(soldier, base, soldier.recoveryGate)
    : isPointWithinBaseGateSpan(soldier, base, "TOP") || isPointWithinBaseGateSpan(soldier, base, "BOTTOM");
}

export function resolveBaseAccessCollisions(soldiers: Soldier[], bases: readonly BattleBase[]): void {
  for (const soldier of soldiers) {
    if (soldier.isDead) continue;
    for (const base of bases) {
      if (canOccupyOwnBase(soldier, base)) continue;
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
        soldier.x = getBaseFrontAccessBoundaryX(base);
      } else if (nearest === "left") soldier.x = rect.x - SOLDIER_RADIUS;
      else if (nearest === "right") soldier.x = rect.x + rect.width + SOLDIER_RADIUS;
      else if (nearest === "top") soldier.y = rect.y - SOLDIER_RADIUS;
      else soldier.y = rect.y + rect.height + SOLDIER_RADIUS;
    }
  }
}
