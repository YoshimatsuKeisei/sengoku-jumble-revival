import type { Soldier } from "../types";

export interface MovementFramePosition {
  x: number;
  y: number;
}

export interface MovementFrameSnapshot {
  positions: ReadonlyMap<string, MovementFramePosition>;
  currentTime: number | null;
}

interface StoredMovementFrameSnapshot extends MovementFrameSnapshot {
  soldiers: readonly Soldier[];
}

let latestSnapshot: StoredMovementFrameSnapshot | null = null;

export function rememberMovementFrameStart(
  soldiers: readonly Soldier[],
  positions: ReadonlyMap<string, MovementFramePosition>,
): void {
  latestSnapshot = { soldiers: [...soldiers], positions, currentTime: null };
}

export function rememberMovementFrameTime(
  soldiers: readonly Soldier[],
  currentTime: number,
): void {
  if (!latestSnapshot || latestSnapshot.soldiers.length !== soldiers.length) return;
  for (let index = 0; index < soldiers.length; index += 1) {
    if (latestSnapshot.soldiers[index] !== soldiers[index]) return;
  }
  latestSnapshot.currentTime = currentTime;
}

export function consumeMovementFrameStart(
  soldiers: readonly Soldier[],
): MovementFrameSnapshot | null {
  const snapshot = latestSnapshot;
  latestSnapshot = null;
  if (!snapshot || snapshot.soldiers.length !== soldiers.length) return null;
  for (let index = 0; index < soldiers.length; index += 1) {
    if (snapshot.soldiers[index] !== soldiers[index]) return null;
  }
  return { positions: snapshot.positions, currentTime: snapshot.currentTime };
}
