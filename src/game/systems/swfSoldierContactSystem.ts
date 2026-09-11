import { BATTLEFIELD_CONFIG, SOLDIER_RADIUS } from "../config";
import {
  battlefieldSwfPointToWorld,
  battlefieldWorldPointToSwf,
} from "../battlefieldLayout";
import type { Soldier } from "../types";
import {
  getSwfBaseCollisionCell,
  getSwfStaticCollisionCodeAtWorld,
} from "./swfBaseCollisionGrid";

export const SWF_SOLDIER_CONTACT_AXIS_UNITS = 32;
export const SWF_SOLDIER_CONTACT_SPACING_UNITS = 24;
export const SWF_CURRENT_TARGET_CONTACT_AXIS_UNITS = 20;

interface Position {
  x: number;
  y: number;
}

export interface SwfSoldierContactResolution {
  dynamicContacts: number;
  spacingCorrections: number;
  forcedTargetContacts: number;
}

function rosterIndex(id: string, prefix: string): number | null {
  if (!id.startsWith(prefix)) return null;
  const parsed = Number(id.slice(prefix.length));
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Raw normal-battle order confirmed from m200 EnterFrame + al():
 * m200 first, then m1..m59. Revival roster IDs map to that as
 * player-0, player-1..29, enemy-0..29.
 */
export function getSwfSoldierUpdateOrder(soldiers: readonly Soldier[]): Soldier[] {
  const originalIndex = new Map(soldiers.map((soldier, index) => [soldier, index]));
  return [...soldiers].sort((a, b) => {
    const key = (soldier: Soldier): number => {
      const player = rosterIndex(soldier.id, "player-");
      if (player !== null) return player === 0 ? 0 : player;
      const enemy = rosterIndex(soldier.id, "enemy-");
      if (enemy !== null) return 30 + enemy;
      return 1000 + (originalIndex.get(soldier) ?? 0);
    };
    return key(a) - key(b);
  });
}

function cellKey(point: Position): string {
  const cell = getSwfBaseCollisionCell(point);
  return `${cell.x},${cell.y}`;
}

function isActiveOccupant(soldier: Soldier): boolean {
  return !soldier.isDead && soldier.hp > 0 && soldier.state !== "HEALING";
}

function clampToBattlefield(point: Position): Position {
  return {
    x: Math.max(SOLDIER_RADIUS, Math.min(BATTLEFIELD_CONFIG.width - SOLDIER_RADIUS, point.x)),
    y: Math.max(SOLDIER_RADIUS, Math.min(BATTLEFIELD_CONFIG.height - SOLDIER_RADIUS, point.y)),
  };
}

function rawAxisClose(first: Position, second: Position, threshold: number): boolean {
  const a = battlefieldWorldPointToSwf(first);
  const b = battlefieldWorldPointToSwf(second);
  return Math.abs(b.x - a.x) < threshold && Math.abs(b.y - a.y) < threshold;
}

function rawSpacingDestination(mover: Position, other: Position): Position | null {
  const current = battlefieldWorldPointToSwf(mover);
  const target = battlefieldWorldPointToSwf(other);
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  if (Math.abs(dx) >= SWF_SOLDIER_CONTACT_AXIS_UNITS || Math.abs(dy) >= SWF_SOLDIER_CONTACT_AXIS_UNITS) return null;
  const angle = Math.atan2(dy, dx);
  const raw = {
    x: Math.round(target.x - Math.cos(angle) * SWF_SOLDIER_CONTACT_SPACING_UNITS),
    y: Math.round(target.y - Math.sin(angle) * SWF_SOLDIER_CONTACT_SPACING_UNITS),
  };
  return clampToBattlefield(battlefieldSwfPointToWorld(raw));
}

function cellIsFree(point: Position, occupancy: ReadonlyMap<string, Soldier>): boolean {
  return getSwfStaticCollisionCodeAtWorld(point) === null && !occupancy.has(cellKey(point));
}

/**
 * Replays only the raw sequential f[][] selection/spacing layer.
 *
 * The caller supplies the positions captured immediately before ordinary
 * player/AI movement. That avoids reverse-engineering start positions from
 * velocity, which can include unrelated knockback/ability motion in the
 * revival runtime.
 *
 * This deliberately does NOT replay the old global all-pairs separator. Each
 * unit is restored to its pre-movement position, its old dynamic grid cell is
 * cleared, and only the proposed destination cell can select a normal contact
 * candidate. The current-target <20 override is likewise limited to that one
 * target.
 *
 * Enemy attack resolution remains owned by the existing combat system. For
 * this isolated replay, opposing-team contacts therefore do not receive a
 * second physical displacement here. The raw k=3/0.7 impulse remains a
 * separate follow-up stage so it can be clocked at SWF 24 Hz rather than at
 * renderer cadence.
 */
export function resolveSequentialSwfSoldierContacts(
  soldiers: Soldier[],
  movementStartPositions: ReadonlyMap<string, Position>,
): SwfSoldierContactResolution {
  const result: SwfSoldierContactResolution = {
    dynamicContacts: 0,
    spacingCorrections: 0,
    forcedTargetContacts: 0,
  };
  const order = getSwfSoldierUpdateOrder(soldiers);
  const proposal = new Map<Soldier, Position>();
  const occupancy = new Map<string, Soldier>();

  for (const soldier of order) {
    if (!isActiveOccupant(soldier)) continue;
    proposal.set(soldier, { x: soldier.x, y: soldier.y });
    const previous = movementStartPositions.get(soldier.id) ?? { x: soldier.x, y: soldier.y };
    soldier.x = previous.x;
    soldier.y = previous.y;
  }

  // Reproduce the previous frame's final f[][] overwrite semantics: later raw
  // update IDs win if an already-overlapping revival fixture shares a cell.
  for (const soldier of order) {
    if (!isActiveOccupant(soldier)) continue;
    occupancy.set(cellKey(soldier), soldier);
  }

  for (const soldier of order) {
    if (!isActiveOccupant(soldier)) continue;

    // d() clears the current unit's old dynamic cell before evaluating motion.
    const oldKey = cellKey(soldier);
    if (occupancy.get(oldKey) === soldier) occupancy.delete(oldKey);

    const proposed = proposal.get(soldier) ?? { x: soldier.x, y: soldier.y };
    const target = soldier.targetId
      ? soldiers.find((candidate) => candidate.id === soldier.targetId && isActiveOccupant(candidate)) ?? null
      : null;
    const forcedTarget = target && rawAxisClose(soldier, target, SWF_CURRENT_TARGET_CONTACT_AXIS_UNITS)
      ? target : null;

    let candidate: Soldier | null = null;
    if (forcedTarget) {
      result.forcedTargetContacts += 1;
      candidate = forcedTarget;
    } else {
      const proposedOccupant = occupancy.get(cellKey(proposed)) ?? null;
      if (!proposedOccupant) {
        soldier.x = proposed.x;
        soldier.y = proposed.y;
        occupancy.set(cellKey(soldier), soldier);
        continue;
      }
      candidate = proposedOccupant;
    }

    result.dynamicContacts += 1;

    // The raw enemy branch may call atck(...,3) and skip the same-team spacing
    // path. Existing combat resolution owns that enemy path in the revival.
    if (candidate.team === soldier.team
      && soldier.baseContactLockTicks <= 0 && candidate.baseContactLockTicks <= 0) {
      const destination = rawSpacingDestination(soldier, candidate);
      if (destination && cellIsFree(destination, occupancy)) {
        soldier.x = destination.x;
        soldier.y = destination.y;
        result.spacingCorrections += 1;
      }
    }

    occupancy.set(cellKey(soldier), soldier);
  }

  for (const soldier of soldiers) {
    if (!isActiveOccupant(soldier)) continue;
    const clamped = clampToBattlefield(soldier);
    soldier.x = clamped.x;
    soldier.y = clamped.y;
  }

  return result;
}
