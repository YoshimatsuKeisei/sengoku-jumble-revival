import { GENERAL_CONFIG } from "../config";
import type { SoldierBaseStats } from "../types";
import { randomIntInclusive, type RandomSource } from "./soldierStats";

export function createGeneralStats(random: RandomSource = Math.random): SoldierBaseStats {
  return {
    maxHp: randomIntInclusive(GENERAL_CONFIG.minMaxHp, GENERAL_CONFIG.maxMaxHp, random),
    skill: randomIntInclusive(GENERAL_CONFIG.minSkill, GENERAL_CONFIG.maxSkill, random),
    foot: randomIntInclusive(GENERAL_CONFIG.minFoot, GENERAL_CONFIG.maxFoot, random),
    combat: randomIntInclusive(GENERAL_CONFIG.minCombat, GENERAL_CONFIG.maxCombat, random),
    defense: randomIntInclusive(GENERAL_CONFIG.minDefense, GENERAL_CONFIG.maxDefense, random),
  };
}
