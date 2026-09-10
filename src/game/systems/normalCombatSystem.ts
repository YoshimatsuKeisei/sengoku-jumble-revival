import { battlefieldWorldPointToSource } from "../battlefieldLayout";
import { STRATEGY_AI_CONFIG } from "../config";
import type { RandomSource } from "../stats/soldierStats";
import type { Soldier } from "../types";
import { startEngagement } from "./aiSystem";
import { startSoldierAttack } from "./attackSystem";
import { isValidCombatTarget } from "./combatTargetSystem";
import { recordNormalCombatResult } from "./meritSystem";
import { hasSpecialAbility } from "./specialAbilitySystem";
import {
  isWithinNormalContact,
  SWF_COMBAT_FPS,
  SWF_GRID_CELL_SIZE,
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
  // Raw shk stores pw2=raw combat and replaces pw with pow(raw combat, 3).
  // Scaling before cubing preserves that ratio while avoiding overflow for debug values.
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

/**
 * Phase-1 compatibility bridge for raw d() contact scheduling.
 *
 * The original SWF stores one dynamic soldier index in each 36-unit f-grid cell.
 * The revival movement layer still permits temporary overlaps, so later roster
 * entries overwrite earlier entries here, matching the one-value nature of f
 * without adding any positional correction in this probe.
 */
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
  // Raw atck only assigns l while p<89. NORMAL is the reconstruction-side
  // equivalent; retreat/healing/rejoin states must not acquire a new l.
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

/**
 * Search only the current 36-unit cell and its eight neighbors. Each cell
 * contributes at most one occupant, so this is bounded spatial contact lookup,
 * not the previous all-pairs sweep. Among valid local occupants the closest is
 * chosen only as a compatibility bridge until movement itself is driven by f.
 */
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
    if (!isContactPair(soldier, candidate)) continue;
    const distance = sourceDistanceSquared(soldier, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function isRawContactTickDue(soldiers: Soldier[], currentTime: number): boolean {
  let runtime = rawContactSchedulerByRoster.get(soldiers);
  if (!runtime || currentTime < runtime.lastObservedTime) {
    runtime = { nextTickAt: currentTime, lastObservedTime: currentTime };
    rawContactSchedulerByRoster.set(soldiers, runtime);
  }
  runtime.lastObservedTime = currentTime;
  if (currentTime + 1e-6 < runtime.nextTickAt) return false;

  // Do not replay many contact ticks from one rendered frame after a pause.
  // Advance the cadence beyond now and process exactly one spatial snapshot.
  do runtime.nextTickAt += SWF_NORMAL_CONTACT_TICK_MS;
  while (runtime.nextTickAt <= currentTime + 1e-6);
  return true;
}

export function resetNormalContactScheduler(soldiers: Soldier[]): void {
  rawContactSchedulerByRoster.delete(soldiers);
}

/**
 * Phase 1 of the raw contact rebuild.
 *
 * Contact arbitration runs at the SWF's 24 Hz cadence and uses a 36-unit
 * occupancy neighborhood. A soldier may participate in at most one contact per
 * logic tick. Crucially, this function performs no x/y spacing, knockback, fx/fy
 * impulse, or generic separation; the previously verified movement path remains
 * untouched. Existing attack windup/damage timing is intentionally retained for
 * this probe so scheduler effects can be evaluated in isolation.
 */
export function updateNormalCombatContests(
  soldiers: Soldier[],
  currentTime: number,
  random: RandomSource = Math.random,
): void {
  if (!isRawContactTickDue(soldiers, currentTime)) return;

  const occupancy = buildRawContactOccupancy(soldiers);
  const consumedThisTick = new Set<string>();

  for (const soldier of soldiers) {
    if (consumedThisTick.has(soldier.id) || !canOccupyRawContactGrid(soldier)) continue;
    const opponent = findLocalContactOccupant(soldier, occupancy, consumedThisTick);
    if (!opponent) continue;

    consumedThisTick.add(soldier.id);
    consumedThisTick.add(opponent.id);

    const attacker = resolveCombatContest(soldier, opponent, random);
    const defender = attacker === soldier ? opponent : soldier;
    applyNormalContactEngagements(attacker, defender, currentTime, random);
    if (startSoldierAttack(attacker, defender, currentTime)) {
      recordNormalCombatResult(attacker, defender);
    }
  }
}
