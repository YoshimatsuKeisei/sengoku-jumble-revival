import type { CommonSpecialAbilityId, RareSpecialAbilityId, Soldier, SoldierBaseStats, UnitTechnique, UnitType } from "../types";

export const TECHNIQUE_STIPEND_COST: Readonly<Record<UnitTechnique, number>> = Object.freeze({
  PROTOTYPE_AREA: 0,
  ASHIGARU_SPEAR_STRIKE: 10,
  ARCHER_ARROW: 10,
  ARCHER_LONG_SHOT: 100,
  TEPPOU_SHOOTING: 120,
  TEPPOU_SNIPING: 500,
  STRATEGIST_FIRE_PLAY: 0,
  STRATEGIST_FIRE_ATTACK: 80,
  STRATEGIST_FIRE_PLAN: 300,
  STRATEGIST_HELLFIRE: 800,
  STRATEGIST_FLAME_ART: 5000,
  MOSA_SENPUU: 80,
  NINJA_NINJUTSU: 200,
  NINJA_SHADOW_RUN: 280,
  GENERAL_COMMAND: 80,
  ARCHER_FIRE_ARROW: 200,
  ARCHER_HOROKU: 300,
  TEPPOU_BOMBARDMENT: 1500,
  STRATEGIST_SORCERY: 3000,
  STRATEGIST_FALSE_REPORT: 120,
  NINJA_GENJUTSU: 3000,
  ASHIGARU_SPEAR_TECHNIQUE: 250,
  GENERAL_HEROIC: 3000,
  MOSA_MUSOU: 300,
  STRATEGIST_HEAL: 6000,
  GENERAL_HEAL: 6000,
  MOSA_KIJIN: 4000,
  CAVALRY_CHARGE: 3000,
  NINJA_BARRIER: 6000,
  GENERAL_FURIOUS: 6000,
});

export const RAW_SPECIAL_STIPEND_COST: Readonly<Partial<Record<number, number>>> = Object.freeze({
  1: 10, 2: 10, 3: 10, 4: 5, 5: 5, 6: 0,
  7: 20, 8: 20, 9: 10, 10: 300, 11: 10, 12: 10, 13: 20, 14: 30,
  15: 120, 16: 30, 17: 10, 18: 30, 19: 20, 20: 20, 21: 350, 22: 10,
  31: 1000, 32: 2000, 33: 1200, 34: 700,
});

const RAW_CODE_BY_COMMON: Readonly<Record<CommonSpecialAbilityId, number>> = Object.freeze({
  RUSH: 7, SIEGE: 8, FINISHER: 9, MIGHT: 10, IRON_WALL: 11, HORO: 12,
  RALLY_SPIRIT: 13, TREATMENT: 14, INSPIRE: 15, FIELD_HOSPITAL: 16,
  TRAP: 17, FORTIFY: 18, FORESIGHT: 19, RECOVERY_BOOST: 20,
  DOUBLE_SPECIAL: 21, FLEET_FOOT: 22,
});

const RAW_CODE_BY_RARE: Readonly<Record<RareSpecialAbilityId, number>> = Object.freeze({
  MOUTAI: 31, JINTO: 32, KATON: 33, NINJA_HUNTER: 34,
});

export interface StipendInput {
  stats: SoldierBaseStats;
  maxHp: number;
  unitType: UnitType;
  technique: UnitTechnique;
  specialAbilities: readonly CommonSpecialAbilityId[];
  rareSpecialAbilities: readonly RareSpecialAbilityId[];
  originalSpecialAbilityCodes?: readonly number[];
}

export function calculateBaseStipend(stats: SoldierBaseStats, maxHp = stats.maxHp): number {
  return Math.floor(
    stats.combat ** 3 / 2000
    + maxHp ** 3 / 2500
    + stats.defense ** 3 / 3000
    + stats.skill ** 3 / 2200
    + stats.foot ** 3 * 2,
  );
}

export function calculateSoldierStipend(input: StipendInput): number {
  const rawCodes = new Set(input.originalSpecialAbilityCodes ?? []);
  for (const ability of input.specialAbilities) rawCodes.add(RAW_CODE_BY_COMMON[ability]);
  for (const ability of input.rareSpecialAbilities) rawCodes.add(RAW_CODE_BY_RARE[ability]);
  const specialCost = [...rawCodes].reduce((total, code) => total + (RAW_SPECIAL_STIPEND_COST[code] ?? 0), 0);
  let stipend = calculateBaseStipend(input.stats, input.maxHp)
    + TECHNIQUE_STIPEND_COST[input.technique]
    + specialCost;
  if (input.unitType === "ASHIGARU" || input.unitType === "ARCHER") stipend = Math.floor(stipend * 0.7);
  return Math.min(stipend, 9999);
}

export function refreshSoldierStipend(soldier: Soldier): number {
  soldier.stipend = calculateSoldierStipend(soldier);
  return soldier.stipend;
}

const TOTAL_STIPEND_BONUSES: Readonly<Record<string, number>> = Object.freeze({
  丹羽長秀軍: 200,
  滝川一益軍: 400,
  明智光秀軍: 800,
  柴田勝家軍: 1000,
  徳川家康軍: 1200,
  羽柴秀吉軍: 1400,
  織田信長軍: 4800,
});

/** Pure helper only; the project has no persistent total-stipend economy yet. */
export function calculateMaxTotalStipend(clearedMapPointCount: number, defeatedArmyNames: readonly string[]): number {
  const defeated = new Set(defeatedArmyNames);
  const calculated = 30000
    + Math.max(0, Math.floor(clearedMapPointCount)) * 200
    + Object.entries(TOTAL_STIPEND_BONUSES).reduce(
      (sum, [name, bonus]) => sum + (defeated.has(name) ? bonus : 0),
      0,
    );
  return calculated > 49399 ? 62000 : calculated;
}
