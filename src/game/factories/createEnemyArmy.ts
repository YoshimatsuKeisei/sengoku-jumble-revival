import { createArmy } from "./createArmy";
import { createOriginalEnemyArmy } from "../systems/originalEnemyArmySystem";
import type { RandomSource } from "../stats/soldierStats";
import type { Soldier, TeamArmySetup } from "../types";

export interface EnemyArmyCreationOptions {
  mapKey: string;
  useCustomArmy: boolean;
  customSetup: TeamArmySetup;
  random?: RandomSource;
}

export function createEnemyArmyForBattle(options: EnemyArmyCreationOptions): Soldier[] {
  const random = options.random ?? Math.random;
  return options.useCustomArmy
    ? createArmy("enemy", random, { armySetup: options.customSetup })
    : createOriginalEnemyArmy(options.mapKey, random);
}
