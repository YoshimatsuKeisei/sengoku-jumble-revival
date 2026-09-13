import type { Soldier } from "../types";

const rawNormalContactKResumeAt = new WeakMap<Soldier, number>();

export function startRawNormalContactKLock(
  soldier: Soldier,
  resumeAt: number,
): void {
  rawNormalContactKResumeAt.set(soldier, resumeAt);
  soldier.abilityActionLockUntil = Math.max(soldier.abilityActionLockUntil, resumeAt);
}

export function isRawNormalContactKLocked(
  soldier: Soldier,
  currentTime: number,
): boolean {
  return currentTime < (rawNormalContactKResumeAt.get(soldier) ?? 0);
}
