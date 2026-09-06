import type { RandomSource } from "../stats/soldierStats";
import type { Soldier } from "../types";
import { startSoldierAttack } from "./attackSystem";
import { isValidCombatTarget } from "./combatTargetSystem";
import { isWithinNormalContact } from "./techniqueCombatProfiles";

export function getCombatWinProbability(combatA: number, combatB: number): number {
  const valueA = Math.max(0, combatA);
  const valueB = Math.max(0, combatB);
  const scale = Math.max(valueA, valueB);
  if (scale === 0) return 0.5;
  // Scaling both sides before cubing preserves the ratio and avoids overflow
  // if an imported/debug value is far outside the normal SWF stat range.
  const weightA = (valueA / scale) ** 3;
  const weightB = (valueB / scale) ** 3;
  return weightA / (weightA + weightB);
}

export function resolveCombatContest(a: Soldier, b: Soldier, random: RandomSource = Math.random): Soldier {
  return random() < getCombatWinProbability(a.stats.combat, b.stats.combat) ? a : b;
}

function isContactPair(a: Soldier, b: Soldier): boolean {
  if (!isValidCombatTarget(a, b) || !isValidCombatTarget(b, a)) return false;
  return isWithinNormalContact(a, b);
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
