import { BASE_CONFIG, BATTLEFIELD_CONFIG, RECOVERY_CONFIG, SOLDIER_RADIUS } from "../config";
import {
  BATTLEFIELD_BASE_GATE_WORLD_RECTS,
  BATTLEFIELD_BASE_HEALING_SAFE_WORLD_RECTS,
  BATTLEFIELD_BASE_WORLD_RECTS,
} from "../battlefieldLayout";
import type { BaseGate, BattleBase, Soldier, Team } from "../types";

export interface Rect { x: number; y: number; width: number; height: number }

export function getTeamForwardSign(team: Team): 1 | -1 {
  return team === "player" ? 1 : -1;
}

export function getBaseCenter(team: Team): { x: number; y: number } {
  const rect = BATTLEFIELD_BASE_WORLD_RECTS[team];
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

export function getBaseRect(base: Pick<BattleBase, "x" | "y" | "width" | "height">): Rect {
  return { x: base.x - base.width / 2, y: base.y - base.height / 2, width: base.width, height: base.height };
}

export function getBaseDamageCoreRect(base: Pick<BattleBase, "x" | "y" | "width" | "height" | "team">): Rect {
  const height = base.height * BASE_CONFIG.damageCoreHeightRatio;
  const sign = getTeamForwardSign(base.team);
  const frontX = base.x + sign * base.width / 2;
  return {
    x: sign === 1 ? frontX - BASE_CONFIG.frontSegmentDepth : frontX,
    y: base.y - height / 2,
    width: BASE_CONFIG.frontSegmentDepth,
    height,
  };
}

function getBaseGateRect(base: BattleBase, gate: BaseGate): Rect {
  return { ...BATTLEFIELD_BASE_GATE_WORLD_RECTS[base.team][gate] };
}

export function getBaseUpperGateRect(base: BattleBase): Rect { return getBaseGateRect(base, "TOP"); }
export function getBaseLowerGateRect(base: BattleBase): Rect { return getBaseGateRect(base, "BOTTOM"); }

export function getBaseHealingInteriorRect(base: BattleBase): Rect {
  const rect = BATTLEFIELD_BASE_HEALING_SAFE_WORLD_RECTS[base.team];
  return { ...rect };
}

export function getPreferredBaseGate(soldier: Pick<Soldier, "id" | "y">, base: BattleBase): BaseGate {
  const upper = getBaseUpperGateRect(base);
  const lower = getBaseLowerGateRect(base);
  const upperY = upper.y + upper.height / 2;
  const lowerY = lower.y + lower.height / 2;
  const upperDistance = Math.abs(soldier.y - upperY);
  const lowerDistance = Math.abs(soldier.y - lowerY);
  if (upperDistance !== lowerDistance) return upperDistance < lowerDistance ? "TOP" : "BOTTOM";
  return [...soldier.id].reduce((hash, character) => hash + character.charCodeAt(0), 0) % 2 === 0 ? "TOP" : "BOTTOM";
}

export function getBaseGatePoint(base: BattleBase, gate: BaseGate, inside: boolean): { x: number; y: number } {
  const rect = getBaseGateRect(base, gate);
  const inwardSign = gate === "TOP" ? 1 : -1;
  const boundaryY = gate === "TOP" ? rect.y : rect.y + rect.height;
  return {
    x: rect.x + rect.width / 2,
    y: boundaryY + inwardSign * (inside ? rect.height + BASE_CONFIG.healingInteriorInset : -BASE_CONFIG.rejoinOffset),
  };
}

export function isPointWithinBaseGateSpan(
  point: { x: number; y: number },
  base: BattleBase,
  gate: BaseGate,
  radius = SOLDIER_RADIUS,
): boolean {
  const rect = getBaseGateRect(base, gate);
  return point.x >= rect.x + radius && point.x <= rect.x + rect.width - radius;
}

export function hasClearedBaseGateBoundary(
  point: { x: number; y: number },
  base: BattleBase,
  gate: BaseGate,
  direction: "ENTER" | "EXIT",
  radius = SOLDIER_RADIUS,
): boolean {
  if (!isPointWithinBaseGateSpan(point, base, gate, radius)) return false;
  const rect = getBaseGateRect(base, gate);
  if (direction === "ENTER") {
    return gate === "TOP" ? point.y >= rect.y + rect.height + radius : point.y <= rect.y - radius;
  }
  return gate === "TOP" ? point.y <= rect.y - radius : point.y >= rect.y + rect.height + radius;
}

export function hasReachedBaseGateApproach(
  point: { x: number; y: number },
  base: BattleBase,
  gate: BaseGate,
): boolean {
  const exterior = getBaseGatePoint(base, gate, false);
  const inwardSign = gate === "TOP" ? 1 : -1;
  return (point.y - exterior.y) * inwardSign >= -RECOVERY_CONFIG.arrivalTolerance
    && Math.abs(point.x - exterior.x) <= RECOVERY_CONFIG.arrivalTolerance;
}

export function getPreferredRejoinPoint(soldier: Pick<Soldier, "id" | "y" | "recoveryGate">, base: BattleBase): { x: number; y: number } {
  return getBaseGatePoint(base, soldier.recoveryGate ?? getPreferredBaseGate(soldier, base), false);
}

export function isPointInsideRect(point: { x: number; y: number }, rect: Rect): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width
    && point.y >= rect.y && point.y <= rect.y + rect.height;
}

export function distanceToRect(point: { x: number; y: number }, rect: Rect): number {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height));
  return Math.hypot(dx, dy);
}

export function isInsideFriendlyBaseHealingArea(soldier: Soldier, base: BattleBase): boolean {
  return soldier.team === base.team && isPointInsideRect(soldier, getBaseHealingInteriorRect(base));
}

export function getBaseFrontExitPoint(base: BattleBase, y = base.y): { x: number; y: number } {
  return {
    x: base.x + getTeamForwardSign(base.team) * (base.width / 2 + BASE_CONFIG.rejoinOffset),
    y: Math.max(base.y - base.height / 2, Math.min(base.y + base.height / 2, y)),
  };
}
