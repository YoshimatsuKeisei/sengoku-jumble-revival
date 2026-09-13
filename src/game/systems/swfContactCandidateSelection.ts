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

export interface SwfSelectedEnemyContactPair {
  currentId: string;
  candidateId: string;
}

const pendingSelectedEnemyContacts = new WeakMap<readonly Soldier[], SwfSelectedEnemyContactPair[]>();

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

function sameUnorderedPair(
  pair: SwfSelectedEnemyContactPair,
  first: Soldier,
  second: Soldier,
): boolean {
  return (pair.currentId === first.id && pair.candidateId === second.id)
    || (pair.currentId === second.id && pair.candidateId === first.id);
}

function recordSelectedEnemyContact(
  current: Soldier,
  candidate: Soldier,
  soldiers: readonly Soldier[],
): void {
  if (candidate.team === current.team) return;
  const pending = pendingSelectedEnemyContacts.get(soldiers) ?? [];
  if (!pending.some((pair) => sameUnorderedPair(pair, current, candidate))) {
    pending.push({ currentId: current.id, candidateId: candidate.id });
  }
  pendingSelectedEnemyContacts.set(soldiers, pending);
}

/**
 * Returns the selected opposing contact pairs accumulated by the raw candidate
 * lookup since the previous consume for this exact roster array. BattleScene's
 * normal frame path calls the selector during movement/contact and consumes the
 * result once during normal-combat resolution later in the same frame.
 */
export function consumeSwfSelectedEnemyContactPairs(
  soldiers: readonly Soldier[],
): SwfSelectedEnemyContactPair[] {
  const pending = pendingSelectedEnemyContacts.get(soldiers) ?? [];
  pendingSelectedEnemyContacts.delete(soldiers);
  return pending.map((pair) => ({ ...pair }));
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
 *
 * As integration metadata only, opposing selections are also queued for the
 * normal-combat layer. Queuing does not itself mutate either soldier.
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
      recordSelectedEnemyContact(current, target, soldiers);
      return { candidate: target, source: "FORCED_TARGET" };
    }
  }

  const occupant = occupancy.get(getSwfDynamicContactCellKey(proposed)) ?? null;
  if (occupant && occupant !== current && isActiveDynamicOccupant(occupant)) {
    recordSelectedEnemyContact(current, occupant, soldiers);
    return { candidate: occupant, source: "PROPOSED_CELL" };
  }

  return { candidate: null, source: "NONE" };
}
