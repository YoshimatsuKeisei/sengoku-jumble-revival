import { STRATEGIST_CONFIG } from "../config";
import type { SoldierBaseStats } from "../types";
import { randomIntInclusive, type RandomSource } from "./soldierStats";

export function createStrategistStats(random: RandomSource = Math.random): SoldierBaseStats {
  return {
    maxHp: randomIntInclusive(STRATEGIST_CONFIG.minMaxHp, STRATEGIST_CONFIG.maxMaxHp, random),
    skill: randomIntInclusive(STRATEGIST_CONFIG.minSkill, STRATEGIST_CONFIG.maxSkill, random),
    foot: randomIntInclusive(STRATEGIST_CONFIG.minFoot, STRATEGIST_CONFIG.maxFoot, random),
    combat: randomIntInclusive(STRATEGIST_CONFIG.minCombat, STRATEGIST_CONFIG.maxCombat, random),
    defense: randomIntInclusive(STRATEGIST_CONFIG.minDefense, STRATEGIST_CONFIG.maxDefense, random),
  };
}
