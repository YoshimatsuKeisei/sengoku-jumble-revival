import type { Soldier } from "../types";
export interface TrackedSmokeRuntime { victimSoldierId: string; x: number; y: number }
export function updateTrackedSmoke(runtime: TrackedSmokeRuntime, soldiers: readonly Soldier[]): TrackedSmokeRuntime {
  const victim = soldiers.find((soldier) => soldier.id === runtime.victimSoldierId);
  return victim && !victim.isDead ? { ...runtime, x: victim.x, y: victim.y } : runtime;
}
