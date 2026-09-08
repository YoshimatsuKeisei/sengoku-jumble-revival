import { describe, expect, it } from "vitest";
import { battlefieldSourcePointToWorld, battlefieldWorldPointToSource } from "../../src/game/battlefieldLayout";
import { createSoldier } from "../../src/game/entities/Soldier";
import type { Soldier } from "../../src/game/types";
import { createBattleBases } from "../../src/game/systems/baseSystem";
import { getSwfHealingSlotPosition, updateHealing, updateRejoining } from "../../src/game/systems/recoverySystem";
import baseSpec from "../../swf-spec/rules/bases.json";

function unit(id: string, team: "player" | "enemy", sourceX: number, sourceY: number): Soldier {
  const world = battlefieldSourcePointToWorld({ x: sourceX, y: sourceY });
  const soldier = createSoldier(id, team, "ai", world.x, world.y);
  soldier.maxHp = 100;
  soldier.hp = 50;
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

describe("SWF conformance: field-hospital healing and rejoin", () => {
  it("records the direct SWF healing/rejoin constants", () => {
    const rule = baseSpec.rules.find((candidate) => candidate.id === "FIELD_HOSPITAL_HEAL_AND_REJOIN");
    expect(rule?.status).toBe("confirmed");
    expect(rule?.expected.healPerLogicUpdateMaxHpFraction).toBe(1 / 400);
    expect(rule?.expected.recoveryBoostMultiplier).toBe(2);
    expect(rule?.expected.exitRequiresHpStrictlyGreaterThanMaxHp).toBe(true);
    expect(rule?.expected.healingPlacementRandomized).toBe(false);
    expect(rule?.expected.rejoinState).toBe(7);
    expect(rule?.expected.playerRejoinTargetX).toBe(346);
    expect(rule?.expected.enemyRejoinTargetX).toBe(1545);
    expect(rule?.expected.rejoinCompletionManhattanDistance).toEqual({ operator: "<", value: 50 });
  });

  it("places p97/p98 soldiers at the exact roster-fixed AVM1 hospital coordinates", () => {
    const rule = baseSpec.rules.find((candidate) => candidate.id === "FIELD_HOSPITAL_HEAL_AND_REJOIN");
    expect(rule?.expected.playerHealingGrid).toMatchObject({
      baseX: 68, baseY: 480, columns: 6, rows: 5, columnStep: 25, rowStep: 60,
      protagonistEffectiveIndex: 27, rawM27EffectiveIndex: 0,
    });
    expect(rule?.expected.enemyHealingGrid).toMatchObject({
      baseX: 1647, baseY: 480, columns: 6, rows: 5, columnStep: 25, rowStep: 60,
      localIndexExpression: "i-30",
    });

    const protagonist = createSoldier("player-0", "player", "player", 0, 0);
    const player27 = createSoldier("player-27", "player", "ai", 0, 0);
    const enemy29 = createSoldier("enemy-29", "enemy", "ai", 0, 0);
    expectSourcePoint(battlefieldWorldPointToSource(getSwfHealingSlotPosition(protagonist)), 193, 600);
    expectSourcePoint(battlefieldWorldPointToSource(getSwfHealingSlotPosition(player27)), 68, 480);
    expectSourcePoint(battlefieldWorldPointToSource(getSwfHealingSlotPosition(enemy29)), 1772, 720);
  });

  it("keeps player state 97 when healing lands exactly on max HP, then enters p7-equivalent rejoin on the next logic tick", () => {
    const bases = createBattleBases();
    const soldier = unit("player-heal-exit", "player", 100, 500);
    soldier.state = "HEALING";
    soldier.recoveryGate = "TOP";
    soldier.recoveryGateEntered = true;
    soldier.hp = soldier.maxHp - soldier.maxHp / 400;

    updateHealing(soldier, 1 / 24, bases);
    expect(soldier.hp).toBeCloseTo(soldier.maxHp, 8);
    expect(soldier.state).toBe("HEALING");

    updateHealing(soldier, 1 / 24, bases);
    expect(soldier.hp).toBe(soldier.maxHp);
    expect(soldier.state).toBe("REJOINING");
    expect(battlefieldWorldPointToSource(soldier).y).toBeCloseTo(397, 6);
    const target = sourceTarget(soldier);
    expect(target.x).toBeCloseTo(346, 6);
    expect(target.y).toBeCloseTo(249, 6);
  });

  it("uses the mirrored enemy lower-route p98 -> p7 exit coordinates", () => {
    const bases = createBattleBases();
    const soldier = unit("enemy-heal-exit", "enemy", 1650, 600);
    soldier.state = "HEALING";
    soldier.recoveryGate = "BOTTOM";
    soldier.recoveryGateEntered = true;
    soldier.hp = soldier.maxHp;

    updateHealing(soldier, 1 / 24, bases);
    expect(soldier.hp).toBe(soldier.maxHp);
    expect(soldier.state).toBe("REJOINING");
    expect(battlefieldWorldPointToSource(soldier).y).toBeCloseTo(782, 6);
    const target = sourceTarget(soldier);
    expect(target.x).toBeCloseTo(1545, 6);
    expect(target.y).toBeCloseTo(946, 6);
  });

  it("applies the confirmed s20 recovery multiplier as exactly two maxHp/400 increments per SWF logic tick", () => {
    const soldier = unit("recovery-boost", "player", 100, 500);
    soldier.state = "HEALING";
    soldier.specialAbilities = ["RECOVERY_BOOST"];
    const before = soldier.hp;

    updateHealing(soldier, 1 / 24, createBattleBases());
    expect(soldier.hp - before).toBeCloseTo(soldier.maxHp / 200, 8);
    expect(soldier.state).toBe("HEALING");
  });

  it("keeps p7-equivalent rejoin at exactly 50 source Manhattan units and restores normal behavior below 50", () => {
    const bases = createBattleBases();
    const soldier = unit("player-rejoin", "player", 296, 249);
    soldier.state = "REJOINING";
    soldier.strategy = "defend";

    updateRejoining(soldier, bases);
    expect(soldier.state).toBe("REJOINING");
    const target = sourceTarget(soldier);
    expect(target.x).toBeCloseTo(346, 6);
    expect(target.y).toBeCloseTo(249, 6);

    const inside = battlefieldSourcePointToWorld({ x: 297, y: 249 });
    soldier.x = inside.x;
    soldier.y = inside.y;
    updateRejoining(soldier, bases);
    expect(soldier.state).toBe("NORMAL");
    expect(soldier.strategy).toBe("defend");
    expect(soldier.moveTargetX).toBeNull();
    expect(soldier.moveTargetY).toBeNull();
  });
});
