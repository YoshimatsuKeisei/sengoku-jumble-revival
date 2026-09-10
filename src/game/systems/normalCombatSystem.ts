import {
  battlefieldSourcePointToWorld,
  battlefieldWorldPointToSource,
} from "../battlefieldLayout";
import { STRATEGY_AI_CONFIG } from "../config";
import type { RandomSource } from "../stats/soldierStats";
import type { Soldier } from "../types";
import { startEngagement } from "./aiSystem";
import { startSoldierAttack } from "./attackSystem";
import { isValidCombatTarget } from "./combatTargetSystem";
import { recordNormalCombatResult } from "./meritSystem";
import {
  isRawGenericContactImpulseActive,
  resetRawGenericContactImpulses,
  startRawGenericContactImpulsePair,
  updateRawGenericContactImpulses,
} from "./rawContactImpulseSystem";
import { hasSpecialAbility } from "./specialAbilitySystem";
import { getSwfStaticCollisionCodeAtWorld } from "./swfBaseCollisionGrid";
import {
  isWithinNormalContact,
  SWF_APPROACH_SPACING_UNITS,
  SWF_COMBAT_FPS,
  SWF_GRID_CELL_SIZE,
  SWF_NORMAL_CONTACT_UNITS,
} from "./techniqueCombatProfiles";

export const SWF_NORMAL_CONTACT_TICK_MS = 1000 / SWF_COMBAT_FPS;

interface RawContactSchedulerRuntime {
  nextTickAt: number;
  lastObservedTime: number;
}

const rawContactSchedulerByRoster = new WeakMap<Soldier[], RawContactSchedulerRuntime>();

export interface RawContactGridCell {
  x: number;
  y: number;
}

const NEIGHBOR_CELL_OFFSETS: readonly RawContactGridCell[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
] as const;

export function getCombatWinProbability(combatA: number, combatB: number): number {
  const valueA = Math.max(0, combatA);
  const valueB = Math.max(0, combatB);
  const scale = Math.max(valueA, valueB);
  if (scale === 0) return 0.5;
  const weightA = (valueA / scale) ** 3;
  const weightB = (valueB / scale) ** 3;
  return weightA / (weightA + weightB);
}

export function resolveCombatContest(a: Soldier, b: Soldier, random: RandomSource = Math.random): Soldier {
  return random() < getCombatWinProbability(a.stats.combat, b.stats.combat) ? a : b;
}

export function getRawContactGridCell(point: Pick<Soldier, "x" | "y">): RawContactGridCell {
  const source = battlefieldWorldPointToSource(point);
  return {
    x: Math.round(source.x / SWF_GRID_CELL_SIZE),
    y: Math.round(source.y / SWF_GRID_CELL_SIZE),
  };
}

function rawContactCellKey(cell: RawContactGridCell): string {
  return `${cell.x},${cell.y}`;
}

function canOccupyRawContactGrid(soldier: Soldier): boolean {
  return !soldier.isDead && soldier.hp > 0 && soldier.state !== "HEALING";
}

function buildRawContactOccupancy(soldiers: readonly Soldier[]): Map<string, Soldier> {
  const occupancy = new Map<string, Soldier>();
  for (const soldier of soldiers) {
    if (!canOccupyRawContactGrid(soldier)) continue;
    occupancy.set(rawContactCellKey(getRawContactGridCell(soldier)), soldier);
  }
  return occupancy;
}

function isContactPair(a: Soldier, b: Soldier): boolean {
  if (!isValidCombatTarget(a, b) || !isValidCombatTarget(b, a)) return false;
  if (a.activeSpecialTechnique !== null || b.activeSpecialTechnique !== null) return false;
  return isWithinNormalContact(a, b);
}

function isRushCharge(soldier: Soldier): boolean {
  return soldier.strategy === "charge" && hasSpecialAbility(soldier, "RUSH");
}

function canReceiveNormalContactEngagement(soldier: Soldier): boolean {
  return !soldier.isDead && soldier.hp > 0 && soldier.state === "NORMAL";
}

function applyNormalContactEngagements(
  attacker: Soldier,
  defender: Soldier,
  currentTime: number,
  random: RandomSource,
): void {
  if (canReceiveNormalContactEngagement(defender)) {
    if (isRushCharge(defender)) random();
    startEngagement(defender, attacker, currentTime);
  }

  const rushKeepsPriorTarget = isRushCharge(attacker)
    && random() <= STRATEGY_AI_CONFIG.rushRetargetIgnoreChance;
  if (canReceiveNormalContactEngagement(attacker) && !rushKeepsPriorTarget) {
    startEngagement(attacker, defender, currentTime);
  }
}

function sourceDistanceSquared(a: Soldier, b: Soldier): number {
  const sourceA = battlefieldWorldPointToSource(a);
  const sourceB = battlefieldWorldPointToSource(b);
  const dx = sourceB.x - sourceA.x;
  const dy = sourceB.y - sourceA.y;
  return dx * dx + dy * dy;
}

function findLocalContactOccupant(
  soldier: Soldier,
  occupancy: ReadonlyMap<string, Soldier>,
  consumedThisTick: ReadonlySet<string>,
): Soldier | null {
  const center = getRawContactGridCell(soldier);
  let best: Soldier | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const offset of NEIGHBOR_CELL_OFFSETS) {
    const candidate = occupancy.get(rawContactCellKey({
      x: center.x + offset.x,
      y: center.y + offset.y,
    }));
    if (!candidate || candidate === soldier || consumedThisTick.has(candidate.id)) continue;
    if (isRawGenericContactImpulseActive(candidate)) continue;
    if (!isContactPair(soldier, candidate)) continue;
    const distance = sourceDistanceSquared(soldier, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Raw generic occupant contact proposes a point exactly 24 source units away
 * from the encountered occupant when both axis deltas are strictly below 32.
 * The current unit's f cell is cleared before the candidate cell is tested.
 * Phase 2A reproduces only that positional correction.
 */
export function applyRawContactSpacingPhase2A(
  soldier: Soldier,
  opponent: Soldier,
  occupancy: Map<string, Soldier>,
): boolean {
  const source = battlefieldWorldPointToSource(soldier);
  const other = battlefieldWorldPointToSource(opponent);
  const dx = other.x - source.x;
  const dy = other.y - source.y;
  if (Math.abs(dx) >= SWF_NORMAL_CONTACT_UNITS || Math.abs(dy) >= SWF_NORMAL_CONTACT_UNITS) return false;

  const angle = Math.atan2(dy, dx);
  const candidateSource = {
    x: Math.round(other.x - Math.cos(angle) * SWF_APPROACH_SPACING_UNITS),
    y: Math.round(other.y - Math.sin(angle) * SWF_APPROACH_SPACING_UNITS),
  };
  const candidateWorld = battlefieldSourcePointToWorld(candidateSource);
  const currentKey = rawContactCellKey(getRawContactGridCell(soldier));
  if (occupancy.get(currentKey) === soldier) occupancy.delete(currentKey);

  const candidateKey = rawContactCellKey(getRawContactGridCell(candidateWorld));
  const dynamicBlocked = occupancy.has(candidateKey);
  const staticBlocked = getSwfStaticCollisionCodeAtWorld(candidateWorld) !== null;
  const applied = !dynamicBlocked && !staticBlocked;
  if (applied) {
    soldier.x = candidateWorld.x;
    soldier.y = candidateWorld.y;
  }

  occupancy.set(rawContactCellKey(getRawContactGridCell(soldier)), soldier);
  return applied;
}

function isRawContactTickDue(soldiers: Soldier[], currentTime: number): boolean {
  let runtime = rawContactSchedulerByRoster.get(soldiers);
  if (!runtime || currentTime < runtime.lastObservedTime) {
    runtime = { nextTickAt: currentTime, lastObservedTime: currentTime };
    rawContactSchedulerByRoster.set(soldiers, runtime);
  }
  runtime.lastObservedTime = currentTime;
  if (currentTime + 1e-6 < runtime.nextTickAt) return false;

  do runtime.nextTickAt += SWF_NORMAL_CONTACT_TICK_MS;
  while (runtime.nextTickAt <= currentTime + 1e-6);
  return true;
}

export function resetNormalContactScheduler(soldiers: Soldier[]): void {
  rawContactSchedulerByRoster.delete(soldiers);
  resetRawGenericContactImpulses(soldiers);
}

/**
 * Phase 2B-1: retain the phase-2A 24-unit correction, then apply only the raw
 * k=3 fx/fy contact impulse to the selected pair on later 24 Hz ticks. Ordinary
 * movement is held while k is active so the impulse replaces rather than stacks
 * on the render-frame movement path. t+=10/vc2 remains deliberately deferred.
 */
export function updateNormalCombatContests(
  soldiers: Soldier[],
  currentTime: number,
  random: RandomSource = Math.random,
): void {
  if (!isRawContactTickDue(soldiers, currentTime)) return;

  updateRawGenericContactImpulses(soldiers, currentTime);
  const occupancy = buildRawContactOccupancy(soldiers);
  const consumedThisTick = new Set<string>();

  for (const soldier of soldiers) {
    if (consumedThisTick.has(soldier.id) || !canOccupyRawContactGrid(soldier)) continue;
    if (isRawGenericContactImpulseActive(soldier)) continue;
    const opponent = findLocalContactOccupant(soldier, occupancy, consumedThisTick);
    if (!opponent) continue;

    consumedThisTick.add(soldier.id);
    consumedThisTick.add(opponent.id);
    applyRawContactSpacingPhase2A(soldier, opponent, occupancy);

    const attacker = resolveCombatContest(soldier, opponent, random);
    const defender = attacker === soldier ? opponent : soldier;
    applyNormalContactEngagements(attacker, defender, currentTime, random);
    if (startSoldierAttack(attacker, defender, currentTime)) {
      recordNormalCombatResult(attacker, defender);
    }
    startRawGenericContactImpulsePair(soldier, opponent, currentTime);
  }
}
