import { describe, expect, it } from "vitest";
import { battlefieldSourcePointToWorld } from "../battlefieldLayout";
import { createArmy } from "../factories/createArmy";
import { createInitialPlayerTeamArmySetup } from "./armySetupSystem";
import {
  INITIAL_PLAYER_ARMY_RECORDS,
  INITIAL_PLAYER_TECHNIQUE_COUNTS,
  INITIAL_PLAYER_TOTAL_STIPEND,
  createOriginalPlayerArmy,
  isInitialPlayerArmySetup,
} from "./originalPlayerArmySystem";

describe("SWF initial player army", () => {
  it("loads all 30 CSV slots and the confirmed composition", () => {
    expect(INITIAL_PLAYER_ARMY_RECORDS).toHaveLength(30);
    expect(INITIAL_PLAYER_ARMY_RECORDS.map((record) => record.slot)).toEqual(
      Array.from({ length: 30 }, (_, index) => index),
    );
    expect(INITIAL_PLAYER_TECHNIQUE_COUNTS).toMatchObject({
      ASHIGARU_SPEAR_STRIKE: 8,
      ARCHER_ARROW: 4,
      ARCHER_LONG_SHOT: 3,
      TEPPOU_SHOOTING: 2,
      STRATEGIST_FIRE_PLAY: 2,
      STRATEGIST_FIRE_ATTACK: 2,
      NINJA_NINJUTSU: 2,
      GENERAL_COMMAND: 3,
      MOSA_SENPUU: 3,
      MOSA_MUSOU: 1,
    });
    expect(isInitialPlayerArmySetup(createInitialPlayerTeamArmySetup())).toBe(true);
    expect(INITIAL_PLAYER_TOTAL_STIPEND).toBe(17_996);
  });

  it("uses each CSV slot's stats, strategy, technique, raw flags and source position", () => {
    const army = createOriginalPlayerArmy(() => 0);
    const first = army[0];
    expect(first).toMatchObject({
      id: "player-0",
      controller: "player",
      unitType: "MOSA",
      technique: "MOSA_MUSOU",
      strategy: "melee",
      stats: { combat: 94, defense: 58, maxHp: 66, skill: 57, foot: 3 },
      originalSpecialAbilityCodes: [4, 18],
      stipend: 1088,
    });
    expect({ x: first.x, y: first.y }).toEqual(battlefieldSourcePointToWorld({ x: 720, y: 576 }));
    expect(army[24]).toMatchObject({
      unitType: "NINJA",
      technique: "NINJA_NINJUTSU",
      strategy: "charge",
      stats: { combat: 104, defense: 110, maxHp: 9, skill: 74, foot: 5 },
      originalSpecialAbilityCodes: [1, 14, 23],
      stipend: 1700,
    });
  });

  it("makes the default player factory use the CSV while preserving committed position overrides", () => {
    const initialPositions = [{ soldierId: "player-0", rosterIndex: 0, worldX: 321, worldY: 654 }];
    const army = createArmy("player", () => 0, { initialPositions });
    expect(army).toHaveLength(30);
    expect(army[0]).toMatchObject({ x: 321, y: 654, unitType: "MOSA", technique: "MOSA_MUSOU" });
    expect(army.filter((soldier) => soldier.unitType === "ASHIGARU")).toHaveLength(8);
    expect(army.filter((soldier) => soldier.unitType === "CAVALRY")).toHaveLength(0);
  });

  it("preserves every recovered CSV stipend without filling hidden inputs by inference", () => {
    const army = createOriginalPlayerArmy(() => 0);
    expect(army.map((soldier) => soldier.stipend)).toEqual(
      INITIAL_PLAYER_ARMY_RECORDS.map((record) => record.stipend),
    );
  });
});
