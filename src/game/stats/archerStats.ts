import { ARCHER_CONFIG } from "../config";
import type { SoldierBaseStats } from "../types";
import { randomIntInclusive, type RandomSource } from "./soldierStats";

export function createArcherStats(random: RandomSource = Math.random): SoldierBaseStats {
  return {
    maxHp: randomIntInclusive(ARCHER_CONFIG.minMaxHp, ARCHER_CONFIG.maxMaxHp, random),
    skill: randomIntInclusive(ARCHER_CONFIG.minSkill, ARCHER_CONFIG.maxSkill, random),
    combat: randomIntInclusive(ARCHER_CONFIG.minCombat, ARCHER_CONFIG.maxCombat, random),
    defense: randomIntInclusive(ARCHER_CONFIG.minDefense, ARCHER_CONFIG.maxDefense, random),
    foot: randomIntInclusive(ARCHER_CONFIG.minFoot, ARCHER_CONFIG.maxFoot, random),
  };
}
