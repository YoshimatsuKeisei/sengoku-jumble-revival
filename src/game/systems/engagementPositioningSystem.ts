import { BATTLEFIELD_CONFIG, SOLDIER_RADIUS } from "../config";
import { battlefieldSourcePointToWorld, battlefieldWorldPointToSource } from "../battlefieldLayout";
import type { BattleObstacle, Soldier } from "../types";
import { SWF_APPROACH_SPACING_UNITS } from "./techniqueCombatProfiles";

export interface ApproachPoint { x: number; y: number }

export const SWF_CLOSE_ENGAGEMENT_AXIS_THRESHOLD_UNITS = 20;

export function isApproachPointValid(point: ApproachPoint, obstacles: readonly BattleObstacle[]): boolean {
  if (point.x < SOLDIER_RADIUS || point.x > BATTLEFIELD_CONFIG.width - SOLDIER_RADIUS
    || point.y < SOLDIER_RADIUS || point.y > BATTLEFIELD_CONFIG.height - SOLDIER_RADIUS) return false;
  return !obstacles.some((obstacle) => point.x >= obstacle.x - SOLDIER_RADIUS
    && point.x <= obstacle.x + obstacle.width + SOLDIER_RADIUS
    && point.y >= obstacle.y - SOLDIER_RADIUS
    && point.y <= obstacle.y + obstacle.height + SOLDIER_RADIUS);
}

/**
 * Raw d() only performs its 24-unit close-combat reposition when both source-space
 * axis deltas are strictly below 20. Outside that tiny overlap window pursuit aims
 * at l._x/l._y directly; there is no persistent sector, crowd slot, or jitter.
 */
export function getRawCloseEngagementPoint(
  soldier: Soldier,
  target: Soldier,
  obstacles: readonly BattleObstacle[] = [],
): ApproachPoint | null {
  if (soldier.controller !== "ai" || soldier.targetId !== target.id) return null;
  const source = battlefieldWorldPointToSource(soldier);
  const targetSource = battlefieldWorldPointToSource(target);
  const dx = targetSource.x - source.x;
  const dy = targetSource.y - source.y;
  if (Math.abs(dx) >= SWF_CLOSE_ENGAGEMENT_AXIS_THRESHOLD_UNITS
    || Math.abs(dy) >= SWF_CLOSE_ENGAGEMENT_AXIS_THRESHOLD_UNITS) return null;

  const length = Math.hypot(dx, dy);
  // Flash Math.atan2(0,0) follows the zero-angle branch; this is equivalent to
  // placing the unit 24 source units to the target's negative-X side.
  const ux = length > 0 ? dx / length : 1;
  const uy = length > 0 ? dy / length : 0;
  const point = battlefieldSourcePointToWorld({
    x: targetSource.x - ux * SWF_APPROACH_SPACING_UNITS,
    y: targetSource.y - uy * SWF_APPROACH_SPACING_UNITS,
  });
  return isApproachPointValid(point, obstacles) ? point : null;
}

export function getPreferredApproachPoint(
  soldier: Soldier,
  target: Soldier,
  _soldiers: Soldier[],
  obstacles: readonly BattleObstacle[],
): ApproachPoint | null {
  // Compatibility wrapper for the existing movement pipeline. Outside the raw
  // <20 overlap window this deliberately returns null so pursuit falls through
  // to the target's live coordinates instead of an invented persistent slot.
  return getRawCloseEngagementPoint(soldier, target, obstacles);
}

export function clearApproachRuntime(soldier: Soldier): void {
  // These fields are retained for save/runtime compatibility, but the raw SWF
  // does not persist an approach sector or preferred angle between frames.
  soldier.preferredApproachAngle = null;
  soldier.preferredApproachTargetId = null;
}
