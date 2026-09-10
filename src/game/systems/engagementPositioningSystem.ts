import { BATTLEFIELD_CONFIG, SOLDIER_RADIUS } from "../config";
import { battlefieldSourcePointToWorld, battlefieldWorldPointToSource } from "../battlefieldLayout";
import type { BattleObstacle, Soldier } from "../types";
import { SWF_APPROACH_SPACING_UNITS } from "./techniqueCombatProfiles";
import { getSwfFenceCodeById, getSwfStaticCollisionCodeAtWorld } from "./swfBaseCollisionGrid";

export interface ApproachPoint { x: number; y: number }

export const SWF_CLOSE_ENGAGEMENT_AXIS_THRESHOLD_UNITS = 20;
const PURSUIT_DIRECTION_PROJECTION_WORLD = Math.max(BATTLEFIELD_CONFIG.width, BATTLEFIELD_CONFIG.height) * 4;

export function isApproachPointValid(point: ApproachPoint, obstacles: readonly BattleObstacle[]): boolean {
  if (point.x < SOLDIER_RADIUS || point.x > BATTLEFIELD_CONFIG.width - SOLDIER_RADIUS
    || point.y < SOLDIER_RADIUS || point.y > BATTLEFIELD_CONFIG.height - SOLDIER_RADIUS) return false;
  // Raw d() validates the 24-unit candidate through the same f collision grid.
  if (getSwfStaticCollisionCodeAtWorld(point) !== null) return false;
  // Keep support for non-SWF/debug obstacles without letting the alpha rectangles
  // for the six real fences override the raw 36-unit grid.
  return !obstacles.some((obstacle) => getSwfFenceCodeById(obstacle.id) === null
    && point.x >= obstacle.x - SOLDIER_RADIUS
    && point.x <= obstacle.x + obstacle.width + SOLDIER_RADIUS
    && point.y >= obstacle.y - SOLDIER_RADIUS
    && point.y <= obstacle.y + obstacle.height + SOLDIER_RADIUS);
}

/**
 * Raw d() performs its 24-unit close-combat correction only in the default
 * l-pursuit branch. Ordinary melee p30/p31 are explicit d() cases that jump
 * directly to common movement and therefore skip this correction.
 */
export function getRawCloseEngagementPoint(
  soldier: Soldier,
  target: Soldier,
  obstacles: readonly BattleObstacle[] = [],
): ApproachPoint | null {
  if (soldier.controller !== "ai" || soldier.targetId !== target.id) return null;
  if (soldier.strategy === "melee" && !soldier.rareSpecialAbilities.includes("NINJA_HUNTER")) return null;
  const source = battlefieldWorldPointToSource(soldier);
  const targetSource = battlefieldWorldPointToSource(target);
  const dx = targetSource.x - source.x;
  const dy = targetSource.y - source.y;
  if (Math.abs(dx) >= SWF_CLOSE_ENGAGEMENT_AXIS_THRESHOLD_UNITS
    || Math.abs(dy) >= SWF_CLOSE_ENGAGEMENT_AXIS_THRESHOLD_UNITS) return null;

  const length = Math.hypot(dx, dy);
  const ux = length > 0 ? dx / length : 1;
  const uy = length > 0 ? dy / length : 0;
  const point = battlefieldSourcePointToWorld({
    x: targetSource.x - ux * SWF_APPROACH_SPACING_UNITS,
    y: targetSource.y - uy * SWF_APPROACH_SPACING_UNITS,
  });
  return isApproachPointValid(point, obstacles) ? point : null;
}

/**
 * vc() samples tx/ty and stores a velocity vector. d() then keeps adding that
 * vector until another event or scd() calls vc() again. Project a far point
 * along that stored origin->tx/ty vector so movement code preserves the angle
 * without treating tx/ty as a finite waypoint or continuously homing on l.
 */
export function getRawStoredPursuitPoint(soldier: Soldier): ApproachPoint | null {
  if (soldier.targetId === null || soldier.moveTargetX === null || soldier.moveTargetY === null
    || soldier.engagementOriginX === null || soldier.engagementOriginY === null) return null;
  const dx = soldier.moveTargetX - soldier.engagementOriginX;
  const dy = soldier.moveTargetY - soldier.engagementOriginY;
  const length = Math.hypot(dx, dy);
  const ux = length > 0 ? dx / length : 1;
  const uy = length > 0 ? dy / length : 0;
  return {
    x: soldier.x + ux * PURSUIT_DIRECTION_PROJECTION_WORLD,
    y: soldier.y + uy * PURSUIT_DIRECTION_PROJECTION_WORLD,
  };
}

export function getPreferredApproachPoint(
  soldier: Soldier,
  target: Soldier,
  _soldiers: Soldier[],
  obstacles: readonly BattleObstacle[],
): ApproachPoint | null {
  return getRawCloseEngagementPoint(soldier, target, obstacles) ?? getRawStoredPursuitPoint(soldier);
}

export function clearApproachRuntime(soldier: Soldier): void {
  soldier.preferredApproachAngle = null;
  soldier.preferredApproachTargetId = null;
}
