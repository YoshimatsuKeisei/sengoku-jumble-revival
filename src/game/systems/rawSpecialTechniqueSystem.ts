import {
  BATTLEFIELD_BITMAP_TO_WORLD,
  battlefieldWorldPointToSource,
} from "../battlefieldLayout";
import { DEFENSE_CONFIG } from "../config";
import type { RandomSource } from "../stats/soldierStats";
import type { Soldier } from "../types";
import { cancelAttack } from "./attackRuntime";
import { applyDamage } from "./combatSystem";
import { isValidCombatTarget } from "./combatTargetSystem";
import { isDamageGuarded } from "./defenseSystem";
import {
  SWF_DIRECTION_FX,
  SWF_DIRECTION_FY,
  extendRawCombatImpulse,
  getRawFiFromWorldVector,
  getRawFiToward,
  startRawCombatImpulse,
  startRawCombatVectorImpulse,
} from "./rawCombatImpulseSystem";
import { startHitReaction } from "./reactionSystem";
import { calculateSuccessfulAttackDamage } from "./specialAbilitySystem";
import { SWF_GRID_CELL_SIZE, swfLogicTicksToMs } from "./techniqueCombatProfiles";

export const SWF_SPECIAL_ATCK_K_TICKS = 10;
export const SWF_SPECIAL_ATCK_IMPULSE_UNITS = 10;

interface RawSpecialScanVector {
  sourceDx: number;
  sourceDy: number;
}

const rawSpecialScanVectors = new WeakMap<Soldier, RawSpecialScanVector>();

function worldDeltaToSource(dx: number, dy: number): RawSpecialScanVector {
  return {
    sourceDx: dx / BATTLEFIELD_BITMAP_TO_WORLD.scaleX,
    sourceDy: dy / BATTLEFIELD_BITMAP_TO_WORLD.scaleY,
  };
}

/**
 * bsl()/nin()/gen() use the ordinary x/y movement vector that existed when the
 * special began, not the special fx/fy impulse. Capture it before fx/fy motion
 * starts so later forced-movement updates cannot overwrite that prediction input.
 */
export function captureRawSpecialScanVector(attacker: Soldier): void {
  rawSpecialScanVectors.set(attacker, worldDeltaToSource(attacker.velocityX, attacker.velocityY));
}

export function startRawSpecialSelfMotion(
  attacker: Soldier,
  currentTime: number,
  initialUnits: number,
  kTicks: number,
): number {
  captureRawSpecialScanVector(attacker);
  const fi = getRawFiFromWorldVector(attacker.facingX, attacker.facingY);
  attacker.abilityActionLockUntil = Math.max(attacker.abilityActionLockUntil, currentTime + swfLogicTicksToMs(kTicks));
  startRawCombatImpulse(attacker, fi, initialUnits, currentTime, kTicks);
  return fi;
}

function rawSpecialCandidate(attacker: Soldier, candidate: Soldier, pLimit: 89 | 95): boolean {
  if (!isValidCombatTarget(attacker, candidate)) return false;
  if (pLimit === 89 && candidate.state !== "NORMAL") return false;
  return true;
}

function sourceCell(soldier: Soldier): { x: number; y: number } {
  const source = battlefieldWorldPointToSource(soldier);
  return {
    x: Math.round(source.x / SWF_GRID_CELL_SIZE),
    y: Math.round(source.y / SWF_GRID_CELL_SIZE),
  };
}

/** bsl-family/nin/gen predicted f[][] scan, preserving x-outer/y-inner cell order. */
export function findRawSpecialGridTargets(
  attacker: Soldier,
  soldiers: readonly Soldier[],
  widthCells: 3 | 5,
  pLimit: 89 | 95 = 95,
): Soldier[] {
  const source = battlefieldWorldPointToSource(attacker);
  const vector = rawSpecialScanVectors.get(attacker)
    ?? worldDeltaToSource(attacker.velocityX, attacker.velocityY);
  const half = Math.floor(widthCells / 2);
  const startX = Math.round((source.x + vector.sourceDx) / SWF_GRID_CELL_SIZE) - half;
  const startY = Math.round((source.y + vector.sourceDy) / SWF_GRID_CELL_SIZE) - half;
  const used = new Set<string>();
  const result: Soldier[] = [];
  for (let xOffset = 0; xOffset < widthCells; xOffset += 1) {
    for (let yOffset = 0; yOffset < widthCells; yOffset += 1) {
      const cellX = startX + xOffset;
      const cellY = startY + yOffset;
      const candidate = soldiers.find((value) => {
        if (used.has(value.id) || !rawSpecialCandidate(attacker, value, pLimit)) return false;
        const cell = sourceCell(value);
        return cell.x === cellX && cell.y === cellY;
      });
      if (candidate) {
        used.add(candidate.id);
        result.push(candidate);
      }
    }
  }
  return result;
}

/** Raw sgk(): one facing-adjacent f[][] cell per helper pulse. */
export function findRawSpearStrikeTargets(attacker: Soldier, soldiers: readonly Soldier[]): Soldier[] {
  const source = battlefieldWorldPointToSource(attacker);
  const fi = getRawFiFromWorldVector(attacker.facingX, attacker.facingY);
  const cellX = Math.round(source.x / SWF_GRID_CELL_SIZE + SWF_DIRECTION_FX[fi]);
  const cellY = Math.round(source.y / SWF_GRID_CELL_SIZE + SWF_DIRECTION_FY[fi]);
  const candidate = soldiers.find((value) => {
    if (!rawSpecialCandidate(attacker, value, 95)) return false;
    const cell = sourceCell(value);
    return cell.x === cellX && cell.y === cellY;
  });
  return candidate ? [candidate] : [];
}

export function isRawEdgeLimitedForwardBurst(attacker: Soldier, fi: number): boolean {
  const source = battlefieldWorldPointToSource(attacker);
  return (source.x < 366 && fi === 1)
    || (source.x > 1466 && fi === 5)
    || source.x < 244
    || source.x > 1590;
}

export function isRawShadowRunEdgeLimited(attacker: Soldier): boolean {
  const source = battlefieldWorldPointToSource(attacker);
  return source.x < 366 || source.x > 1466;
}

export interface RawSpecialAtckResult {
  defended: boolean;
  damage: number;
  fi: number;
}

/**
 * Shared atck(defender, attacker, ss=1) response used by sgk/bsl/nin helpers.
 * sp is cleared before the guard decision, both hit and guard receive k=10 and
 * the normal 10-unit fx/fy response, and each call resets the attacker's k=10.
 */
export function resolveRawSpecialAtck(
  attacker: Soldier,
  target: Soldier,
  currentTime: number,
  random: RandomSource = Math.random,
  cavalry = false,
): RawSpecialAtckResult {
  const defended = isDamageGuarded(target, "SPECIAL_ATTACK", random, attacker);
  let damage = 0;
  if (!defended) {
    const before = target.hp;
    applyDamage(target, calculateSuccessfulAttackDamage(attacker, target), attacker);
    damage = Math.max(0, before - target.hp);
  }
  target.combatFeedbackMarker = defended ? "S" : "H";
  target.combatFeedbackUntil = currentTime + DEFENSE_CONFIG.guardMarkerDurationMs;

  const fi = getRawFiToward(target, attacker);
  target.facingX = SWF_DIRECTION_FX[fi];
  target.facingY = SWF_DIRECTION_FY[fi];
  target.abilityActionLockUntil = Math.max(
    target.abilityActionLockUntil,
    currentTime + swfLogicTicksToMs(SWF_SPECIAL_ATCK_K_TICKS),
  );
  cancelAttack(target);
  if (cavalry) {
    const sourceDx = SWF_DIRECTION_FX[fi] * SWF_SPECIAL_ATCK_IMPULSE_UNITS * 1.5;
    const sourceDy = attacker.y > target.y ? -15 : 15;
    startRawCombatVectorImpulse(target, sourceDx, sourceDy, currentTime, SWF_SPECIAL_ATCK_K_TICKS);
  } else {
    startRawCombatImpulse(target, fi, SWF_SPECIAL_ATCK_IMPULSE_UNITS, currentTime, SWF_SPECIAL_ATCK_K_TICKS);
  }
  // atck() clears defender.sp even when the later defense roll succeeds.
  startHitReaction(target, attacker, currentTime, 0, random, "SPECIAL_ATTACK");

  // Every atck() also writes attacker.k=10 while leaving the attacker's current
  // fx/fy vector untouched. Extend the decaying self impulse instead of restarting it.
  attacker.specialLockUntil = Math.max(attacker.specialLockUntil, currentTime + swfLogicTicksToMs(SWF_SPECIAL_ATCK_K_TICKS));
  attacker.abilityActionLockUntil = Math.max(attacker.abilityActionLockUntil, currentTime + swfLogicTicksToMs(SWF_SPECIAL_ATCK_K_TICKS));
  extendRawCombatImpulse(attacker, currentTime, SWF_SPECIAL_ATCK_K_TICKS);

  return { defended, damage, fi };
}
