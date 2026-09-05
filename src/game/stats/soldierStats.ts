import { MOVEMENT_SPEED_CONFIG, PROTOTYPE_SOLDIER_STATS } from "../config";
import type { Soldier, SoldierBaseStats } from "../types";

export type RandomSource = () => number;

export function randomIntInclusive(minimum: number, maximum: number, random: RandomSource = Math.random): number {
  const low = Math.ceil(Math.min(minimum, maximum));
  const high = Math.floor(Math.max(minimum, maximum));
  const sample = Math.max(0, Math.min(0.9999999999999999, random()));
  return low + Math.floor(sample * (high - low + 1));
}

export function createPrototypeStats(random: RandomSource = Math.random): SoldierBaseStats {
  return {
    maxHp: randomIntInclusive(PROTOTYPE_SOLDIER_STATS.minMaxHp, PROTOTYPE_SOLDIER_STATS.maxMaxHp, random),
    skill: PROTOTYPE_SOLDIER_STATS.placeholderSkill,
    foot: randomIntInclusive(PROTOTYPE_SOLDIER_STATS.minFoot, PROTOTYPE_SOLDIER_STATS.maxFoot, random),
    combat: PROTOTYPE_SOLDIER_STATS.placeholderCombat,
    defense: PROTOTYPE_SOLDIER_STATS.placeholderDefense,
  };
}

export function getEffectiveFoot(soldier: Pick<Soldier, "controller" | "stats">): number {
  return soldier.controller === "player"
    ? Math.max(soldier.stats.foot, MOVEMENT_SPEED_CONFIG.playerMinimumFoot)
    : soldier.stats.foot;
}

export function calculateMoveSpeedFromFoot(foot: number): number {
  return foot * MOVEMENT_SPEED_CONFIG.footSpeedUnitPxPerSecond;
}

export function getSoldierMoveSpeed(soldier: Pick<Soldier, "controller" | "stats">): number {
  return calculateMoveSpeedFromFoot(getEffectiveFoot(soldier));
}
