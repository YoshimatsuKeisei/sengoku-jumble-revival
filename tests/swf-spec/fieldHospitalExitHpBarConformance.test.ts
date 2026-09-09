import { describe, expect, it } from "vitest";
import { battlefieldWorldPointToSource } from "../../src/game/battlefieldLayout";
import { createSoldier } from "../../src/game/entities/Soldier";
import type { ControllerType, Soldier, Team } from "../../src/game/types";
import { createBattleBases } from "../../src/game/systems/baseSystem";
import {
  getSwfHealingSlotPosition,
  updateHealing,
  updateRejoining,
} from "../../src/game/systems/recoverySystem";
import {
  getSwfBaseCollisionCell,
  getSwfBaseCollisionCodeAtWorld,
} from "../../src/game/systems/swfBaseCollisionGrid";
import {
  SWF_UNIT_HP_BAR_COLORS,
  SWF_UNIT_HP_BAR_COLOR_TRANSFORM,
  SWF_UNIT_HP_BAR_LOCAL_SCALE,
  SWF_UNIT_HP_BAR_SOURCE_OFFSET,
  getUnitHpFillWidth,
} from "../../src/game/rendering/battleUnitUiAssets";
import baseSpec from "../../swf-spec/rules/bases.json";

function healingUnit(id: string, team: Team = "player", controller: ControllerType = "ai"): Soldier {
  const soldier = createSoldier(id, team, controller, 0, 0);
  soldier.maxHp = 100;
  soldier.hp = 19;
  soldier.hpBarHp = 19;
  soldier.state = "HEALING";
  Object.assign(soldier, getSwfHealingSlotPosition(soldier));
  return soldier;
}

function sourceTarget(soldier: Soldier): { x: number; y: number } {
  expect(soldier.moveTargetX).not.toBeNull();
  expect(soldier.moveTargetY).not.toBeNull();
  return battlefieldWorldPointToSource({ x: soldier.moveTargetX!, y: soldier.moveTargetY! });
}

function expectSourcePoint(point: { x: number; y: number }, x: number, y: number): void {
  expect(point.x).toBeCloseTo(x, 6);
  expect(point.y).toBeCloseTo(y, 6);
}

function completeHealingToP7(soldier: Soldier): void {
  soldier.hp = soldier.maxHp;
  soldier.hpBarHp = soldier.maxHp;
  updateHealing(soldier, 1 / 24, createBattleBases());
  expect(soldier.state).toBe("REJOINING");
}

describe("SWF conformance: field-hospital exit and unit HP bar", () => {
  it("records the direct p97/p98 HP-bar refresh and p7 exit metadata", () => {
    const rule = baseSpec.rules.find((candidate) => candidate.id === "FIELD_HOSPITAL_HEAL_AND_REJOIN");
    expect(rule?.status).toBe("confirmed");
    expect(rule?.expected.hpBarMovieClip).toBe("h");
    expect(rule?.expected.hpBarFrameExpression).toBe("101-floor(hp/mp*100)");
    expect(rule?.expected.hpBarRefreshEveryHealingLogicUpdate).toBe(true);
    expect(rule?.expected.exitSideSelectedFromHealingSlotY).toBe(true);
    expect(rule?.expected.exitReusesRecoveryTile998999).toBe(false);
    expect(rule?.expected.topP7StartCellY).toBe(11);
    expect(rule?.expected.bottomP7StartCellY).toBe(22);
  });

  it("refreshes the displayed HP during field-hospital healing and forces full on the p7 transition", () => {
    const soldier = healingUnit("player-0");

    updateHealing(soldier, 1 / 24, createBattleBases());
    expect(soldier.hp).toBeCloseTo(19.25, 8);
    expect(soldier.hpBarHp).toBeCloseTo(19.25, 8);
    expect(soldier.state).toBe("HEALING");

    soldier.hp = 99.75;
    soldier.hpBarHp = 19.25;
    updateHealing(soldier, 1 / 24, createBattleBases());
    expect(soldier.hp).toBe(100);
    expect(soldier.hpBarHp).toBe(100);
    expect(soldier.state).toBe("HEALING");

    updateHealing(soldier, 1 / 24, createBattleBases());
    expect(soldier.hp).toBe(100);
    expect(soldier.hpBarHp).toBe(100);
    expect(soldier.state).toBe("REJOINING");
  });

  it("selects TOP for hospital rows 480/540 and BOTTOM for 600/660/720, independent of the entry gate", () => {
    const expected = ["TOP", "TOP", "BOTTOM", "BOTTOM", "BOTTOM"] as const;
    for (let row = 0; row < 5; row += 1) {
      const soldier = healingUnit(`player-${row}`);
      soldier.recoveryGate = expected[row] === "TOP" ? "BOTTOM" : "TOP";
      completeHealingToP7(soldier);
      expect(soldier.recoveryGate).toBe(expected[row]);
      expect(battlefieldWorldPointToSource(soldier).y).toBeCloseTo(expected[row] === "TOP" ? 397 : 782, 6);
    }
  });

  it("puts p7 into zero-code row 11/22 cells rather than reversing through recovery tile 999/998", () => {
    const playerTopCells: number[] = [];
    const playerBottomCells: number[] = [];
    const enemyTopCells: number[] = [];
    const enemyBottomCells: number[] = [];

    for (let column = 0; column < 6; column += 1) {
      const topIndex = column * 5;
      const playerTop = healingUnit(`player-${topIndex}`);
      completeHealingToP7(playerTop);
      const playerTopCell = getSwfBaseCollisionCell(playerTop);
      playerTopCells.push(playerTopCell.x);
      expect(playerTopCell.y).toBe(11);
      expect(getSwfBaseCollisionCodeAtWorld(playerTop)).toBeNull();

      const playerBottom = column < 5
        ? healingUnit(`player-${column * 5 + 2}`)
        : healingUnit("player-0", "player", "player");
      completeHealingToP7(playerBottom);
      const playerBottomCell = getSwfBaseCollisionCell(playerBottom);
      playerBottomCells.push(playerBottomCell.x);
      expect(playerBottomCell.y).toBe(22);
      expect(getSwfBaseCollisionCodeAtWorld(playerBottom)).toBeNull();

      const enemyTop = healingUnit(`enemy-${topIndex}`, "enemy");
      completeHealingToP7(enemyTop);
      const enemyTopCell = getSwfBaseCollisionCell(enemyTop);
      enemyTopCells.push(enemyTopCell.x);
      expect(enemyTopCell.y).toBe(11);
      expect(getSwfBaseCollisionCodeAtWorld(enemyTop)).toBeNull();

      const enemyBottom = healingUnit(`enemy-${column * 5 + 2}`, "enemy");
      completeHealingToP7(enemyBottom);
      const enemyBottomCell = getSwfBaseCollisionCell(enemyBottom);
      enemyBottomCells.push(enemyBottomCell.x);
      expect(enemyBottomCell.y).toBe(22);
      expect(getSwfBaseCollisionCodeAtWorld(enemyBottom)).toBeNull();
    }

    expect(playerTopCells).toEqual([2, 3, 3, 4, 5, 5]);
    expect(playerBottomCells).toEqual([2, 3, 3, 4, 5, 5]);
    expect(enemyTopCells).toEqual([46, 46, 47, 48, 49, 49]);
    expect(enemyBottomCells).toEqual([46, 46, 47, 48, 49, 49]);
  });

  it("moves the protagonist to the BOTTOM p7 route immediately but does not instantly finish rejoining", () => {
    const soldier = healingUnit("player-0", "player", "player");
    expectSourcePoint(battlefieldWorldPointToSource(soldier), 193, 600);
    soldier.recoveryGate = "TOP";
    completeHealingToP7(soldier);

    expect(soldier.recoveryGate).toBe("BOTTOM");
    expectSourcePoint(battlefieldWorldPointToSource(soldier), 193, 782);
    expectSourcePoint(sourceTarget(soldier), 346, 946);
    expect(getSwfBaseCollisionCell(soldier)).toEqual({ x: 5, y: 22 });
    expect(getSwfBaseCollisionCodeAtWorld(soldier)).toBeNull();

    updateRejoining(soldier, createBattleBases());
    expect(soldier.state).toBe("REJOINING");
  });

  it("reproduces the h placement, color transform, and recovered 100-frame fill widths", () => {
    expect(SWF_UNIT_HP_BAR_SOURCE_OFFSET).toEqual({ x: -6, y: -26 });
    expect(SWF_UNIT_HP_BAR_LOCAL_SCALE.x).toBeCloseTo(0.4666595458984375, 12);
    expect(SWF_UNIT_HP_BAR_LOCAL_SCALE.y).toBeCloseTo(1.0000457763671875, 12);
    expect(SWF_UNIT_HP_BAR_COLOR_TRANSFORM).toMatchObject({
      multiplier: { r: 230, g: 230, b: 230, a: 256 },
      additive: { r: -79, g: 0, b: 83, a: 0 },
      divisor: 256,
    });
    expect(SWF_UNIT_HP_BAR_COLORS).toEqual({ empty: 0x000053, fill: 0x4c9bee });
    expect(getUnitHpFillWidth(100, 100)).toBeCloseTo(29.9932861328125, 8);
    expect(getUnitHpFillWidth(50, 100)).toBeCloseTo(15.09765625, 8);
    expect(getUnitHpFillWidth(1, 100)).toBeCloseTo(0.4998779296875, 8);
  });
});
