import {
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
  fi: number;
  initialUnits: number;
  appliedTicks: number;
}

const rawImpulses = new WeakMap<Soldier, RawImpulseRuntime>();

export function getRawFiToward(source: Soldier, target: Soldier): number {
  const from = battlefieldWorldPointToSource(source);
  const to = battlefieldWorldPointToSource(target);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  let fi = Math.round(angle / 0.75) + 5;
  if (fi > 8) fi -= 8;
  if (fi < 1) fi += 8;
  return fi;
}

export function getRawOppositeFi(fi: number): number {
  const value = fi + 4;
  return value > 8 ? value - 8 : value;
}

export function startRawCombatImpulse(
  soldier: Soldier,
  fi: number,
  initialUnits: number,
  currentTime: number,
): void {
  rawImpulses.set(soldier, { startedAt: currentTime, fi, initialUnits, appliedTicks: 0 });
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
      SWF_RAW_IMPULSE_TICKS,
      Math.max(0, Math.floor((currentTime - runtime.startedAt) / tickMs + 1e-9)),
    );
    while (runtime.appliedTicks < elapsedTicks) {
      const decay = SWF_RAW_IMPULSE_DECAY ** runtime.appliedTicks;
      const sourceDx = SWF_DIRECTION_FX[runtime.fi] * runtime.initialUnits * decay;
      const sourceDy = SWF_DIRECTION_FY[runtime.fi] * runtime.initialUnits * decay;
      const worldDx = battlefieldSourceDistanceToWorldX(sourceDx);
      const worldDy = battlefieldSourceDistanceToWorldY(sourceDy);
      const distance = Math.hypot(worldDx, worldDy);
      if (distance > 0) applyForcedMovement(soldier, worldDx, worldDy, distance, obstacles);
      runtime.appliedTicks += 1;
    }
    if (runtime.appliedTicks >= SWF_RAW_IMPULSE_TICKS) rawImpulses.delete(soldier);
  }
}
