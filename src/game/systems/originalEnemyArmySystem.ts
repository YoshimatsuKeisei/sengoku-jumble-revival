import mapPointsJson from "../data/original-sengoku/map/map_points_all.json";
import formationsJson from "../data/original-sengoku/formations/formations_all.json";
import famousUnitsJson from "../data/original-sengoku/famous/famous_units_by_efm.json";
import genericNamesJson from "../data/original-sengoku/generation/generic_name_generation.json";
import statRulesJson from "../data/original-sengoku/generation/stat_generation_rules.json";
import { battlefieldSourcePointToWorld } from "../battlefieldLayout";
import { createSoldier } from "../entities/Soldier";
import type { RandomSource } from "../stats/soldierStats";
import type {
  CommonSpecialAbilityId,
  RareSpecialAbilityId,
  Soldier,
  SoldierBaseStats,
  Strategy,
  UnitTechnique,
  UnitType,
} from "../types";
import { refreshSoldierStipend } from "./stipendSystem";

export type OriginalClassCode = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
type ClassCode = OriginalClassCode;
type RawStrategy = 0 | 1 | 3 | 4 | 8;

interface OriginalMapPoint {
  map_key: string;
  category_code: number;
  battle_kind: "generic" | "named" | "special_locked" | "training" | "excluded";
  name: string;
  formation_id?: number;
  formation_pool?: string;
  level?: number;
  elv?: number;
  selectable_battle: boolean;
}

interface OriginalFormationSlot {
  index: number;
  slot: string;
  world_x: number;
  world_y: number;
  class_code: ClassCode;
  strategy_raw: RawStrategy;
}

interface OriginalFormation {
  formation_id: number;
  units: OriginalFormationSlot[];
}

interface OriginalFamousUnit {
  efm: number;
  slot: string;
  name: string;
  world_x: number;
  world_y: number;
  class_code: ClassCode;
  strategy_raw: RawStrategy;
  combat_pw: number;
  defense_df: number;
  skill_kp: number;
  hp_mp: number;
  foot_s: number;
  technique_code: number | null;
  special_codes_raw: string;
}

interface GenericNameData {
  prefix_pool: string[];
  suffix_pool: string[];
}

interface BaseRollRule {
  foot: [number, number];
  combat: [number, number];
  hp: [number, number];
  defense: [number, number];
  skill: [number, number];
}

interface StatRulesData {
  base_rolls: Record<string, BaseRollRule>;
}

export interface OriginalEnemyStage {
  readonly mapKey: string;
  readonly battleKind: OriginalMapPoint["battle_kind"];
  readonly categoryCode: number;
  readonly level: number;
  readonly elv: number;
  readonly formationId: number;
  readonly name: string;
}

const MAP_POINTS = mapPointsJson as OriginalMapPoint[];
const FORMATIONS = formationsJson as OriginalFormation[];
const FAMOUS_UNITS = famousUnitsJson as Record<string, OriginalFamousUnit[]>;
const GENERIC_NAMES = genericNamesJson as GenericNameData;
const STAT_RULES = statRulesJson as unknown as StatRulesData;

// The remake has no serialized fmdat="n" pre-army sentinel. A selected battle
// already has an active runtime army, so normal battles use the documented
// active-fmdat branch. Keeping this named makes the unresolved save-state path
// explicit instead of silently mixing both probability tables.
const FMDAT_RARE_TECHNIQUES_ENABLED = true;

const UNIT_TYPE_BY_CLASS: Record<ClassCode, UnitType> = {
  1: "ASHIGARU",
  2: "ARCHER",
  3: "GENERAL",
  4: "MOSA",
  5: "STRATEGIST",
  6: "TEPPOU",
  7: "NINJA",
  8: "CAVALRY",
};

const STRATEGY_BY_RAW: Record<RawStrategy, Strategy> = {
  0: "melee",
  1: "charge",
  3: "defend",
  4: "wait",
  8: "intercept",
};

const COMMON_ABILITY_BY_RAW_CODE: Partial<Record<number, CommonSpecialAbilityId>> = {
  7: "RUSH",
  8: "SIEGE",
  9: "FINISHER",
  10: "MIGHT",
  11: "IRON_WALL",
  12: "HORO",
  13: "RALLY_SPIRIT",
  14: "TREATMENT",
  15: "INSPIRE",
  16: "FIELD_HOSPITAL",
  17: "TRAP",
  18: "FORTIFY",
  19: "FORESIGHT",
  20: "RECOVERY_BOOST",
  21: "DOUBLE_SPECIAL",
  22: "FLEET_FOOT",
};

const RARE_ABILITY_BY_RAW_CODE: Partial<Record<number, RareSpecialAbilityId>> = {
  31: "MOUTAI",
  32: "JINTO",
  33: "KATON",
  34: "NINJA_HUNTER",
};

function clampedRandom(random: RandomSource): number {
  return Math.max(0, Math.min(0.9999999999999999, random()));
}

function randomFloor(span: number, random: RandomSource): number {
  return Math.floor(clampedRandom(random) * span);
}

function randomInclusive(minimum: number, maximum: number, random: RandomSource): number {
  return minimum + randomFloor(maximum - minimum + 1, random);
}

function rollGreater(scale: number, threshold: number, random: RandomSource): boolean {
  return clampedRandom(random) * scale > threshold;
}

function addRandom(stats: SoldierBaseStats, key: keyof SoldierBaseStats, span: number, random: RandomSource): void {
  stats[key] += randomFloor(span, random);
}

export function resolveOriginalStrategy(raw: number): Strategy {
  const strategy = STRATEGY_BY_RAW[raw as RawStrategy];
  if (!strategy) throw new Error(`Unknown original strategy code: ${raw}`);
  return strategy;
}

export function resolveOriginalUnitType(classCode: number): UnitType {
  const unitType = UNIT_TYPE_BY_CLASS[classCode as ClassCode];
  if (!unitType) throw new Error(`Unknown original class code: ${classCode}`);
  return unitType;
}

export function resolveOriginalTechnique(classCode: ClassCode, techniqueCode: number): UnitTechnique {
  const common: Partial<Record<number, UnitTechnique>> = {
    1: "ASHIGARU_SPEAR_STRIKE",
    2: "ARCHER_ARROW",
    3: "ARCHER_LONG_SHOT",
    4: "TEPPOU_SHOOTING",
    5: "TEPPOU_SNIPING",
    6: "STRATEGIST_FIRE_PLAY",
    7: "STRATEGIST_FIRE_ATTACK",
    8: "STRATEGIST_FIRE_PLAN",
    9: "STRATEGIST_HELLFIRE",
    10: "STRATEGIST_FLAME_ART",
    11: "MOSA_SENPUU",
    12: "NINJA_NINJUTSU",
    13: "NINJA_SHADOW_RUN",
    14: "GENERAL_COMMAND",
    15: "ARCHER_FIRE_ARROW",
    16: "ARCHER_HOROKU",
    17: "TEPPOU_BOMBARDMENT",
    18: "STRATEGIST_SORCERY",
    19: "STRATEGIST_FALSE_REPORT",
    20: "NINJA_GENJUTSU",
    21: "ASHIGARU_SPEAR_TECHNIQUE",
    22: "GENERAL_HEROIC",
    23: "MOSA_MUSOU",
    25: "MOSA_KIJIN",
    26: "CAVALRY_CHARGE",
    27: "NINJA_BARRIER",
    28: "GENERAL_FURIOUS",
  };
  if (techniqueCode === 24) return classCode === 5 ? "STRATEGIST_HEAL" : "GENERAL_HEAL";
  const technique = common[techniqueCode];
  if (!technique) throw new Error(`Unsupported original technique code ${techniqueCode} for class ${classCode}`);
  return technique;
}

function initialTechniqueCode(classCode: ClassCode, random: RandomSource): number {
  if (classCode === 1) return FMDAT_RARE_TECHNIQUES_ENABLED && rollGreater(400, 398, random) ? 21 : 1;
  if (classCode === 2) {
    let technique = 2;
    if (FMDAT_RARE_TECHNIQUES_ENABLED && rollGreater(300, 287, random)) technique = rollGreater(100, 30, random) ? 15 : 16;
    return technique;
  }
  if (classCode === 3) {
    let technique = FMDAT_RARE_TECHNIQUES_ENABLED && rollGreater(400, 398, random) ? 22 : 14;
    if (FMDAT_RARE_TECHNIQUES_ENABLED && rollGreater(1800, 1798, random)) technique = 24;
    return technique;
  }
  if (classCode === 4) {
    let technique = rollGreater(100, 75, random) ? 23 : 11;
    if (rollGreater(500, 498, random)) technique = 25;
    return technique;
  }
  if (classCode === 5) {
    let technique = randomFloor(2, random) + 6;
    if (FMDAT_RARE_TECHNIQUES_ENABLED && rollGreater(100, 97, random)) technique = 19;
    if (FMDAT_RARE_TECHNIQUES_ENABLED && rollGreater(300, 297, random)) technique = 18;
    return technique;
  }
  if (classCode === 6) return FMDAT_RARE_TECHNIQUES_ENABLED && rollGreater(300, 298, random) ? 17 : 4;
  if (classCode === 7) {
    let technique = FMDAT_RARE_TECHNIQUES_ENABLED && rollGreater(100, 87, random) ? 13 : 12;
    if (FMDAT_RARE_TECHNIQUES_ENABLED && rollGreater(200, 198, random)) technique = 20;
    if (FMDAT_RARE_TECHNIQUES_ENABLED && rollGreater(200, 198, random)) technique = 27;
    return technique;
  }
  return 26;
}

function applyHighStatBranch(
  classCode: ClassCode,
  stats: SoldierBaseStats,
  techniqueCode: number,
  random: RandomSource,
): number {
  if (!rollGreater(100, 60, random)) return techniqueCode;
  if (classCode === 1) {
    addRandom(stats, "combat", 30, random); addRandom(stats, "maxHp", 25, random);
    addRandom(stats, "defense", 25, random); addRandom(stats, "skill", 30, random);
    if (rollGreater(100, 70, random)) {
      addRandom(stats, "combat", 20, random); addRandom(stats, "maxHp", 5, random);
      addRandom(stats, "defense", 10, random); addRandom(stats, "skill", 20, random);
      if (rollGreater(100, 70, random)) {
        addRandom(stats, "maxHp", 15, random); addRandom(stats, "defense", 15, random);
      }
    }
  } else if (classCode === 2) {
    techniqueCode = randomFloor(2, random) + 2;
    addRandom(stats, "combat", 20, random); addRandom(stats, "maxHp", 30, random);
    addRandom(stats, "defense", 30, random); addRandom(stats, "skill", 30, random);
    if (rollGreater(100, 90, random)) {
      addRandom(stats, "combat", 20, random);
      if (rollGreater(100, 95, random)) addRandom(stats, "combat", 80, random);
      addRandom(stats, "maxHp", 20, random); addRandom(stats, "defense", 20, random); addRandom(stats, "skill", 20, random);
    }
  } else if (classCode === 3) {
    addRandom(stats, "combat", 30, random); addRandom(stats, "maxHp", 30, random);
    addRandom(stats, "defense", 50, random); addRandom(stats, "skill", 30, random);
    if (rollGreater(100, 70, random)) {
      addRandom(stats, "combat", 50, random); addRandom(stats, "maxHp", 20, random);
      addRandom(stats, "defense", 50, random); addRandom(stats, "skill", 20, random);
    }
  } else if (classCode === 4) {
    addRandom(stats, "combat", 30, random); addRandom(stats, "maxHp", 30, random);
    addRandom(stats, "defense", 30, random); addRandom(stats, "skill", 30, random);
    if (rollGreater(100, 70, random)) {
      addRandom(stats, "combat", 20, random); addRandom(stats, "maxHp", 20, random);
      addRandom(stats, "defense", 20, random); addRandom(stats, "skill", 20, random);
    }
  } else if (classCode === 5) {
    addRandom(stats, "combat", 20, random); addRandom(stats, "maxHp", 10, random);
    addRandom(stats, "defense", 30, random); addRandom(stats, "skill", 30, random);
    if (rollGreater(100, 85, random)) {
      techniqueCode = randomFloor(3, random) + 6;
      if (rollGreater(100, 85, random)) {
        techniqueCode = randomFloor(4, random) + 6;
        addRandom(stats, "maxHp", 35, random);
        if (rollGreater(1800, 1798, random)) techniqueCode = 24;
        if (rollGreater(1400, 1398, random)) techniqueCode = 10;
      }
      addRandom(stats, "combat", 40, random); addRandom(stats, "maxHp", 20, random);
      addRandom(stats, "defense", 50, random); addRandom(stats, "skill", 80, random);
    }
  } else if (classCode === 6) {
    techniqueCode = randomFloor(2, random) + 4;
    addRandom(stats, "combat", 20, random); addRandom(stats, "maxHp", 10, random);
    addRandom(stats, "defense", 30, random); addRandom(stats, "skill", 30, random);
    if (rollGreater(100, 90, random)) {
      addRandom(stats, "combat", 20, random); addRandom(stats, "maxHp", 15, random);
      addRandom(stats, "defense", 20, random); addRandom(stats, "skill", 20, random);
      if (rollGreater(100, 95, random)) addRandom(stats, "maxHp", 30, random);
    }
  } else if (classCode === 7) {
    addRandom(stats, "combat", 20, random); addRandom(stats, "maxHp", 15, random);
    addRandom(stats, "defense", 30, random); addRandom(stats, "skill", 30, random);
    if (rollGreater(100, 70, random)) {
      addRandom(stats, "combat", 20, random); addRandom(stats, "maxHp", 15, random);
      addRandom(stats, "defense", 20, random); addRandom(stats, "skill", 20, random);
    }
  } else {
    addRandom(stats, "combat", 20, random); addRandom(stats, "maxHp", 20, random);
    addRandom(stats, "defense", 10, random); addRandom(stats, "skill", 20, random);
    if (rollGreater(100, 70, random)) {
      addRandom(stats, "combat", 40, random);
      if (rollGreater(100, 70, random)) {
        addRandom(stats, "maxHp", 10, random); addRandom(stats, "defense", 10, random); addRandom(stats, "skill", 20, random);
      }
      addRandom(stats, "maxHp", 5, random); addRandom(stats, "skill", 10, random);
    }
  }
  return techniqueCode;
}

export function generateOriginalGenericProfile(
  classCode: ClassCode,
  level: number,
  random: RandomSource = Math.random,
): { stats: SoldierBaseStats; technique: UnitTechnique; techniqueCode: number } {
  let techniqueCode = initialTechniqueCode(classCode, random);
  const rule = STAT_RULES.base_rolls[String(classCode)];
  if (!rule) throw new Error(`Missing original stat rule for class ${classCode}`);
  const stats: SoldierBaseStats = {
    foot: randomInclusive(rule.foot[0], rule.foot[1], random),
    combat: randomInclusive(rule.combat[0], rule.combat[1], random),
    maxHp: randomInclusive(rule.hp[0], rule.hp[1], random),
    defense: randomInclusive(rule.defense[0], rule.defense[1], random),
    skill: randomInclusive(rule.skill[0], rule.skill[1], random),
  };
  techniqueCode = applyHighStatBranch(classCode, stats, techniqueCode, random);
  const elv = level * 5 - 10;
  stats.combat += elv;
  stats.defense += elv;
  stats.skill += elv;
  if (classCode !== 7) stats.maxHp += elv;
  stats.combat = Math.min(classCode === 8 ? 125 : 110, stats.combat);
  stats.defense = Math.min(110, stats.defense);
  stats.skill = Math.min(110, stats.skill);
  stats.maxHp = Math.min(110, stats.maxHp);
  if (classCode === 8 && stats.maxHp > 90) stats.maxHp = 80 + randomFloor(15, random);
  return { stats, technique: resolveOriginalTechnique(classCode, techniqueCode), techniqueCode };
}

export function generateOriginalGenericName(classCode: ClassCode, random: RandomSource = Math.random): string {
  const prefixes = GENERIC_NAMES.prefix_pool;
  const suffixes = GENERIC_NAMES.suffix_pool;
  let suffixStart = 0;
  let suffixLength = suffixes.length;
  let suffixIndex: number;
  if (classCode === 3 || classCode === 5 || classCode === 8) {
    if (rollGreater(100, 25, random)) {
      suffixStart = 17;
      suffixLength = 19;
    } else if (rollGreater(100, 25, random)) suffixLength = 18;
  } else {
    if (rollGreater(100, 25, random)) suffixLength = 18;
  }
  const prefixIndex = randomFloor(prefixes.length, random);
  suffixIndex = suffixStart + randomFloor(suffixLength, random);
  return prefixes[prefixIndex] + suffixes[suffixIndex];
}

function parseFormationPool(pool: string | undefined): [number, number] {
  const numbers = pool?.match(/\d+/g)?.map(Number) ?? [];
  if (numbers.length < 2) throw new Error(`Invalid original formation pool: ${pool ?? "missing"}`);
  return [numbers[0], numbers[1]];
}

export function resolveOriginalEnemyStage(mapKey: string, random: RandomSource = Math.random): OriginalEnemyStage {
  const point = MAP_POINTS.find((candidate) => candidate.map_key === mapKey);
  if (!point || point.battle_kind === "excluded") throw new Error(`No original battle stage for map cell: ${mapKey}`);
  const level = point.level ?? 1;
  let formationId = point.formation_id;
  if (formationId === undefined) {
    const [minimum, maximum] = parseFormationPool(point.formation_pool);
    formationId = randomInclusive(minimum, maximum, random);
  }
  return Object.freeze({
    mapKey,
    battleKind: point.battle_kind,
    categoryCode: point.category_code,
    level,
    elv: point.elv ?? level * 5 - 10,
    formationId,
    name: point.name,
  });
}

export function resolveOriginalAbilityCodes(codes: readonly number[]): {
  codes: number[];
  common: CommonSpecialAbilityId[];
  rare: RareSpecialAbilityId[];
} {
  const retainedCodes = [...codes];
  return {
    codes: retainedCodes,
    common: [...new Set(retainedCodes.map((code) => COMMON_ABILITY_BY_RAW_CODE[code]).filter((ability): ability is CommonSpecialAbilityId => Boolean(ability)))],
    rare: [...new Set(retainedCodes.map((code) => RARE_ABILITY_BY_RAW_CODE[code]).filter((ability): ability is RareSpecialAbilityId => Boolean(ability)))],
  };
}

function abilitiesFromRaw(raw: string) {
  return resolveOriginalAbilityCodes([...raw.matchAll(/s(\d+)/g)].map((match) => Number(match[1])));
}

const GENERIC_COMMON_ABILITY_ROLLS: readonly {
  code: number;
  ability: CommonSpecialAbilityId;
  probability: number;
}[] = [
  { code: 7, ability: "RUSH", probability: 0.25 },
  { code: 8, ability: "SIEGE", probability: 0.25 },
  { code: 9, ability: "FINISHER", probability: 0.05 },
  { code: 10, ability: "MIGHT", probability: 0.05 },
  { code: 11, ability: "IRON_WALL", probability: 0.25 },
  { code: 12, ability: "HORO", probability: 0.25 },
  { code: 13, ability: "RALLY_SPIRIT", probability: 0.05 },
  { code: 14, ability: "TREATMENT", probability: 0.25 },
  { code: 15, ability: "INSPIRE", probability: 0.05 },
  { code: 16, ability: "FIELD_HOSPITAL", probability: 0.25 },
  { code: 17, ability: "TRAP", probability: 0.25 },
  { code: 18, ability: "FORTIFY", probability: 0.25 },
  { code: 19, ability: "FORESIGHT", probability: 0.25 },
  { code: 20, ability: "RECOVERY_BOOST", probability: 0.25 },
  { code: 21, ability: "DOUBLE_SPECIAL", probability: 0.05 },
  { code: 22, ability: "FLEET_FOOT", probability: 0.25 },
];

export function generateOriginalGenericAbilities(
  classCode: ClassCode,
  random: RandomSource = Math.random,
): { codes: number[]; common: CommonSpecialAbilityId[]; rare: RareSpecialAbilityId[] } {
  const codes: number[] = [];
  const common: CommonSpecialAbilityId[] = [];
  const rare: RareSpecialAbilityId[] = [];
  for (const definition of GENERIC_COMMON_ABILITY_ROLLS) {
    if (clampedRandom(random) < definition.probability) {
      codes.push(definition.code);
      common.push(definition.ability);
    }
  }
  const addCommon = (code: number, ability: CommonSpecialAbilityId): void => {
    if (!common.includes(ability)) common.push(ability);
    if (!codes.includes(code)) codes.push(code);
  };
  const addRare = (code: number, ability: RareSpecialAbilityId): void => {
    if (!rare.includes(ability)) rare.push(ability);
    if (!codes.includes(code)) codes.push(code);
  };
  if (classCode === 8) {
    addCommon(7, "RUSH");
    addCommon(22, "FLEET_FOOT");
    if (clampedRandom(random) < 0.1) addRare(32, "JINTO");
  } else if (classCode === 7) {
    if (clampedRandom(random) < 0.2) addRare(33, "KATON");
  } else if (classCode === 4 && clampedRandom(random) < 0.15) {
    addRare(34, "NINJA_HUNTER");
  }
  return { codes, common, rare };
}

function isPlainHighLevelCavalryCandidate(stage: OriginalEnemyStage, slot: OriginalFormationSlot): boolean {
  return stage.battleKind === "generic"
    && stage.categoryCode === 0
    && stage.level >= 4
    && (slot.strategy_raw === 0 || slot.strategy_raw === 1);
}

export function createOriginalEnemyArmy(
  mapKey: string,
  random: RandomSource = Math.random,
): Soldier[] {
  const stage = resolveOriginalEnemyStage(mapKey, random);
  const formation = FORMATIONS.find((candidate) => candidate.formation_id === stage.formationId);
  if (!formation || formation.units.length !== 30) {
    throw new Error(`Original formation ${stage.formationId} does not contain 30 slots`);
  }
  const famousBySlot = new Map((FAMOUS_UNITS[String(stage.formationId)] ?? []).map((unit) => [unit.slot, unit]));
  return formation.units.map((slot, rosterIndex) => {
    const famous = famousBySlot.get(slot.slot);
    const cavalryOverride = !famous && isPlainHighLevelCavalryCandidate(stage, slot) && rollGreater(100, 90, random);
    const generatedClass = cavalryOverride ? 8 : slot.class_code;
    const profile = generateOriginalGenericProfile(generatedClass, stage.level, random);
    const name = generateOriginalGenericName(generatedClass, random);
    const finalClass = famous?.class_code ?? generatedClass;
    const finalStrategyRaw = famous?.strategy_raw ?? (cavalryOverride ? 1 : slot.strategy_raw);
    const finalSourcePosition = famous
      ? { x: famous.world_x, y: famous.world_y }
      : { x: slot.world_x, y: slot.world_y };
    const position = battlefieldSourcePointToWorld(finalSourcePosition);
    const stats = famous ? {
      combat: famous.combat_pw,
      defense: famous.defense_df,
      skill: famous.skill_kp,
      maxHp: famous.hp_mp,
      foot: famous.foot_s,
    } : profile.stats;
    const soldier = createSoldier(
      `enemy-${rosterIndex}`,
      "enemy",
      "ai",
      position.x,
      position.y,
      resolveOriginalStrategy(finalStrategyRaw),
      stats,
    );
    soldier.name = famous?.name ?? name;
    soldier.unitType = resolveOriginalUnitType(finalClass);
    // The two recovered source anomalies intentionally retain chpr()'s generated
    // technique because pstch() never assigned their own slot.
    soldier.technique = famous?.technique_code == null
      ? profile.technique
      : resolveOriginalTechnique(finalClass, famous.technique_code);
    const abilities = famous
      ? abilitiesFromRaw(famous.special_codes_raw)
      : generateOriginalGenericAbilities(finalClass, random);
    soldier.specialAbilities = abilities.common;
    soldier.rareSpecialAbilities = abilities.rare;
    soldier.originalSpecialAbilityCodes = abilities.codes;
    soldier.anchorX = position.x;
    soldier.anchorY = position.y;
    soldier.strategyObjectiveX = position.x;
    soldier.strategyObjectiveY = position.y;
    refreshSoldierStipend(soldier);
    return soldier;
  });
}
