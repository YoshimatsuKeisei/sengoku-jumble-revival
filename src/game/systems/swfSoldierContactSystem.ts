import { BATTLEFIELD_CONFIG, SOLDIER_RADIUS } from "../config";
import {
  battlefieldSwfPointToWorld,
  battlefieldWorldPointToSwf,
} from "../battlefieldLayout";
import type { RandomSource } from "../stats/soldierStats";
import type { Soldier } from "../types";
import { canStartSoldierAttack, startSoldierAttack } from "./attackRuntime";
import { getSwfStaticCollisionCodeAtWorld } from "./swfBaseCollisionGrid";
import {
  getSwfDynamicContactCellKey,
  selectSwfDynamicContactCandidate,
} from "./swfContactCandidateSelection";
import { resolveSwfContactContest } from "./swfContactContestSystem";
import { markSwfSelectedContactBranchStarted } from "./swfSelectedContactBranchRuntime";

export const SWF_SOLDIER_CONTACT_AXIS_UNITS = 32;
export const SWF_SOLDIER_CONTACT_SPACING_UNITS = 24;
export const SWF_SOLDIER_CONTACT_IMPULSE_TICKS = 3;
export const SWF_SOLDIER_CONTACT_IMPULSE_DECAY = 0.7;
export const SWF_SOLDIER_CONTACT_LOGIC_TICK_MS = 1000 / 24;

const SWF_CONTACT_FX = [0, -1, -0.6, 0, 0.6, 1, 0.6, 0, -0.6] as const;
const SWF_CONTACT_FY = [0, 0, -0.6, -1, -0.6, 0, 0.6, 1, 0.6] as const;

interface Position {
  x: number;
  y: number;
}

interface ContactImpulseState {
  fxSource: number;
  fySource: number;
  remainingTicks: number;
  nextTickAt: number;
}

const contactImpulseStates = new WeakMap<Soldier, ContactImpulseState>();

export interface SwfSoldierContactResolution {
  dynamicContacts: number;
  spacingCorrections: number;
  forcedTargetContacts: number;
  impulsesArmed: number;
  impulseTicksApplied: number;
}

function rosterIndex(id: string, prefix: string): number | null {
  if (!id.startsWith(prefix)) return null;
  const parsed = Number(id.slice(prefix.length));
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

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
  return getSwfDynamicContactCellKey(point);
}

function unorderedPairKey(first: Soldier, second: Soldier): string {
  return first.id < second.id
    ? `${first.id}\u0000${second.id}`
    : `${second.id}\u0000${first.id}`;
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

function positionsDiffer(first: Position, second: Position): boolean {
  return first.x !== second.x || first.y !== second.y;
}

function rawContactDirectionIndex(angle: number): number {
  let index = Math.round(angle / 0.75) + 5;
  if (index > 8) index = 1;
  if (index < 1) index = 8;
  return index;
}

function oppositeDirectionIndex(index: number): number {
  const opposite = index + 4;
  return opposite > 8 ? opposite - 8 : opposite;
}

function armContactImpulse(
  soldier: Soldier,
  directionIndex: number,
  nextTickAt: number,
): void {
  const speedSource = Math.max(0, soldier.stats.foot);
  contactImpulseStates.set(soldier, {
    fxSource: SWF_CONTACT_FX[directionIndex] * speedSource,
    fySource: SWF_CONTACT_FY[directionIndex] * speedSource,
    remainingTicks: SWF_SOLDIER_CONTACT_IMPULSE_TICKS,
    nextTickAt,
  });
}

function canArmOtherContactImpulse(soldier: Soldier): boolean {
  return soldier.activeSpecialTechnique === null
    && soldier.reactionState === "NONE"
    && soldier.combatActionState === "IDLE";
}

function applyContactImpulseTick(
  soldier: Soldier,
  state: ContactImpulseState,
  occupancy: ReadonlyMap<string, Soldier>,
): boolean {
  const raw = battlefieldWorldPointToSwf(soldier);
  const destination = clampToBattlefield(battlefieldSwfPointToWorld({
    x: raw.x + state.fxSource,
    y: raw.y + state.fySource,
  }));
  let moved = false;
  if (cellIsFree(destination, occupancy)) {
    soldier.x = destination.x;
    soldier.y = destination.y;
    moved = true;
  }
  state.fxSource *= SWF_SOLDIER_CONTACT_IMPULSE_DECAY;
  state.fySource *= SWF_SOLDIER_CONTACT_IMPULSE_DECAY;
  state.remainingTicks -= 1;
  state.nextTickAt += SWF_SOLDIER_CONTACT_LOGIC_TICK_MS;
  if (state.remainingTicks <= 0) contactImpulseStates.delete(soldier);
  return moved;
}

function tryStartSelectedEnemyContactBranch(
  current: Soldier,
  candidate: Soldier,
  soldiers: readonly Soldier[],
  currentTime: number,
  random: RandomSource,
): boolean {
  if (candidate.team === current.team) return false;
  if (!canStartSoldierAttack(current, candidate, currentTime)
    || !canStartSoldierAttack(candidate, current, currentTime)) return false;
  const attacker = resolveSwfContactContest(current, candidate, random);
  const defender = attacker === current ? candidate : current;
  if (!startSoldierAttack(attacker, defender, currentTime)) return false;
  markSwfSelectedContactBranchStarted(soldiers, current, candidate, attacker, defender);
  return true;
}

export function resolveSequentialSwfSoldierContacts(
  soldiers: Soldier[],
  movementStartPositions: ReadonlyMap<string, Position>,
  currentTime = performance.now(),
  random: RandomSource = Math.random,
): SwfSoldierContactResolution {
  const result: SwfSoldierContactResolution = {
    dynamicContacts: 0,
    spacingCorrections: 0,
    forcedTargetContacts: 0,
    impulsesArmed: 0,
    impulseTicksApplied: 0,
  };
  const order = getSwfSoldierUpdateOrder(soldiers);
  const proposal = new Map<Soldier, Position>();
  const occupancy = new Map<string, Soldier>();
  const processed = new Set<Soldier>();
  const movedByContact = new Set<Soldier>();
  const startedContactPairs = new Set<string>();

  for (const soldier of order) {
    if (!isActiveOccupant(soldier)) {
      contactImpulseStates.delete(soldier);
      continue;
    }
    proposal.set(soldier, { x: soldier.x, y: soldier.y });
    const previous = movementStartPositions.get(soldier.id) ?? { x: soldier.x, y: soldier.y };
    soldier.x = previous.x;
    soldier.y = previous.y;
  }

  for (const soldier of order) {
    if (!isActiveOccupant(soldier)) continue;
    occupancy.set(cellKey(soldier), soldier);
  }

  for (const soldier of order) {
    if (!isActiveOccupant(soldier)) continue;

    const oldKey = cellKey(soldier);
    if (occupancy.get(oldKey) === soldier) occupancy.delete(oldKey);

    const proposed = proposal.get(soldier) ?? { x: soldier.x, y: soldier.y };

    if (soldier.baseContactLockTicks > 0) {
      contactImpulseStates.delete(soldier);
      soldier.x = proposed.x;
      soldier.y = proposed.y;
      occupancy.set(cellKey(soldier), soldier);
      processed.add(soldier);
      continue;
    }

    const impulse = contactImpulseStates.get(soldier);
    if (impulse) {
      if (currentTime + 1e-6 >= impulse.nextTickAt) {
        if (applyContactImpulseTick(soldier, impulse, occupancy)) movedByContact.add(soldier);
        result.impulseTicksApplied += 1;
      }
      occupancy.set(cellKey(soldier), soldier);
      processed.add(soldier);
      continue;
    }

    const selection = selectSwfDynamicContactCandidate(
      soldier,
      soldiers,
      proposed,
      occupancy,
    );
    const candidate = selection.candidate;
    if (!candidate) {
      soldier.x = proposed.x;
      soldier.y = proposed.y;
      occupancy.set(cellKey(soldier), soldier);
      processed.add(soldier);
      continue;
    }
    if (selection.source === "FORCED_TARGET") result.forcedTargetContacts += 1;

    result.dynamicContacts += 1;
    const selectedPairKey = unorderedPairKey(soldier, candidate);
    if (startedContactPairs.has(selectedPairKey)) {
      occupancy.set(cellKey(soldier), soldier);
      processed.add(soldier);
      continue;
    }

    if (tryStartSelectedEnemyContactBranch(soldier, candidate, soldiers, currentTime, random)) {
      // Raw d(i): successful atck(...,0) updates bx/by and jumps over the
      // physical 32/24 + k=3 branch. Remove any provisional contact impulse on
      // either participant so the skipped branch cannot leak back in later in
      // this reconstruction frame.
      contactImpulseStates.delete(soldier);
      contactImpulseStates.delete(candidate);
      startedContactPairs.add(selectedPairKey);
      occupancy.set(cellKey(soldier), soldier);
      processed.add(soldier);
      continue;
    }

    const currentRaw = battlefieldWorldPointToSwf(soldier);
    const candidateRaw = battlefieldWorldPointToSwf(candidate);
    const angle = Math.atan2(candidateRaw.y - currentRaw.y, candidateRaw.x - currentRaw.x);

    if (candidate.team === soldier.team && candidate.baseContactLockTicks <= 0) {
      const destination = rawSpacingDestination(soldier, candidate);
      if (destination && cellIsFree(destination, occupancy)) {
        soldier.x = destination.x;
        soldier.y = destination.y;
        movedByContact.add(soldier);
        result.spacingCorrections += 1;
      }
    }

    const candidateDirection = rawContactDirectionIndex(angle);
    const currentDirection = oppositeDirectionIndex(candidateDirection);
    armContactImpulse(soldier, currentDirection, currentTime + SWF_SOLDIER_CONTACT_LOGIC_TICK_MS);
    result.impulsesArmed += 1;

    if (candidate.baseContactLockTicks <= 0 && canArmOtherContactImpulse(candidate)) {
      armContactImpulse(
        candidate,
        candidateDirection,
        processed.has(candidate) ? currentTime + SWF_SOLDIER_CONTACT_LOGIC_TICK_MS : currentTime,
      );
      result.impulsesArmed += 1;
    }

    occupancy.set(cellKey(soldier), soldier);
    processed.add(soldier);
  }

  for (const soldier of soldiers) {
    if (!isActiveOccupant(soldier)) continue;
    const clamped = clampToBattlefield(soldier);
    soldier.x = clamped.x;
    soldier.y = clamped.y;

    const start = movementStartPositions.get(soldier.id);
    const intended = proposal.get(soldier);
    if (start && intended && (positionsDiffer(start, intended) || movedByContact.has(soldier))) {
      soldier.velocityX = soldier.x - start.x;
      soldier.velocityY = soldier.y - start.y;
    }
  }

  return result;
}
