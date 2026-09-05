import { CAVALRY_CONFIG } from "../config";
import type { RandomSource } from "./soldierStats";
import type { SoldierBaseStats } from "../types";
function integer(random: RandomSource, min: number, max: number): number {
  return min + Math.floor(Math.max(0, Math.min(0.999999999, random())) * (max - min + 1));
}
export function createCavalryStats(random: RandomSource = Math.random): SoldierBaseStats {
  return { maxHp: integer(random, CAVALRY_CONFIG.minMaxHp, CAVALRY_CONFIG.maxMaxHp),
    skill: integer(random, CAVALRY_CONFIG.minSkill, CAVALRY_CONFIG.maxSkill), foot: CAVALRY_CONFIG.foot,
    combat: CAVALRY_CONFIG.combat, defense: integer(random, CAVALRY_CONFIG.minDefense, CAVALRY_CONFIG.maxDefense) };
}
