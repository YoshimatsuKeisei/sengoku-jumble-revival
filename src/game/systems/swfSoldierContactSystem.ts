import { BATTLEFIELD_CONFIG, SOLDIER_RADIUS } from "../config";
import {
  battlefieldSwfPointToWorld,
  battlefieldWorldPointToSwf,
} from "../battlefieldLayout";
import type { RandomSource } from "../stats/soldierStats";
import type { Soldier } from "../types";
import {
  getSwfBaseCollisionCell,
  getSwfStaticCollisionCodeAtWorld,
} from "./swfBaseCollisionGrid";
import {
  isRawNormalContactKLocked,
  resolveRawNormalContactAttack,
} from "./normalContactAttackSystem";
import { markSequentialContactCombatResolved } from "./normalCombatSystem";

export const SWF_SOLDIER_CONTACT_AXIS_UNITS = 32;
export const SWF_SOLDIER_CONTACT_SPACING_UNITS = 24;
export const SWF_CURRENT_TARGET_CONTACT_AXIS_UNITS = 20;
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
const lastContactAttackPositions = new WeakMap<Soldier, Position>();

export interface SwfSoldierContactResolution {
  dynamicContacts: number;
  spacingCorrections: number;
  forcedTargetContacts: number;
  impulsesArmed: number;
  impulseTicksApplied: number;
  normalContactAttacks: number;
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

function positionsDiffer(first: Position, second: Position): boolean {
  return first.x !== second.x || first.y !== second.y;
}

function rawMovedSinceLastContactAttack(soldier: Soldier): boolean {
  const current = battlefieldWorldPointToSwf(soldier);
  const previous = lastContactAttackPositions.get(soldier) ?? { x: 0, y: 0 };
  return current.x !== previous.x || current.y !== previous.y;
}

function rememberRawContactAttackPosition(soldier: Soldier): void {
  const raw = battlefieldWorldPointToSwf(soldier);
  lastContactAttackPositions.set(soldier, { x: raw.x, y: raw.y });
}

function canResolveRawNormalContactAttack(
  current: Soldier,
  candidate: Soldier,
  currentTime: number,
): boolean {
  return current.team !== candidate.team
    && current.activeSpecialTechnique === null
    && candidate.activeSpecialTechnique === null
    && current.reactionState === "NONE"
    // Raw fr._currentframe != 6 is the candidate hit/reaction visual gate.
    && candidate.reactionState === "NONE"
    && candidate.state !== "HEALING"
    && currentTime >= current.abilityActionLockUntil
    && rawMovedSinceLastContactAttack(current)
    && rawMovedSinceLastContactAttack(candidate);
}

function resolveRawContactContest(
  current: Soldier,
  candidate: Soldier,
  random: RandomSource,
): { attacker: Soldier; defender: Soldier } {
  const currentCombat = Math.max(0, current.stats.combat);
  const candidateCombat = Math.max(0, candidate.stats.combat);
  const currentPower = currentCombat ** 3;
  const candidatePower = candidateCombat ** 3;
  const sum = currentPower + candidatePower;
  // AVM1 branches to the current soldier when random*(pwA+pwB) <= pwA.
  const currentWins = sum === 0 || random() * sum <= currentPower;
  return currentWins
    ? { attacker: current, defender: candidate }
    : { attacker: candidate, defender: current };
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
  // Raw d() multiplies the global 8-way fx/fy table by i.s. In the revival,
  // normal i.s is represented by the soldier's foot stat; one raw logic tick
  // therefore moves `foot` source units before the 0.7 decay.
  const speedSource = Math.max(0, soldier.stats.foot);
  contactImpulseStates.set(soldier, {
    fxSource: SWF_CONTACT_FX[directionIndex] * speedSource,
    fySource: SWF_CONTACT_FY[directionIndex] * speedSource,
    remainingTicks: SWF_SOLDIER_CONTACT_IMPULSE_TICKS,
    nextTickAt,
  });
}

function canArmOtherContactImpulse(soldier: Soldier): boolean {
  // Raw candidate branch requires sp==0 and fr._currentframe!=6 before k=3.
  // The revival does not expose that exact MovieClip frame, so use the states
  // that represent the same "not in an overriding action/reaction" envelope.
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

/**
 * Replays the raw sequential f[][] soldier-contact layer.
 *
 * The caller supplies positions captured immediately before ordinary
 * player/AI movement. Units are then replayed in raw order (m200, m1..m59),
 * clearing their old dynamic cell before checking only the proposed cell.
 *
 * Contact impulse follows the raw k branch: k=3, source-space fx/fy based on
 * the unit's own s, one 24-Hz logic tick at a time, and 0.7 decay after each
 * attempted move. While k is active, ordinary movement is suppressed.
 *
 * Opposing-team normal attacks are resolved inside this same selected-contact
 * branch, matching raw d(): a successful attack gate skips the 24-unit/k=3
 * physical branch for that contact event.
 */
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
    normalContactAttacks: 0,
  };
  markSequentialContactCombatResolved(soldiers);
  const order = getSwfSoldierUpdateOrder(soldiers);
  const proposal = new Map<Soldier, Position>();
  const occupancy = new Map<string, Soldier>();
  const processed = new Set<Soldier>();
  const movedByContact = new Set<Soldier>();

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

  // Previous frame's final f[][] overwrite semantics: later raw update IDs win
  // if a revival fixture already contains multiple units in one coarse cell.
  for (const soldier of order) {
    if (!isActiveOccupant(soldier)) continue;
    occupancy.set(cellKey(soldier), soldier);
  }

  for (const soldier of order) {
    if (!isActiveOccupant(soldier)) continue;

    // d() clears the current unit's old dynamic cell before evaluating k/motion.
    const oldKey = cellKey(soldier);
    if (occupancy.get(oldKey) === soldier) occupancy.delete(oldKey);

    const proposed = proposal.get(soldier) ?? { x: soldier.x, y: soldier.y };

    // A mode-0 atck from an earlier raw-order soldier may have assigned this
    // unit k=10 before its own d() turn. Suppress its precomputed ordinary proposal.
    if (isRawNormalContactKLocked(soldier, currentTime)) {
      occupancy.set(cellKey(soldier), soldier);
      processed.add(soldier);
      continue;
    }

    // A 996/997 base bounce uses the same raw k slot with a stronger k=10
    // response, so it supersedes a soldier-contact impulse.
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
      // Between 24-Hz logic ticks the revival may render extra frames. Hold the
      // raw position and suppress ordinary movement until the next k tick.
      if (currentTime + 1e-6 >= impulse.nextTickAt) {
        if (applyContactImpulseTick(soldier, impulse, occupancy)) movedByContact.add(soldier);
        result.impulseTicksApplied += 1;
      }
      occupancy.set(cellKey(soldier), soldier);
      processed.add(soldier);
      continue;
    }

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
        processed.add(soldier);
        continue;
      }
      candidate = proposedOccupant;
    }

    result.dynamicContacts += 1;

    if (canResolveRawNormalContactAttack(soldier, candidate, currentTime)) {
      const { attacker, defender } = resolveRawContactContest(soldier, candidate, random);
      const attack = resolveRawNormalContactAttack(attacker, defender, currentTime, random);
      rememberRawContactAttackPosition(soldier);
      rememberRawContactAttackPosition(candidate);
      if (attack.resolved) result.normalContactAttacks += 1;
      // Raw d() jumps past the 24-unit/k=3 physical branch after atck(...,0).
      occupancy.set(cellKey(soldier), soldier);
      processed.add(soldier);
      continue;
    }

    const currentRaw = battlefieldWorldPointToSwf(soldier);
    const candidateRaw = battlefieldWorldPointToSwf(candidate);
    const angle = Math.atan2(candidateRaw.y - currentRaw.y, candidateRaw.x - currentRaw.x);

    if (candidate.baseContactLockTicks <= 0) {
      const destination = rawSpacingDestination(soldier, candidate);
      if (destination && cellIsFree(destination, occupancy)) {
        soldier.x = destination.x;
        soldier.y = destination.y;
        movedByContact.add(soldier);
        result.spacingCorrections += 1;
      }
    }

    // Raw d(): candidate gets the direction toward the current unit and current
    // unit gets +4 (180 degrees). Current k=3 is unconditional on this branch.
    const candidateDirection = rawContactDirectionIndex(angle);
    const currentDirection = oppositeDirectionIndex(candidateDirection);
    armContactImpulse(soldier, currentDirection, currentTime + SWF_SOLDIER_CONTACT_LOGIC_TICK_MS);
    result.impulsesArmed += 1;

    if (candidate.baseContactLockTicks <= 0 && canArmOtherContactImpulse(candidate)) {
      // If candidate's raw update has not happened yet this frame, its newly set
      // k=3 is observed immediately by its later d() call. Otherwise first tick
      // occurs on the next 24-Hz logic update.
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
    // Preserve unrelated pre-capture reaction velocity when no ordinary/contact
    // movement happened, but expose the actual final delta whenever this layer
    // changed the unit's frame position.
    if (start && intended && (positionsDiffer(start, intended) || movedByContact.has(soldier))) {
      soldier.velocityX = soldier.x - start.x;
      soldier.velocityY = soldier.y - start.y;
    }
  }

  return result;
}
