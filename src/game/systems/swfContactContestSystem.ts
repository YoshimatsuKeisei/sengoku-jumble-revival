import type { RandomSource } from "../stats/soldierStats";
import type { Soldier } from "../types";

export function getSwfContactWinProbability(combatA: number, combatB: number): number {
  const valueA = Math.max(0, combatA);
  const valueB = Math.max(0, combatB);
  const scale = Math.max(valueA, valueB);
  if (scale === 0) return 0.5;
  const weightA = (valueA / scale) ** 3;
  const weightB = (valueB / scale) ** 3;
  return weightA / (weightA + weightB);
}

export function resolveSwfContactContest(
  first: Soldier,
  second: Soldier,
  random: RandomSource = Math.random,
): Soldier {
  return random() < getSwfContactWinProbability(first.stats.combat, second.stats.combat)
    ? first
    : second;
}
