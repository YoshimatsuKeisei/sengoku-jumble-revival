import { battlefieldWorldPointToSource } from "../battlefieldLayout";
import type { Soldier } from "../types";
import { isWithinNormalContact, SWF_GRID_CELL_SIZE } from "./techniqueCombatProfiles";

export interface RawMovementGateCell {
  x: number;
  y: number;
}

export interface RawMovementContactEvent {
  moverId: string;
  opponentId: string;
}

export type RawMovementStepDecision = "MOVE" | "MOVE_AND_STOP" | "STOP";

interface RawMovementContactGateRuntime {
  cells: Map<string, Soldier[]>;
  contacts: Map<string, RawMovementContactEvent>;
}

const NEIGHBOR_CELL_OFFSETS: readonly RawMovementGateCell[] = [
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

let activeRuntime: RawMovementContactGateRuntime | null = null;
let completedContacts: RawMovementContactEvent[] = [];

export function getRawMovementGateCell(point: Pick<Soldier, "x" | "y">): RawMovementGateCell {
  const source = battlefieldWorldPointToSource(point);
  return {
    x: Math.round(source.x / SWF_GRID_CELL_SIZE),
    y: Math.round(source.y / SWF_GRID_CELL_SIZE),
  };
}

function cellKey(cell: RawMovementGateCell): string {
  return `${cell.x},${cell.y}`;
}

function contactKey(firstId: string, secondId: string): string {
  return firstId < secondId ? `${firstId}\u0000${secondId}` : `${secondId}\u0000${firstId}`;
}

function canTrack(soldier: Soldier): boolean {
  return !soldier.isDead && soldier.hp > 0 && soldier.state !== "HEALING";
}

function addToCell(runtime: RawMovementContactGateRuntime, soldier: Soldier): void {
  if (!canTrack(soldier)) return;
  const key = cellKey(getRawMovementGateCell(soldier));
  const bucket = runtime.cells.get(key);
  if (bucket) bucket.push(soldier);
  else runtime.cells.set(key, [soldier]);
}

function removeFromCell(runtime: RawMovementContactGateRuntime, soldier: Soldier): void {
  const key = cellKey(getRawMovementGateCell(soldier));
  const bucket = runtime.cells.get(key);
  if (!bucket) return;
  const next = bucket.filter((candidate) => candidate !== soldier);
  if (next.length > 0) runtime.cells.set(key, next);
  else runtime.cells.delete(key);
}

function recordContact(runtime: RawMovementContactGateRuntime, mover: Soldier, opponent: Soldier): void {
  const key = contactKey(mover.id, opponent.id);
  if (!runtime.contacts.has(key)) {
    runtime.contacts.set(key, { moverId: mover.id, opponentId: opponent.id });
  }
}

/**
 * Compatibility probe for the raw d() ordering: create a dynamic 36-unit
 * spatial snapshot before AI movement, then update it sequentially as each AI
 * soldier is processed. Buckets intentionally tolerate reconstruction-side
 * overlaps; unlike raw f, the current revival can start a frame with multiple
 * soldiers in one cell.
 */
export function beginRawAiMovementContactGate(soldiers: readonly Soldier[]): void {
  const runtime: RawMovementContactGateRuntime = { cells: new Map(), contacts: new Map() };
  for (const soldier of soldiers) addToCell(runtime, soldier);
  activeRuntime = runtime;
}

export function endRawAiMovementContactGate(): void {
  if (!activeRuntime) return;
  completedContacts.push(...activeRuntime.contacts.values());
  activeRuntime = null;
}

/**
 * Drain the exact enemy pairs observed by the pre-move gate. The combat system
 * can retain these until its next 24 Hz logic tick, avoiding a second opponent
 * search after movement has already identified who blocked the step.
 */
export function drainRawMovementContactEvents(): RawMovementContactEvent[] {
  const result = completedContacts;
  completedContacts = [];
  return result;
}

export function resetRawMovementContactEvents(): void {
  completedContacts = [];
}

/** Clear the moving soldier before its candidate is checked, matching raw d(). */
export function beginRawSoldierMovementStep(soldier: Soldier): void {
  if (!activeRuntime) return;
  removeFromCell(activeRuntime, soldier);
}

/** Re-register the soldier at the position actually reached this update. */
export function finishRawSoldierMovementStep(soldier: Soldier): void {
  if (!activeRuntime) return;
  addToCell(activeRuntime, soldier);
}

function squaredDistance(a: Pick<Soldier, "x" | "y">, b: Pick<Soldier, "x" | "y">): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

/**
 * Probe only the enemy-contact boundary. Same-team traffic remains on the
 * already-verified reconstruction movement path until the raw generic occupant
 * vc2/t response is rebuilt as one unit.
 *
 * MOVE_AND_STOP means the candidate is the first small movement step entering
 * the raw normal-contact window. Commit that one step so the existing 24 Hz
 * contact scheduler can observe the pair, but do not spend the rest of this
 * rendered frame's movement distance and overshoot deeply into the opponent.
 */
export function getRawAiMovementStepDecision(
  soldier: Soldier,
  candidate: Pick<Soldier, "x" | "y">,
): RawMovementStepDecision {
  const runtime = activeRuntime;
  if (!runtime || !canTrack(soldier)) return "MOVE";

  const center = getRawMovementGateCell(candidate);
  for (const offset of NEIGHBOR_CELL_OFFSETS) {
    const bucket = runtime.cells.get(cellKey({ x: center.x + offset.x, y: center.y + offset.y }));
    if (!bucket) continue;
    for (const opponent of bucket) {
      if (opponent === soldier || opponent.team === soldier.team || !canTrack(opponent)) continue;
      const currentlyInContact = isWithinNormalContact(soldier, opponent);
      const candidateInContact = isWithinNormalContact(candidate, opponent);
      if (!currentlyInContact && candidateInContact) {
        recordContact(runtime, soldier, opponent);
        return "MOVE_AND_STOP";
      }
      if (currentlyInContact && candidateInContact
        && squaredDistance(candidate, opponent) < squaredDistance(soldier, opponent)) {
        recordContact(runtime, soldier, opponent);
        return "STOP";
      }
    }
  }
  return "MOVE";
}
