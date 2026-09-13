import { battlefieldWorldPointToSwf } from "../battlefieldLayout";
import type { Soldier } from "../types";
import { getSwfBaseCollisionCell } from "./swfBaseCollisionGrid";

export const SWF_FORCED_TARGET_CONTACT_AXIS_UNITS = 20;
const SWF_COORDINATE_COMPARE_EPSILON = 1e-9;

export interface SwfContactPoint {
  x: number;
  y: number;
}

export interface SwfContactCandidateSelection {
  candidate: Soldier | null;
  source: "FORCED_TARGET" | "PROPOSED_CELL" | "NONE";
}

export function getSwfDynamicContactCellKey(point: SwfContactPoint): string {
  const cell = getSwfBaseCollisionCell(point);
  return `${cell.x},${cell.y}`;
}

function isActiveDynamicOccupant(soldier: Soldier): boolean {
  return !soldier.isDead && soldier.hp > 0 && soldier.state !== "HEALING";
}

function rawStrictAxisLessThan(delta: number, threshold: number): boolean {
  // World<->SWF scaling is not exactly representable in binary floating point.
  // For example, an exact raw 20-unit separation round-trips as
  // 19.999999999999886. The original AVM1 check is strict <20, so absorb only
  // that transform noise rather than letting the boundary become inclusive.
  return Math.abs(delta) + SWF_COORDINATE_COMPARE_EPSILON < threshold;
}

function isInsideForcedTargetAxisWindow(first: SwfContactPoint, second: SwfContactPoint): boolean {
  const a = battlefieldWorldPointToSwf(first);
  const b = battlefieldWorldPointToSwf(second);
  return rawStrictAxisLessThan(b.x - a.x, SWF_FORCED_TARGET_CONTACT_AXIS_UNITS)
    && rawStrictAxisLessThan(b.y - a.y, SWF_FORCED_TARGET_CONTACT_AXIS_UNITS);
}

/**
 * Pure reconstruction of the raw d(i) dynamic-contact candidate choice.
 *
 * The caller owns sequential f[][] mutation. This helper only decides which
 * soldier is the one candidate for the current d(i) call:
 * 1. an active current l target inside the strict <20/<20 axis window, else
 * 2. the one soldier stored in the proposed 36-unit f[][] cell, else none.
 *
 * It deliberately performs no movement, attack, damage, k lock, facing, or
 * impulse mutation. Those behaviors must remain separate until independently
 * confirmed against raw AVM1 and real-device behavior.
 */
export function selectSwfDynamicContactCandidate(
  current: Soldier,
  soldiers: readonly Soldier[],
  proposed: SwfContactPoint,
  occupancy: ReadonlyMap<string, Soldier>,
): SwfContactCandidateSelection {
  if (current.targetId) {
    const target = soldiers.find(
      (candidate) => candidate.id === current.targetId && isActiveDynamicOccupant(candidate),
    ) ?? null;
    if (target && isInsideForcedTargetAxisWindow(current, target)) {
      return { candidate: target, source: "FORCED_TARGET" };
    }
  }

  const occupant = occupancy.get(getSwfDynamicContactCellKey(proposed)) ?? null;
  if (occupant && occupant !== current && isActiveDynamicOccupant(occupant)) {
    return { candidate: occupant, source: "PROPOSED_CELL" };
  }

  return { candidate: null, source: "NONE" };
}
