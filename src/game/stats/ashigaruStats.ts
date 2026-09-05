import { ASHIGARU_CONFIG } from "../config";
import type { SoldierBaseStats } from "../types";
import { randomIntInclusive, type RandomSource } from "./soldierStats";

export function createAshigaruStats(random: RandomSource = Math.random): SoldierBaseStats {
  return {
    maxHp: randomIntInclusive(ASHIGARU_CONFIG.minMaxHp, ASHIGARU_CONFIG.maxMaxHp, random),
    skill: randomIntInclusive(ASHIGARU_CONFIG.minSkill, ASHIGARU_CONFIG.maxSkill, random),
    foot: randomIntInclusive(ASHIGARU_CONFIG.minFoot, ASHIGARU_CONFIG.maxFoot, random),
    combat: randomIntInclusive(ASHIGARU_CONFIG.minCombat, ASHIGARU_CONFIG.maxCombat, random),
    defense: randomIntInclusive(ASHIGARU_CONFIG.minDefense, ASHIGARU_CONFIG.maxDefense, random),
  };
}
