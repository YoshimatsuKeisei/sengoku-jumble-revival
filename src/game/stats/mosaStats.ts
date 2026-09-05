import { MOSA_CONFIG } from "../config";
import type { SoldierBaseStats } from "../types";
import { randomIntInclusive, type RandomSource } from "./soldierStats";
export function createMosaStats(random: RandomSource = Math.random): SoldierBaseStats {
  return { maxHp: randomIntInclusive(MOSA_CONFIG.minMaxHp, MOSA_CONFIG.maxMaxHp, random),
    skill: randomIntInclusive(MOSA_CONFIG.minSkill, MOSA_CONFIG.maxSkill, random),
    foot: randomIntInclusive(MOSA_CONFIG.minFoot, MOSA_CONFIG.maxFoot, random),
    combat: randomIntInclusive(MOSA_CONFIG.minCombat, MOSA_CONFIG.maxCombat, random),
    defense: randomIntInclusive(MOSA_CONFIG.minDefense, MOSA_CONFIG.maxDefense, random) };
}
