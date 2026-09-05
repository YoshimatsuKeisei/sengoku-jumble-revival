import { BATTLEFIELD_CONFIG, PLAYER_DEBUG_CONFIG, PROTOTYPE_COMBAT_MAX, PROTOTYPE_DEFENSE_MAX, SOLDIERS_PER_TEAM, SPECIAL_ABILITY_CONFIG } from "../config";
import { createSoldier } from "../entities/Soldier";
import { createPrototypeStats, type RandomSource } from "../stats/soldierStats";
import type { Soldier, SoldierLoadout, Strategy, Team, TeamArmySetup, UnitTechnique } from "../types";
import { COMMON_SPECIAL_ABILITY_POOL, createRandomCommonSpecialAbilities } from "../systems/specialAbilitySystem";
import { TECHNIQUE_DEFINITIONS } from "../systems/unitLoadoutSystem";
import { createDefaultTeamArmySetup, techniqueSlotsForTeam } from "../systems/armySetupSystem";
import { createCavalryStats } from "../stats/cavalryStats";
import { createArcherStats } from "../stats/archerStats";
import { createAshigaruStats } from "../stats/ashigaruStats";
import { createNinjaStats } from "../stats/ninjaStats";
import { createGeneralStats } from "../stats/generalStats";
import { createStrategistStats } from "../stats/strategistStats";
import { createMosaStats } from "../stats/mosaStats";

const STRATEGIES: Strategy[] = ["charge", "defend", "intercept", "melee", "wait"];

export interface ArmyInitialPosition {
  soldierId: string;
  rosterIndex: number;
  worldX: number;
  worldY: number;
}

export function getDefaultArmyPosition(team: Team, index: number): { x: number; y: number } {
  const column = Math.floor(index / 10);
  const row = index % 10;
  const direction = team === "player" ? 1 : -1;
  const homeX = team === "player" ? BATTLEFIELD_CONFIG.playerHomeX : BATTLEFIELD_CONFIG.enemyHomeX;
  return {
    x: homeX + direction * (100 + column * 52 + (row % 2) * 10),
    y: 180 + row * 60,
  };
}

function strategyFor(team: Team, index: number): Strategy {
  if (team === "player") {
    if (index === 0) return "melee";
    const aiIndex = index - 1;
    if (aiIndex < 24) return STRATEGIES[Math.floor(aiIndex / 6)];
    return "wait";
  }
  return STRATEGIES[Math.floor(index / 6)];
}

export function createArmy(team: Team, random: RandomSource = Math.random,
  options: {
    playerAllCommonAbilities?: boolean;
    playerLoadout?: SoldierLoadout;
    armySetup?: TeamArmySetup;
    initialPositions?: readonly ArmyInitialPosition[];
  } = {}): Soldier[] {
  const army: Soldier[] = [];
  const teamSetup = options.armySetup ?? createDefaultTeamArmySetup();
  const techniques = techniqueSlotsForTeam(teamSetup);
  if (team === "player" && options.playerLoadout) {
    const sameLimitedUnit = options.playerLoadout.unitType === "CAVALRY" ? techniques.indexOf("CAVALRY_CHARGE")
      : options.playerLoadout.unitType === "NINJA" && techniques.filter((technique) => TECHNIQUE_DEFINITIONS[technique].unitType === "NINJA").length >= 6
        ? techniques.findIndex((technique) => TECHNIQUE_DEFINITIONS[technique].unitType === "NINJA")
      : options.playerLoadout.unitType === "GENERAL" && techniques.filter((technique) => TECHNIQUE_DEFINITIONS[technique].unitType === "GENERAL").length >= 4
        ? techniques.findIndex((technique) => TECHNIQUE_DEFINITIONS[technique].unitType === "GENERAL")
      : options.playerLoadout.unitType === "STRATEGIST" && techniques.filter((technique) => TECHNIQUE_DEFINITIONS[technique].unitType === "STRATEGIST").length >= 4
        ? techniques.findIndex((technique) => TECHNIQUE_DEFINITIONS[technique].unitType === "STRATEGIST")
      : options.playerLoadout.unitType === "MOSA" && techniques.filter((technique) => TECHNIQUE_DEFINITIONS[technique].unitType === "MOSA").length >= 6
        ? techniques.findIndex((technique) => TECHNIQUE_DEFINITIONS[technique].unitType === "MOSA") : -1;
    const replacement = sameLimitedUnit >= 0 ? sameLimitedUnit : techniques.indexOf("PROTOTYPE_AREA");
    const index = replacement >= 0 ? replacement : 0;
    [techniques[0], techniques[index]] = [techniques[index], techniques[0]];
    techniques[0] = options.playerLoadout.technique;
  }
  for (let index = 0; index < SOLDIERS_PER_TEAM; index += 1) {
    const soldierId = `${team}-${index}`;
    const defaultPosition = getDefaultArmyPosition(team, index);
    const savedPosition = options.initialPositions?.find((position) => position.soldierId === soldierId)
      ?? options.initialPositions?.find((position) => position.rosterIndex === index);
    const x = savedPosition?.worldX ?? defaultPosition.x;
    const y = savedPosition?.worldY ?? defaultPosition.y;
    const generatedStats = createPrototypeStats(random);
    const soldierStats = team === "player" && index === 0
      ? { ...generatedStats, foot: 6, combat: PROTOTYPE_COMBAT_MAX, defense: PROTOTYPE_DEFENSE_MAX }
      : generatedStats;
    const playerLoadout = team === "player" && index === 0 ? options.playerLoadout : undefined;
    const soldier = createSoldier(
      soldierId,
      team,
      team === "player" && index === 0 ? "player" : "ai",
      x, y, teamSetup.defaultStrategy,
      soldierStats, playerLoadout,
    );
    const playerAllCommonAbilities = options.playerAllCommonAbilities ?? PLAYER_DEBUG_CONFIG.playerAllCommonAbilities;
    if (!playerLoadout) soldier.specialAbilities = team === "player" && index === 0 && playerAllCommonAbilities
      ? [...COMMON_SPECIAL_ABILITY_POOL]
      : team === "player" && index === 0 && SPECIAL_ABILITY_CONFIG.debugPlayerSpecialAbilities
        ? [...new Set(SPECIAL_ABILITY_CONFIG.debugPlayerSpecialAbilities)] : createRandomCommonSpecialAbilities(random);
    if (!playerLoadout) {
      soldier.technique = techniques[index];
      soldier.unitType = TECHNIQUE_DEFINITIONS[soldier.technique].unitType;
      if (soldier.unitType === "CAVALRY") {
        soldier.stats = createCavalryStats(random); soldier.maxHp = soldier.stats.maxHp; soldier.hp = soldier.maxHp;
        soldier.specialAbilities = [...new Set([...soldier.specialAbilities, "RUSH", "FLEET_FOOT"])] as typeof soldier.specialAbilities;
        soldier.rareSpecialAbilities = ["MOUTAI"];
      }
      if (soldier.unitType === "ARCHER") {
        soldier.stats = createArcherStats(random); soldier.maxHp = soldier.stats.maxHp; soldier.hp = soldier.maxHp;
      }
      if (soldier.unitType === "ASHIGARU") {
        soldier.stats = createAshigaruStats(random); soldier.maxHp = soldier.stats.maxHp; soldier.hp = soldier.maxHp;
      }
      if (soldier.unitType === "NINJA") {
        soldier.stats = createNinjaStats(random); soldier.maxHp = soldier.stats.maxHp; soldier.hp = soldier.maxHp;
      }
      if (soldier.unitType === "GENERAL") {
        soldier.stats = createGeneralStats(random); soldier.maxHp = soldier.stats.maxHp; soldier.hp = soldier.maxHp;
      }
      if (soldier.unitType === "STRATEGIST") {
        soldier.stats = createStrategistStats(random); soldier.maxHp = soldier.stats.maxHp; soldier.hp = soldier.maxHp;
      }
      if (soldier.unitType === "MOSA") {
        soldier.stats = createMosaStats(random); soldier.maxHp = soldier.stats.maxHp; soldier.hp = soldier.maxHp;
      }
    }
    if (soldier.unitType === "CAVALRY") soldier.strategy = "charge";
    army.push(soldier);
  }
  return army;
}
