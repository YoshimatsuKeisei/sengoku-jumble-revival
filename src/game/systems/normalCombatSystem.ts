import type { RandomSource } from "../stats/soldierStats";
import type { Soldier } from "../types";
import { distanceBetween } from "./aiSystem";
import { startSoldierAttack } from "./attackSystem";
import { isValidCombatTarget } from "./combatTargetSystem";

export function getCombatWinProbability(combatA: number, combatB: number): number {
  const weightA = Math.max(0, combatA);
  const weightB = Math.max(0, combatB);
  return weightA + weightB === 0 ? 0.5 : weightA / (weightA + weightB);
}

export function resolveCombatContest(a: Soldier, b: Soldier, random: RandomSource = Math.random): Soldier {
  return random() < getCombatWinProbability(a.stats.combat, b.stats.combat) ? a : b;
}

function isContactPair(a: Soldier, b: Soldier): boolean {
  if (!isValidCombatTarget(a, b) || !isValidCombatTarget(b, a)) return false;
  if (a.targetId !== b.id && b.targetId !== a.id && !a.isConfused && !b.isConfused) return false;
  return distanceBetween(a, b) <= Math.max(a.attackRange, b.attackRange);
}

/** Resolves every unordered contact pair at most once in this update. */
export function updateNormalCombatContests(
  soldiers: Soldier[],
  currentTime: number,
  random: RandomSource = Math.random,
): void {
  for (let firstIndex = 0; firstIndex < soldiers.length; firstIndex += 1) {
    const first = soldiers[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < soldiers.length; secondIndex += 1) {
      const second = soldiers[secondIndex];
      if (!isContactPair(first, second)) continue;
      const winner = resolveCombatContest(first, second, random);
      const loser = winner === first ? second : first;
      startSoldierAttack(winner, loser, currentTime);
    }
  }
}
