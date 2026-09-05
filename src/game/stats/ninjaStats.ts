import { NINJA_CONFIG } from "../config";
import type { SoldierBaseStats } from "../types";
import { randomIntInclusive, type RandomSource } from "./soldierStats";

export function createNinjaStats(random: RandomSource = Math.random): SoldierBaseStats {
  return {
    maxHp: randomIntInclusive(NINJA_CONFIG.minMaxHp, NINJA_CONFIG.maxMaxHp, random),
    skill: randomIntInclusive(NINJA_CONFIG.minSkill, NINJA_CONFIG.maxSkill, random),
    foot: randomIntInclusive(NINJA_CONFIG.minFoot, NINJA_CONFIG.maxFoot, random),
    combat: randomIntInclusive(NINJA_CONFIG.minCombat, NINJA_CONFIG.maxCombat, random),
    defense: randomIntInclusive(NINJA_CONFIG.minDefense, NINJA_CONFIG.maxDefense, random),
  };
}
