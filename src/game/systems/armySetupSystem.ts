import { SOLDIERS_PER_TEAM } from "../config";
import type { ArmySetup, Strategy, Team, TeamArmySetup, UnitTechnique } from "../types";
import { TECHNIQUE_DEFINITIONS } from "./unitLoadoutSystem";

export const ARMY_SETUP_STORAGE_KEY = "sengoku-debug-army-setup";
export const TECHNIQUE_ORDER = Object.keys(TECHNIQUE_DEFINITIONS) as UnitTechnique[];
export function createDefaultTeamArmySetup(): TeamArmySetup {
  return { defaultStrategy: "melee", techniqueCounts: {
    PROTOTYPE_AREA: 23, TEPPOU_SHOOTING: 0, TEPPOU_SNIPING: 0, TEPPOU_BOMBARDMENT: 6, CAVALRY_CHARGE: 1,
    ARCHER_ARROW: 0, ARCHER_LONG_SHOT: 0, ARCHER_FIRE_ARROW: 0, ARCHER_HOROKU: 0,
    ASHIGARU_SPEAR_STRIKE: 0, ASHIGARU_SPEAR_TECHNIQUE: 0,
    NINJA_NINJUTSU: 0, NINJA_SHADOW_RUN: 0, NINJA_GENJUTSU: 0, NINJA_BARRIER: 0,
    GENERAL_COMMAND: 0, GENERAL_HEROIC: 0, GENERAL_HEAL: 0,
    STRATEGIST_FIRE_PLAY: 0, STRATEGIST_FIRE_ATTACK: 0, STRATEGIST_FIRE_PLAN: 0, STRATEGIST_HELLFIRE: 0,
    STRATEGIST_FLAME_ART: 0, STRATEGIST_FALSE_REPORT: 0, STRATEGIST_SORCERY: 0, STRATEGIST_HEAL: 0,
    MOSA_SENPUU: 0, MOSA_MUSOU: 0, MOSA_KIJIN: 0,
  } };
}
export function createDefaultArmySetup(): ArmySetup {
  return { player: createDefaultTeamArmySetup(), enemy: createDefaultTeamArmySetup() };
}
export function getArmySetupTotal(setup: TeamArmySetup): number {
  return TECHNIQUE_ORDER.reduce((total, technique) => total + setup.techniqueCounts[technique], 0);
}
export function isValidTeamArmySetup(setup: TeamArmySetup): boolean {
  return ["charge", "defend", "intercept", "melee", "wait"].includes(setup.defaultStrategy)
    && TECHNIQUE_ORDER.every((technique) => Number.isInteger(setup.techniqueCounts[technique])
      && setup.techniqueCounts[technique] >= 0 && setup.techniqueCounts[technique] <= SOLDIERS_PER_TEAM)
    && setup.techniqueCounts.CAVALRY_CHARGE <= 1
    && setup.techniqueCounts.NINJA_NINJUTSU + setup.techniqueCounts.NINJA_SHADOW_RUN
      + setup.techniqueCounts.NINJA_GENJUTSU + setup.techniqueCounts.NINJA_BARRIER <= 6
    && setup.techniqueCounts.GENERAL_COMMAND + setup.techniqueCounts.GENERAL_HEROIC
      + setup.techniqueCounts.GENERAL_HEAL <= 4
    && setup.techniqueCounts.STRATEGIST_FIRE_PLAY + setup.techniqueCounts.STRATEGIST_FIRE_ATTACK
      + setup.techniqueCounts.STRATEGIST_FIRE_PLAN + setup.techniqueCounts.STRATEGIST_HELLFIRE
      + setup.techniqueCounts.STRATEGIST_FLAME_ART + setup.techniqueCounts.STRATEGIST_FALSE_REPORT
      + setup.techniqueCounts.STRATEGIST_SORCERY + setup.techniqueCounts.STRATEGIST_HEAL <= 4
    && setup.techniqueCounts.MOSA_SENPUU + setup.techniqueCounts.MOSA_MUSOU + setup.techniqueCounts.MOSA_KIJIN <= 6
    && getArmySetupTotal(setup) === SOLDIERS_PER_TEAM;
}
export function validateArmySetup(setup: ArmySetup): ArmySetup {
  if (!isValidTeamArmySetup(setup.player) || !isValidTeamArmySetup(setup.enemy)) throw new Error("Each army must contain exactly 30 valid soldiers");
  return structuredClone(setup);
}
export function techniqueSlotsForTeam(setup: TeamArmySetup): UnitTechnique[] {
  if (!isValidTeamArmySetup(setup)) throw new Error("Invalid team army setup");
  return TECHNIQUE_ORDER.flatMap((technique) => Array(setup.techniqueCounts[technique]).fill(technique) as UnitTechnique[]);
}
export function loadStoredArmySetup(): ArmySetup {
  try { const raw = localStorage.getItem(ARMY_SETUP_STORAGE_KEY); return raw ? validateArmySetup(JSON.parse(raw)) : createDefaultArmySetup(); }
  catch { return createDefaultArmySetup(); }
}
