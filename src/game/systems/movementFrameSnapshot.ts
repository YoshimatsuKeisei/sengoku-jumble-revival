import type { Soldier } from "../types";

export interface MovementFramePosition {
  x: number;
  y: number;
}

interface MovementFrameSnapshot {
  soldiers: readonly Soldier[];
  positions: ReadonlyMap<string, MovementFramePosition>;
}

let latestSnapshot: MovementFrameSnapshot | null = null;

export function rememberMovementFrameStart(
  soldiers: readonly Soldier[],
  positions: ReadonlyMap<string, MovementFramePosition>,
): void {
  latestSnapshot = { soldiers: [...soldiers], positions };
}

export function consumeMovementFrameStart(
  soldiers: readonly Soldier[],
): ReadonlyMap<string, MovementFramePosition> | null {
  const snapshot = latestSnapshot;
  latestSnapshot = null;
  if (!snapshot || snapshot.soldiers.length !== soldiers.length) return null;
  for (let index = 0; index < soldiers.length; index += 1) {
    if (snapshot.soldiers[index] !== soldiers[index]) return null;
  }
  return snapshot.positions;
}
