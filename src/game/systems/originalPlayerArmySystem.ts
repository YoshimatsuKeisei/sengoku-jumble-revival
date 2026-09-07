import initialPlayerArmyCsv from "../data/original-sengoku/initial_player_army.csv?raw";
import { battlefieldSourcePointToWorld } from "../battlefieldLayout";
import { createSoldier } from "../entities/Soldier";
import type { RandomSource } from "../stats/soldierStats";
import type { Soldier, SoldierLoadout, Strategy, TeamArmySetup, UnitTechnique } from "../types";
import type { ArmyInitialPosition } from "../factories/createArmy";
import {
  generateOriginalGenericName,
  resolveOriginalAbilityCodes,
  resolveOriginalTechnique,
  resolveOriginalUnitType,
  type OriginalClassCode,
} from "./originalEnemyArmySystem";
import { COMMON_SPECIAL_ABILITY_POOL } from "./specialAbilitySystem";

const PLAYER_STRATEGY_BY_RUNTIME: Readonly<Record<number, Strategy>> = Object.freeze({
  1: "charge",
  3: "defend",
  8: "intercept",
  10: "melee",
  14: "wait",
});

function resolveInitialPlayerStrategy(code: number): Strategy {
  const strategy = PLAYER_STRATEGY_BY_RUNTIME[code];
  if (!strategy) throw new Error(`Unknown initial player strategy code: ${code}`);
  return strategy;
}

export interface InitialPlayerArmyRecord {
  slot: number;
  sourceX: number;
  sourceY: number;
  combat: number;
  defense: number;
  maxHp: number;
  skill: number;
  foot: number;
  classCode: OriginalClassCode;
  strategyCode: number;
  techniqueCode: number;
  stipend: number;
  abilityCodes: number[];
}

function parseInteger(value: string, field: string, slot: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`Invalid ${field} for initial player slot ${slot}`);
  return parsed;
}

function parseInitialPlayerArmyCsv(csv: string): InitialPlayerArmyRecord[] {
  const lines = csv.trim().split(/\r?\n/);
  const header = lines.shift()?.split(",") ?? [];
  const column = (name: string): number => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`Missing initial player army column: ${name}`);
    return index;
  };
  const columns = {
    slot: column("slot"), sourceX: column("world_x"), sourceY: column("world_y"),
    combat: column("combat"), defense: column("defense"), maxHp: column("max_hp"), skill: column("skill"), foot: column("foot"),
    classCode: column("class_code"), strategyCode: column("strategy_code_runtime"), techniqueCode: column("technique_code"),
    stipend: column("roku"), abilityCodes: column("flags_s"),
  };
  const records = lines.map((line) => {
    const values = line.split(",");
    const slot = parseInteger(values[columns.slot], "slot", -1);
    const numberAt = (key: Exclude<keyof typeof columns, "abilityCodes">) => parseInteger(values[columns[key]], key, slot);
    return {
      slot,
      sourceX: numberAt("sourceX"), sourceY: numberAt("sourceY"),
      combat: numberAt("combat"), defense: numberAt("defense"), maxHp: numberAt("maxHp"),
      skill: numberAt("skill"), foot: numberAt("foot"),
      classCode: numberAt("classCode") as OriginalClassCode,
      strategyCode: numberAt("strategyCode"), techniqueCode: numberAt("techniqueCode"),
      stipend: numberAt("stipend"),
      abilityCodes: [...values[columns.abilityCodes].matchAll(/s(\d+)/g)].map((match) => Number(match[1])),
    };
  });
  if (records.length !== 30 || records.some((record, index) => record.slot !== index)) {
    throw new Error("Initial player army must contain ordered slots 0..29");
  }
  return records;
}

export const INITIAL_PLAYER_ARMY_RECORDS: readonly InitialPlayerArmyRecord[] = Object.freeze(
  parseInitialPlayerArmyCsv(initialPlayerArmyCsv).map((record) => Object.freeze(record)),
);

export const INITIAL_PLAYER_MONEY = 3_000;
export const INITIAL_PLAYER_TOTAL_STIPEND = INITIAL_PLAYER_ARMY_RECORDS
  .reduce((sum, record) => sum + record.stipend, 0);

export const INITIAL_PLAYER_TECHNIQUE_COUNTS: Readonly<Partial<Record<UnitTechnique, number>>> = Object.freeze(
  INITIAL_PLAYER_ARMY_RECORDS.reduce<Partial<Record<UnitTechnique, number>>>((counts, record) => {
    const technique = resolveOriginalTechnique(record.classCode, record.techniqueCode);
    counts[technique] = (counts[technique] ?? 0) + 1;
    return counts;
  }, {}),
);

export function isInitialPlayerArmySetup(setup: TeamArmySetup): boolean {
  return Object.entries(setup.techniqueCounts).every(([technique, count]) =>
    count === (INITIAL_PLAYER_TECHNIQUE_COUNTS[technique as UnitTechnique] ?? 0));
}

function savedPositionFor(
  initialPositions: readonly ArmyInitialPosition[] | undefined,
  soldierId: string,
  rosterIndex: number,
): ArmyInitialPosition | undefined {
  return initialPositions?.find((position) => position.soldierId === soldierId)
    ?? initialPositions?.find((position) => position.rosterIndex === rosterIndex);
}

export function createOriginalPlayerArmy(
  random: RandomSource = Math.random,
  options: {
    playerAllCommonAbilities?: boolean;
    playerLoadout?: SoldierLoadout;
    initialPositions?: readonly ArmyInitialPosition[];
  } = {},
): Soldier[] {
  return INITIAL_PLAYER_ARMY_RECORDS.map((record) => {
    const id = `player-${record.slot}`;
    const sourcePosition = battlefieldSourcePointToWorld({ x: record.sourceX, y: record.sourceY });
    const savedPosition = savedPositionFor(options.initialPositions, id, record.slot);
    const position = savedPosition ? { x: savedPosition.worldX, y: savedPosition.worldY } : sourcePosition;
    const originalLoadout = {
      unitType: resolveOriginalUnitType(record.classCode),
      technique: resolveOriginalTechnique(record.classCode, record.techniqueCode),
      stats: { maxHp: record.maxHp, skill: record.skill, foot: record.foot, combat: record.combat, defense: record.defense },
      specialAbilities: [] as Soldier["specialAbilities"],
      rareSpecialAbilities: [] as Soldier["rareSpecialAbilities"],
    };
    const explicitPlayerLoadout = record.slot === 0 && options.playerLoadout?.unitType !== "PROTOTYPE"
      ? options.playerLoadout : undefined;
    const soldier = createSoldier(
      id,
      "player",
      record.slot === 0 ? "player" : "ai",
      position.x,
      position.y,
      resolveInitialPlayerStrategy(record.strategyCode),
      originalLoadout.stats,
      explicitPlayerLoadout,
    );
    if (!explicitPlayerLoadout) {
      const abilities = resolveOriginalAbilityCodes(record.abilityCodes);
      soldier.unitType = originalLoadout.unitType;
      soldier.technique = originalLoadout.technique;
      soldier.specialAbilities = abilities.common;
      soldier.rareSpecialAbilities = abilities.rare;
      soldier.originalSpecialAbilityCodes = abilities.codes;
      if (record.slot === 0 && options.playerAllCommonAbilities) {
        // Explicit debug-only override; the normal battle path leaves the CSV abilities intact.
        soldier.specialAbilities = [...COMMON_SPECIAL_ABILITY_POOL];
      }
    }
    soldier.name = generateOriginalGenericName(record.classCode, random);
    soldier.anchorX = position.x;
    soldier.anchorY = position.y;
    soldier.strategyObjectiveX = position.x;
    soldier.strategyObjectiveY = position.y;
    // sttnm() stores each initial record's tp directly. Keep that recovered
    // value instead of regenerating it from fields the CSV may not expose.
    soldier.stipend = record.stipend;
    return soldier;
  });
}
