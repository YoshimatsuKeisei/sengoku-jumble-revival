import type { Soldier } from "../types";
import {
  canDropFormationSoldier,
  formationCellKey,
  formationGridToWorld,
  formationWorldToGrid,
  getFormationFixedObstacleCells,
  isFormationGridCellInside,
  nearestFreeFormationCell,
  type FormationGridCell,
} from "./formationGrid";

export interface FormationSoldierPosition {
  soldierId: string;
  rosterIndex: number;
  gridX: number;
  gridY: number;
  worldX: number;
  worldY: number;
}

export interface FormationState {
  version: 1;
  soldiers: FormationSoldierPosition[];
}

export type FormationRosterSoldier = Pick<Soldier, "id" | "x" | "y">;

let committedFormation: FormationState | null = null;
const savedFormationSlots: Array<FormationState | null> = [null, null, null];

export function cloneFormationState(state: FormationState): FormationState {
  return { version: 1, soldiers: state.soldiers.map((soldier) => ({ ...soldier })) };
}

function positionForCell(soldierId: string, rosterIndex: number, cell: FormationGridCell): FormationSoldierPosition {
  const world = formationGridToWorld(cell.gridX, cell.gridY);
  return {
    soldierId,
    rosterIndex,
    gridX: cell.gridX,
    gridY: cell.gridY,
    worldX: world.x,
    worldY: world.y,
  };
}

function placeAtOrNearest(
  soldierId: string,
  rosterIndex: number,
  preferred: FormationGridCell,
  occupied: Set<string>,
): FormationSoldierPosition {
  const fixed = getFormationFixedObstacleCells();
  const preferredKey = formationCellKey(preferred.gridX, preferred.gridY);
  const usablePreferred = isFormationGridCellInside(preferred.gridX, preferred.gridY)
    && !fixed.has(preferredKey)
    && !occupied.has(preferredKey);
  const cell = usablePreferred ? preferred : nearestFreeFormationCell(preferred, occupied, fixed);
  if (!cell) throw new Error("No legal formation cell is available");
  occupied.add(formationCellKey(cell.gridX, cell.gridY));
  return positionForCell(soldierId, rosterIndex, cell);
}

export function createInitialFormationState(roster: readonly FormationRosterSoldier[]): FormationState {
  const occupied = new Set<string>();
  return {
    version: 1,
    soldiers: roster.map((soldier, rosterIndex) => placeAtOrNearest(
      soldier.id,
      rosterIndex,
      formationWorldToGrid(soldier.x, soldier.y),
      occupied,
    )),
  };
}

export function reconcileFormationState(
  roster: readonly FormationRosterSoldier[],
  saved: FormationState,
): FormationState {
  const result: Array<FormationSoldierPosition | null> = roster.map(() => null);
  const occupied = new Set<string>();
  const usedSavedEntries = new Set<FormationSoldierPosition>();

  const trySavedPosition = (rosterIndex: number, savedPosition: FormationSoldierPosition | undefined): boolean => {
    if (!savedPosition || usedSavedEntries.has(savedPosition)) return false;
    const key = formationCellKey(savedPosition.gridX, savedPosition.gridY);
    const fixed = getFormationFixedObstacleCells();
    if (!isFormationGridCellInside(savedPosition.gridX, savedPosition.gridY) || fixed.has(key) || occupied.has(key)) return false;
    result[rosterIndex] = positionForCell(roster[rosterIndex].id, rosterIndex, savedPosition);
    occupied.add(key);
    usedSavedEntries.add(savedPosition);
    return true;
  };

  // Stable ids win even when roster order changes.
  roster.forEach((soldier, rosterIndex) => {
    trySavedPosition(rosterIndex, saved.soldiers.find((position) => position.soldierId === soldier.id));
  });
  // The original roster slot is the documented fallback for ids that changed.
  roster.forEach((_soldier, rosterIndex) => {
    if (result[rosterIndex]) return;
    trySavedPosition(rosterIndex, saved.soldiers.find((position) => position.rosterIndex === rosterIndex));
  });
  // New members are placed deterministically at the nearest available legal cell.
  roster.forEach((soldier, rosterIndex) => {
    if (result[rosterIndex]) return;
    result[rosterIndex] = placeAtOrNearest(
      soldier.id,
      rosterIndex,
      formationWorldToGrid(soldier.x, soldier.y),
      occupied,
    );
  });

  return { version: 1, soldiers: result as FormationSoldierPosition[] };
}

export function createWorkingFormationState(roster: readonly FormationRosterSoldier[]): FormationState {
  return committedFormation
    ? reconcileFormationState(roster, committedFormation)
    : createInitialFormationState(roster);
}

export function moveFormationSoldier(
  state: FormationState,
  soldierId: string,
  gridX: number,
  gridY: number,
): boolean {
  if (!canDropFormationSoldier(state.soldiers, soldierId, gridX, gridY)) return false;
  const soldier = state.soldiers.find((position) => position.soldierId === soldierId);
  if (!soldier) return false;
  const world = formationGridToWorld(gridX, gridY);
  Object.assign(soldier, { gridX, gridY, worldX: world.x, worldY: world.y });
  return true;
}

export function validateFormationState(state: FormationState, expectedSoldiers = 30): boolean {
  if (state.version !== 1 || state.soldiers.length !== expectedSoldiers) return false;
  const fixed = getFormationFixedObstacleCells();
  const occupied = new Set<string>();
  const soldierIds = new Set<string>();
  for (const soldier of state.soldiers) {
    const key = formationCellKey(soldier.gridX, soldier.gridY);
    const world = formationGridToWorld(soldier.gridX, soldier.gridY);
    if (!isFormationGridCellInside(soldier.gridX, soldier.gridY)
      || fixed.has(key)
      || occupied.has(key)
      || soldierIds.has(soldier.soldierId)
      || soldier.worldX !== world.x
      || soldier.worldY !== world.y) return false;
    occupied.add(key);
    soldierIds.add(soldier.soldierId);
  }
  return true;
}

export function commitFormationState(state: FormationState): FormationState {
  if (!validateFormationState(state)) throw new Error("Cannot commit an invalid 30-soldier formation");
  committedFormation = cloneFormationState(state);
  return cloneFormationState(committedFormation);
}

export function getCommittedFormationState(): FormationState | null {
  return committedFormation ? cloneFormationState(committedFormation) : null;
}

export function clearCommittedFormationState(): void {
  committedFormation = null;
}

export function saveFormationSlot(slotIndex: number, state: FormationState): FormationState {
  if (slotIndex < 0 || slotIndex >= savedFormationSlots.length)
    throw new Error(`Invalid formation slot: ${slotIndex}`);
  if (!validateFormationState(state)) throw new Error("Cannot save an invalid 30-soldier formation");
  savedFormationSlots[slotIndex] = cloneFormationState(state);
  return cloneFormationState(state);
}

export function loadFormationSlot(
  slotIndex: number,
  roster: readonly FormationRosterSoldier[],
): FormationState | null {
  if (slotIndex < 0 || slotIndex >= savedFormationSlots.length)
    throw new Error(`Invalid formation slot: ${slotIndex}`);
  const saved = savedFormationSlots[slotIndex];
  return saved ? reconcileFormationState(roster, saved) : null;
}

export function clearFormationSlots(): void {
  savedFormationSlots.fill(null);
}

export function resolveCommittedFormationForRoster(
  roster: readonly FormationRosterSoldier[],
): FormationState | null {
  if (!committedFormation) return null;
  const resolved = reconcileFormationState(roster, committedFormation);
  committedFormation = cloneFormationState(resolved);
  return cloneFormationState(resolved);
}
