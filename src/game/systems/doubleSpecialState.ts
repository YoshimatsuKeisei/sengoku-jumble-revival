import type { Soldier } from "../types";

/**
 * Tracks the one extra activation granted by a successful DOUBLE_SPECIAL proc.
 * Kept outside Soldier until the exact SWF serialization/state representation is known.
 */
const pendingRepeat = new WeakSet<Soldier>();

export function hasPendingDoubleSpecialRepeat(soldier: Soldier): boolean {
  return pendingRepeat.has(soldier);
}

export function grantDoubleSpecialRepeat(soldier: Soldier): void {
  pendingRepeat.add(soldier);
}

export function consumeDoubleSpecialRepeat(soldier: Soldier): boolean {
  if (!pendingRepeat.has(soldier)) return false;
  pendingRepeat.delete(soldier);
  return true;
}
