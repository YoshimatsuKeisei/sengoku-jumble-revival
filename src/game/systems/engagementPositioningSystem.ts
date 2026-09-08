import { BATTLEFIELD_CONFIG, CLOSE_COMBAT_POSITIONING_CONFIG, SOLDIER_RADIUS } from "../config";
import { battlefieldSourcePointToWorld, battlefieldWorldPointToSource } from "../battlefieldLayout";
import type { BattleObstacle, Soldier } from "../types";
import { getApproachSpacingWorld, SWF_APPROACH_SPACING_UNITS } from "./techniqueCombatProfiles";

export interface ApproachPoint { x: number; y: number }

/** Raw d() only runs its local separation branch when both source-axis deltas are strictly below 20. */
export const SWF_CLOSE_ENGAGEMENT_AXIS_THRESHOLD_UNITS = 20;

// Legacy helpers are retained for compatibility with older callers/tests, but the
// active pursuit pipeline no longer uses persistent sector slots or jitter.
function hashText(text: string): number {
  let hash = 0;
  for (const character of text) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash;
}

function jitterFor(soldier: Soldier, target: Soldier): { angle: number; radius: number } {
  const hash = hashText(`${soldier.id}:${target.id}`);
  const angleUnit = (hash % 10_001) / 10_000;
  const radiusUnit = (Math.floor(hash / 10_001) % 10_001) / 10_000;
  return {
    angle: (angleUnit * 2 - 1) * CLOSE_COMBAT_POSITIONING_CONFIG.angleJitterDegrees * Math.PI / 180,
    radius: (radiusUnit * 2 - 1) * CLOSE_COMBAT_POSITIONING_CONFIG.radiusJitter,
  };
}

function approachRadius(soldier: Soldier, target: Soldier): number {
  return Math.max(1, getApproachSpacingWorld() - CLOSE_COMBAT_POSITIONING_CONFIG.approachMargin + jitterFor(soldier, target).radius);
}

export function computeApproachPoint(soldier: Soldier, target: Soldier, angle = soldier.preferredApproachAngle): ApproachPoint | null {
  if (angle === null) return null;
  const radius = approachRadius(soldier, target);
  return { x: target.x + Math.cos(angle) * radius, y: target.y + Math.sin(angle) * radius };
}

export function isApproachPointValid(point: ApproachPoint, obstacles: readonly BattleObstacle[]): boolean {
  if (point.x < SOLDIER_RADIUS || point.x > BATTLEFIELD_CONFIG.width - SOLDIER_RADIUS
    || point.y < SOLDIER_RADIUS || point.y > BATTLEFIELD_CONFIG.height - SOLDIER_RADIUS) return false;
  return !obstacles.some((obstacle) => point.x >= obstacle.x - SOLDIER_RADIUS
    && point.x <= obstacle.x + obstacle.width + SOLDIER_RADIUS
    && point.y >= obstacle.y - SOLDIER_RADIUS
    && point.y <= obstacle.y + obstacle.height + SOLDIER_RADIUS);
}

function crowdCost(
  soldier: Soldier,
  target: Soldier,
  candidate: ApproachPoint,
  soldiers: Soldier[],
): number {
  let crowd = 0;
  for (const ally of soldiers) {
    if (ally === soldier || ally.isDead || ally.controller !== "ai" || ally.team !== soldier.team || ally.targetId !== target.id) continue;
    const allyPoint = ally.preferredApproachTargetId === target.id ? computeApproachPoint(ally, target) : null;
    const position = allyPoint ?? ally;
    if (position && Math.hypot(position.x - candidate.x, position.y - candidate.y) <= CLOSE_COMBAT_POSITIONING_CONFIG.crowdRadius) crowd += 1;
  }
  return crowd * CLOSE_COMBAT_POSITIONING_CONFIG.crowdPenalty;
}

export function chooseApproachAngle(
  soldier: Soldier,
  target: Soldier,
  soldiers: Soldier[],
  obstacles: readonly BattleObstacle[],
): number | null {
  const jitter = jitterFor(soldier, target).angle;
  let bestAngle: number | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  const tieHash = hashText(`${target.id}:${soldier.id}`);
  for (let sector = 0; sector < CLOSE_COMBAT_POSITIONING_CONFIG.sectorCount; sector += 1) {
    const angle = sector * Math.PI * 2 / CLOSE_COMBAT_POSITIONING_CONFIG.sectorCount + jitter;
    const candidate = computeApproachPoint(soldier, target, angle);
    if (!candidate || !isApproachPointValid(candidate, obstacles)) continue;
    const distanceCost = Math.hypot(soldier.x - candidate.x, soldier.y - candidate.y);
    const tieBreak = ((tieHash + sector * 2_654_435_761) >>> 0) / 0xffff_ffff * 0.001;
    const score = distanceCost + crowdCost(soldier, target, candidate, soldiers) + tieBreak;
    if (score < bestScore) { bestScore = score; bestAngle = angle; }
  }
  return bestAngle;
}

export function clearApproachRuntime(soldier: Soldier): void {
  soldier.preferredApproachAngle = null;
  soldier.preferredApproachTargetId = null;
}

/**
 * Raw d() close correction. Outside the <20-by-<20 source-space overlap window,
 * ordinary pursuit follows l._x/l._y directly instead of reserving a slot.
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
  // Do not retain the old soft-sector runtime in the active SWF-conformant path.
  clearApproachRuntime(soldier);
  return getRawCloseEngagementPoint(soldier, target, obstacles);
}
