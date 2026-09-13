import type { Soldier } from "../types";

export interface SwfSelectedContactBranchOutcome {
  attackerId: string;
  defenderId: string;
}

const startedByRoster = new WeakMap<readonly Soldier[], Map<string, SwfSelectedContactBranchOutcome>>();

function pairKey(first: Soldier, second: Soldier): string {
  return first.id < second.id
    ? `${first.id}\u0000${second.id}`
    : `${second.id}\u0000${first.id}`;
}

export function markSwfSelectedContactBranchStarted(
  soldiers: readonly Soldier[],
  first: Soldier,
  second: Soldier,
  attacker: Soldier,
  defender: Soldier,
): void {
  const started = startedByRoster.get(soldiers) ?? new Map<string, SwfSelectedContactBranchOutcome>();
  started.set(pairKey(first, second), { attackerId: attacker.id, defenderId: defender.id });
  startedByRoster.set(soldiers, started);
}

export function getSwfSelectedContactBranchOutcome(
  soldiers: readonly Soldier[],
  first: Soldier,
  second: Soldier,
): SwfSelectedContactBranchOutcome | null {
  return startedByRoster.get(soldiers)?.get(pairKey(first, second)) ?? null;
}

export function consumeSwfSelectedContactBranchOutcome(
  soldiers: readonly Soldier[],
  first: Soldier,
  second: Soldier,
): SwfSelectedContactBranchOutcome | null {
  const started = startedByRoster.get(soldiers);
  if (!started) return null;
  const key = pairKey(first, second);
  const outcome = started.get(key) ?? null;
  started.delete(key);
  if (started.size === 0) startedByRoster.delete(soldiers);
  return outcome;
}
