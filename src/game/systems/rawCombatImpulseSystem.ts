import {
  BATTLEFIELD_BITMAP_TO_WORLD,
  battlefieldSourceDistanceToWorldX,
  battlefieldSourceDistanceToWorldY,
  battlefieldWorldPointToSource,
} from "../battlefieldLayout";
import type { BattleObstacle, Soldier } from "../types";
import { applyForcedMovement } from "./movementSystem";
import { swfLogicTicksToMs } from "./techniqueCombatProfiles";

export const SWF_RAW_IMPULSE_TICKS = 10;
export const SWF_RAW_IMPULSE_DECAY = 0.7;

// Direct _root.fx/_root.fy arrays. Index 0 is the unused sentinel; fi is 1..8.
export const SWF_DIRECTION_FX = [0, -1, -0.6, 0, 0.6, 1, 0.6, 0, -0.6] as const;
export const SWF_DIRECTION_FY = [0, 0, -0.6, -1, -0.6, 0, 0.6, 1, 0.6] as const;

interface RawImpulseRuntime {
  startedAt: number;
  sourceDx: number;
  sourceDy: number;
  appliedTicks: number;
  maxTicks: number;
}

const rawImpulses = new WeakMap<Soldier, RawImpulseRuntime>();

function wrapRawFi(fi: number): number {
  let value = fi;
  while (value > 8) value -= 8;
  while (value < 1) value += 8;
  return value;
}

export function getRawFiFromWorldVector(dx: number, dy: number): number {
  const sourceDx = dx / BATTLEFIELD_BITMAP_TO_WORLD.scaleX;
  const sourceDy = dy / BATTLEFIELD_BITMAP_TO_WORLD.scaleY;
  return wrapRawFi(Math.round(Math.atan2(sourceDy, sourceDx) / 0.75) + 5);
}

export function getRawFiToward(source: Soldier, target: Soldier): number {
  const from = battlefieldWorldPointToSource(source);
  const to = battlefieldWorldPointToSource(target);
  return wrapRawFi(Math.round(Math.atan2(to.y - from.y, to.x - from.x) / 0.75) + 5);
}

export function getRawOppositeFi(fi: number): number {
  return wrapRawFi(fi + 4);
}

export function startRawCombatVectorImpulse(
  soldier: Soldier,
  sourceDx: number,
  sourceDy: number,
  currentTime: number,
  maxTicks = SWF_RAW_IMPULSE_TICKS,
): void {
  rawImpulses.set(soldier, {
    startedAt: currentTime,
    sourceDx,
    sourceDy,
    appliedTicks: 0,
    maxTicks: Math.max(0, Math.floor(maxTicks)),
  });
}

export function startRawCombatImpulse(
  soldier: Soldier,
  fi: number,
  initialUnits: number,
  currentTime: number,
  maxTicks = SWF_RAW_IMPULSE_TICKS,
): void {
  startRawCombatVectorImpulse(
    soldier,
    SWF_DIRECTION_FX[wrapRawFi(fi)] * initialUnits,
    SWF_DIRECTION_FY[wrapRawFi(fi)] * initialUnits,
    currentTime,
    maxTicks,
  );
}

/**
 * atck() resets the attacker's k to 10 but does not restore fx/fy. Preserve the
 * already-decayed vector and only extend how many future d() k-updates it may run.
 * Completed runtimes intentionally remain in the WeakMap so a hit on the final
 * scheduled helper pulse can extend the same decayed vector after its original k
 * would otherwise have reached zero.
 */
export function extendRawCombatImpulse(
  soldier: Soldier,
  currentTime: number,
  additionalTicks = SWF_RAW_IMPULSE_TICKS,
): void {
  const runtime = rawImpulses.get(soldier);
  if (!runtime) return;
  const elapsed = Math.max(0, Math.floor((currentTime - runtime.startedAt) / swfLogicTicksToMs(1) + 1e-9));
  const anchor = Math.max(runtime.appliedTicks, elapsed);
  runtime.maxTicks = Math.max(runtime.maxTicks, anchor + Math.max(0, Math.floor(additionalTicks)));
}

export function updateRawCombatImpulses(
  soldiers: readonly Soldier[],
  obstacles: readonly BattleObstacle[],
  currentTime: number,
): void {
  const tickMs = swfLogicTicksToMs(1);
  for (const soldier of soldiers) {
    const runtime = rawImpulses.get(soldier);
    if (!runtime) continue;
    const elapsedTicks = Math.min(
      runtime.maxTicks,
      Math.max(0, Math.floor((currentTime - runtime.startedAt) / tickMs + 1e-9)),
    );
    while (runtime.appliedTicks < elapsedTicks) {
      const decay = SWF_RAW_IMPULSE_DECAY ** runtime.appliedTicks;
      const worldDx = battlefieldSourceDistanceToWorldX(runtime.sourceDx * decay);
      const worldDy = battlefieldSourceDistanceToWorldY(runtime.sourceDy * decay);
      const distance = Math.hypot(worldDx, worldDy);
      if (distance > 0) applyForcedMovement(soldier, worldDx, worldDy, distance, obstacles);
      runtime.appliedTicks += 1;
    }
  }
}
