import {
  battlefieldSourceDistanceToWorldX,
  battlefieldSourceDistanceToWorldY,
} from "../battlefieldLayout";
import type { Soldier, UnitTechnique } from "../types";

export const SWF_COMBAT_FPS = 24;
export const SWF_GRID_CELL_SIZE = 36;
export const COMBAT_GAUGE_UPDATE_TICKS = 23;
export const RANGED_GAUGE_THRESHOLD = 200;
export const SPECIAL_GAUGE_THRESHOLD = 400;
export const SWF_NORMAL_CONTACT_UNITS = 32;
export const SWF_APPROACH_SPACING_UNITS = 24;
export const SWF_NORMAL_KNOCKBACK_UNITS = 10;
export const SWF_IRON_WALL_KNOCKBACK_UNITS = 5;
export const SWF_RANGED_HOLD_MARGIN_UNITS = 10;

export type TechniqueAreaShape =
  | "CONTACT"
  | "FORWARD_RECTANGLE"
  | "CENTER_RECTANGLE"
  | "SUPPORT_RECTANGLE"
  | "PROJECTILE_SINGLE"
  | "PROJECTILE_IMPACT_RECTANGLE";

export interface TechniqueCombatProfile {
  role: "normal" | "projectile" | "melee" | "support" | "control";
  rangeCells: number | null;
  areaShape: TechniqueAreaShape;
  areaWidthCells: number;
  areaHeightCells: number;
  forwardOffsetCells: number;
  waveCount: number;
  actionLockTicks: number;
  selfAdvanceSwfUnits: number;
  edgeSelfAdvanceSwfUnits?: number;
}

const profile = (
  role: TechniqueCombatProfile["role"],
  rangeCells: number | null,
  areaShape: TechniqueAreaShape,
  areaWidthCells: number,
  areaHeightCells: number,
  forwardOffsetCells: number,
  waveCount: number,
  actionLockTicks: number,
  selfAdvanceSwfUnits: number,
  edgeSelfAdvanceSwfUnits?: number,
): TechniqueCombatProfile => ({ role, rangeCells, areaShape, areaWidthCells, areaHeightCells, forwardOffsetCells,
  waveCount, actionLockTicks, selfAdvanceSwfUnits, edgeSelfAdvanceSwfUnits });

export const TECHNIQUE_COMBAT_PROFILES: Record<UnitTechnique, TechniqueCombatProfile> = {
  PROTOTYPE_AREA: profile("melee", null, "CENTER_RECTANGLE", 3, 3, 0, 1, 16, 0),
  TEPPOU_SHOOTING: profile("projectile", 7, "PROJECTILE_SINGLE", 1, 1, 0, 1, 1, 0),
  TEPPOU_SNIPING: profile("projectile", 11, "PROJECTILE_SINGLE", 1, 1, 0, 1, 1, 0),
  TEPPOU_BOMBARDMENT: profile("projectile", 9, "PROJECTILE_IMPACT_RECTANGLE", 3, 3, 0, 1, 1, 0),
  ARCHER_ARROW: profile("projectile", 3, "PROJECTILE_SINGLE", 1, 1, 0, 1, 1, 0),
  ARCHER_LONG_SHOT: profile("projectile", 5, "PROJECTILE_SINGLE", 1, 1, 0, 1, 1, 0),
  ARCHER_FIRE_ARROW: profile("projectile", 3, "PROJECTILE_SINGLE", 1, 1, 0, 1, 1, 0),
  ARCHER_HOROKU: profile("projectile", 3, "PROJECTILE_IMPACT_RECTANGLE", 3, 3, 0, 1, 1, 0),
  ASHIGARU_SPEAR_STRIKE: profile("melee", null, "FORWARD_RECTANGLE", 1, 1, 1, 10, 10, 14),
  ASHIGARU_SPEAR_TECHNIQUE: profile("melee", null, "CENTER_RECTANGLE", 3, 3, 0, 10, 16, 20),
  MOSA_SENPUU: profile("melee", null, "CENTER_RECTANGLE", 3, 3, 0, 10, 16, 12),
  MOSA_MUSOU: profile("melee", null, "CENTER_RECTANGLE", 3, 3, 0, 10, 16, 20),
  MOSA_KIJIN: profile("melee", null, "CENTER_RECTANGLE", 5, 5, 0, 10, 16, 20),
  CAVALRY_CHARGE: profile("melee", null, "CENTER_RECTANGLE", 5, 5, 0, 10, 16, 40, 10),
  GENERAL_COMMAND: profile("support", null, "SUPPORT_RECTANGLE", 11, 11, 0, 1, 16, 0),
  GENERAL_HEROIC: profile("melee", null, "CENTER_RECTANGLE", 3, 3, 0, 10, 16, 20),
  GENERAL_HEAL: profile("support", null, "SUPPORT_RECTANGLE", 11, 11, 0, 1, 16, 0),
  NINJA_NINJUTSU: profile("melee", null, "CENTER_RECTANGLE", 3, 3, 0, 16, 16, 10),
  NINJA_SHADOW_RUN: profile("melee", null, "CENTER_RECTANGLE", 3, 3, 0, 16, 16, 40, 10),
  NINJA_GENJUTSU: profile("control", null, "CENTER_RECTANGLE", 3, 3, 0, 16, 16, 10),
  NINJA_BARRIER: profile("support", null, "CENTER_RECTANGLE", 3, 3, 0, 16, 16, 0),
  STRATEGIST_FIRE_PLAY: profile("melee", null, "FORWARD_RECTANGLE", 1, 1, 1, 3, 28, 0),
  STRATEGIST_FIRE_ATTACK: profile("melee", null, "FORWARD_RECTANGLE", 3, 3, 2, 3, 28, 0),
  STRATEGIST_FIRE_PLAN: profile("melee", null, "FORWARD_RECTANGLE", 5, 5, 3, 3, 28, 0),
  STRATEGIST_HELLFIRE: profile("melee", null, "FORWARD_RECTANGLE", 7, 7, 4, 3, 28, 0),
  STRATEGIST_FLAME_ART: profile("melee", null, "FORWARD_RECTANGLE", 9, 9, 5, 3, 28, 0),
  STRATEGIST_FALSE_REPORT: profile("control", null, "CENTER_RECTANGLE", 5, 5, 0, 1, 28, 0),
  STRATEGIST_SORCERY: profile("control", null, "CENTER_RECTANGLE", 5, 5, 0, 1, 28, 0),
  STRATEGIST_HEAL: profile("support", null, "SUPPORT_RECTANGLE", 11, 11, 0, 1, 16, 0),
};

export function swfLogicTicksToMs(ticks: number): number { return ticks * 1000 / SWF_COMBAT_FPS; }
export function swfUnitsToWorldX(units: number): number { return battlefieldSourceDistanceToWorldX(units); }
export function swfUnitsToWorldY(units: number): number { return battlefieldSourceDistanceToWorldY(units); }
export function swfCellsToWorldX(cells: number): number { return swfUnitsToWorldX(cells * SWF_GRID_CELL_SIZE); }
export function swfCellsToWorldY(cells: number): number { return swfUnitsToWorldY(cells * SWF_GRID_CELL_SIZE); }
export function getTechniqueProfile(technique: UnitTechnique): TechniqueCombatProfile { return TECHNIQUE_COMBAT_PROFILES[technique]; }
export function getTechniqueRangeWorld(technique: UnitTechnique): number | null {
  const cells = getTechniqueProfile(technique).rangeCells;
  return cells === null ? null : swfCellsToWorldX(cells);
}
export function getTechniqueAreaWorld(technique: UnitTechnique): { width: number; height: number } {
  const value = getTechniqueProfile(technique);
  return { width: swfCellsToWorldX(value.areaWidthCells), height: swfCellsToWorldY(value.areaHeightCells) };
}
export function getNormalContactBounds(): { x: number; y: number } {
  return { x: swfUnitsToWorldX(SWF_NORMAL_CONTACT_UNITS), y: swfUnitsToWorldY(SWF_NORMAL_CONTACT_UNITS) };
}
export function isWithinNormalContact(a: Pick<Soldier, "x" | "y">, b: Pick<Soldier, "x" | "y">): boolean {
  const bounds = getNormalContactBounds();
  return Math.abs(a.x - b.x) < bounds.x && Math.abs(a.y - b.y) < bounds.y;
}
export function getApproachSpacingWorld(): number { return swfUnitsToWorldX(SWF_APPROACH_SPACING_UNITS); }
export function getRangedHoldMarginWorld(): number { return swfUnitsToWorldX(SWF_RANGED_HOLD_MARGIN_UNITS); }
export function getArrivalToleranceWorld(foot: number): number { return swfUnitsToWorldX(Math.max(0, foot) * 3 + 2); }

export function isPointInTechniqueRectangle(
  technique: UnitTechnique,
  center: { x: number; y: number },
  point: { x: number; y: number },
): boolean {
  const area = getTechniqueAreaWorld(technique);
  return Math.abs(point.x - center.x) <= area.width / 2 && Math.abs(point.y - center.y) <= area.height / 2;
}

export function getTechniqueAreaCenter(
  technique: UnitTechnique,
  origin: Pick<Soldier, "x" | "y" | "facingX" | "facingY" | "team">,
): { x: number; y: number } {
  const profile = getTechniqueProfile(technique);
  const length = Math.hypot(origin.facingX, origin.facingY);
  const facingX = length > 0 ? origin.facingX / length : origin.team === "player" ? 1 : -1;
  const facingY = length > 0 ? origin.facingY / length : 0;
  const offsetX = swfCellsToWorldX(profile.forwardOffsetCells);
  const offsetY = swfCellsToWorldY(profile.forwardOffsetCells);
  return { x: origin.x + facingX * offsetX, y: origin.y + facingY * offsetY };
}

export function isTargetInTechniqueArea(attacker: Soldier, target: Pick<Soldier, "x" | "y">): boolean {
  return isPointInTechniqueRectangle(attacker.technique, getTechniqueAreaCenter(attacker.technique, attacker), target);
}

export function getTechniqueSelfAdvanceWorld(technique: UnitTechnique, edgeLimited = false): number {
  const profile = getTechniqueProfile(technique);
  const units = edgeLimited && profile.edgeSelfAdvanceSwfUnits !== undefined
    ? profile.edgeSelfAdvanceSwfUnits
    : profile.selfAdvanceSwfUnits;
  return swfUnitsToWorldX(units);
}
