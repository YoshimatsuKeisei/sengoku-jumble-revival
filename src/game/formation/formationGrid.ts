import formationRulesJson from "../../../assets/formation_ui/config/formation_rules.json";

interface FormationRules {
  grid: {
    cell_size_world: number;
    gx_min: number;
    gx_max: number;
    gy_min: number;
    gy_max: number;
    columns: number;
    rows: number;
  };
  fixed_blockers_confirmed: Array<{
    source_instance: string;
    cells: Array<{ gx: number; gy_from: number; gy_to: number }>;
  }>;
}

export interface FormationGridCell {
  gridX: number;
  gridY: number;
}

export type FormationOccupancy =
  | { type: "soldier"; soldierId: string }
  | { type: "fixed-obstacle"; obstacleId: string }
  | null;

const rules = formationRulesJson as unknown as FormationRules;
export const FORMATION_GRID = { ...rules.grid } as const;

export function formationCellKey(gridX: number, gridY: number): string {
  return `${gridX}:${gridY}`;
}

export function isFormationGridCellInside(gridX: number, gridY: number): boolean {
  return gridX >= FORMATION_GRID.gx_min && gridX <= FORMATION_GRID.gx_max
    && gridY >= FORMATION_GRID.gy_min && gridY <= FORMATION_GRID.gy_max;
}

export function formationGridToWorld(gridX: number, gridY: number): { x: number; y: number } {
  return { x: gridX * FORMATION_GRID.cell_size_world, y: gridY * FORMATION_GRID.cell_size_world };
}

export function formationWorldToGrid(worldX: number, worldY: number): FormationGridCell {
  return {
    gridX: Math.round(worldX / FORMATION_GRID.cell_size_world),
    gridY: Math.round(worldY / FORMATION_GRID.cell_size_world),
  };
}

export function getFormationFixedObstacleCells(): ReadonlyMap<string, string> {
  const occupied = new Map<string, string>();
  for (const blocker of rules.fixed_blockers_confirmed) {
    for (const range of blocker.cells) {
      for (let gridY = range.gy_from; gridY <= range.gy_to; gridY += 1) {
        occupied.set(formationCellKey(range.gx, gridY), blocker.source_instance);
      }
    }
  }
  return occupied;
}

export function buildFormationOccupancy(
  soldiers: ReadonlyArray<{ soldierId: string; gridX: number; gridY: number }>,
  fixedCells = getFormationFixedObstacleCells(),
): Map<string, Exclude<FormationOccupancy, null>> {
  const occupancy = new Map<string, Exclude<FormationOccupancy, null>>();
  for (const [key, obstacleId] of fixedCells) occupancy.set(key, { type: "fixed-obstacle", obstacleId });
  for (const soldier of soldiers) {
    occupancy.set(formationCellKey(soldier.gridX, soldier.gridY), { type: "soldier", soldierId: soldier.soldierId });
  }
  return occupancy;
}

export function getFormationOccupancyAt(
  occupancy: ReadonlyMap<string, Exclude<FormationOccupancy, null>>,
  gridX: number,
  gridY: number,
): FormationOccupancy {
  return occupancy.get(formationCellKey(gridX, gridY)) ?? null;
}

export function canDropFormationSoldier(
  soldiers: ReadonlyArray<{ soldierId: string; gridX: number; gridY: number }>,
  soldierId: string,
  gridX: number,
  gridY: number,
  fixedCells = getFormationFixedObstacleCells(),
): boolean {
  if (!isFormationGridCellInside(gridX, gridY)) return false;
  const occupant = getFormationOccupancyAt(buildFormationOccupancy(soldiers, fixedCells), gridX, gridY);
  return !occupant || (occupant.type === "soldier" && occupant.soldierId === soldierId);
}

export function legalFormationCells(fixedCells = getFormationFixedObstacleCells()): FormationGridCell[] {
  const cells: FormationGridCell[] = [];
  for (let gridY = FORMATION_GRID.gy_min; gridY <= FORMATION_GRID.gy_max; gridY += 1) {
    for (let gridX = FORMATION_GRID.gx_min; gridX <= FORMATION_GRID.gx_max; gridX += 1) {
      if (!fixedCells.has(formationCellKey(gridX, gridY))) cells.push({ gridX, gridY });
    }
  }
  return cells;
}

export function nearestFreeFormationCell(
  origin: FormationGridCell,
  occupied: ReadonlySet<string>,
  fixedCells = getFormationFixedObstacleCells(),
): FormationGridCell | null {
  return legalFormationCells(fixedCells)
    .filter((cell) => !occupied.has(formationCellKey(cell.gridX, cell.gridY)))
    .sort((a, b) => {
      const distanceA = (a.gridX - origin.gridX) ** 2 + (a.gridY - origin.gridY) ** 2;
      const distanceB = (b.gridX - origin.gridX) ** 2 + (b.gridY - origin.gridY) ** 2;
      return distanceA - distanceB || a.gridY - b.gridY || a.gridX - b.gridX;
    })[0] ?? null;
}
