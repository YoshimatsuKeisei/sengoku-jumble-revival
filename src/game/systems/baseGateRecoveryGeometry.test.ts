import { describe, expect, it } from "vitest";
import { battlefieldSourcePointToWorld, battlefieldWorldPointToSource } from "../battlefieldLayout";
import { createSoldier } from "../entities/Soldier";
import { createBattleBases, resolveBaseAccessCollisions } from "./baseSystem";
import {
  getSwfHealingSlotPosition,
  updateEmergencyRetreat,
  updateHealing,
} from "./recoverySystem";
import { getSwfBaseCollisionCodeAtWorld } from "./swfBaseCollisionGrid";

const recoveryTileCases = [
  ["player", 216, 432, "TOP"],
  ["enemy", 1620, 432, "TOP"],
  ["player", 216, 756, "BOTTOM"],
  ["enemy", 1620, 756, "BOTTOM"],
] as const;

const rejoinCases = [
  ["player", 500, 397, 346, 249, "TOP"],
  ["player", 600, 782, 346, 946, "BOTTOM"],
  ["enemy", 500, 397, 1545, 249, "TOP"],
  ["enemy", 600, 782, 1545, 946, "BOTTOM"],
] as const;

describe("direct SWF headquarters collision barrier", () => {
  it.each([
    ["player", "player", 216, 540, 997, 1],
    ["enemy", "player", 216, 540, 997, 1],
    ["player", "enemy", 1620, 540, 996, -1],
    ["enemy", "enemy", 1620, 540, 996, -1],
  ] as const)("bounces a %s unit from the %s 996/997 wall even when it is not an attacking enemy", (team, baseTeam, sourceX, sourceY, code, sign) => {
    const bases = createBattleBases();
    const point = battlefieldSourcePointToWorld({ x: sourceX, y: sourceY });
    const soldier = createSoldier(`${team}-${baseTeam}-wall`, team, "ai", point.x, point.y);
    expect(getSwfBaseCollisionCodeAtWorld(soldier)).toBe(code);
    const before = battlefieldWorldPointToSource(soldier);

    resolveBaseAccessCollisions([soldier], bases);

    const after = battlefieldWorldPointToSource(soldier);
    expect(Math.sign(after.x - before.x)).toBe(sign);
    expect(Math.abs(after.x - before.x)).toBeGreaterThanOrEqual(10 - 1e-6);
    expect(soldier.baseContactLockTicks).toBe(10);
    expect(getSwfBaseCollisionCodeAtWorld(soldier)).not.toBe(code);
  });

  it("admits matching retreat through 999 but blocks a normal unit on the same cell", () => {
    const bases = createBattleBases();
    const point = battlefieldSourcePointToWorld({ x: 216, y: 432 });
    const retreat = createSoldier("player-3", "player", "ai", point.x, point.y);
    retreat.state = "EMERGENCY_RETREAT";
    const normal = createSoldier("player-4", "player", "ai", point.x, point.y);
    const retreatBefore = { x: retreat.x, y: retreat.y };
    const normalBefore = battlefieldWorldPointToSource(normal);

    resolveBaseAccessCollisions([retreat, normal], bases);

    expect({ x: retreat.x, y: retreat.y }).toEqual(retreatBefore);
    const normalAfter = battlefieldWorldPointToSource(normal);
    expect(normalAfter.x - normalBefore.x).toBeCloseTo(6, 6);
    expect(normal.baseContactLockTicks).toBe(10);
  });

  it("mirrors matching retreat admission through enemy tile 998", () => {
    const bases = createBattleBases();
    const point = battlefieldSourcePointToWorld({ x: 1620, y: 432 });
    const retreat = createSoldier("enemy-3", "enemy", "ai", point.x, point.y);
    retreat.state = "EMERGENCY_RETREAT";
    const normal = createSoldier("enemy-4", "enemy", "ai", point.x, point.y);
    const retreatBefore = { x: retreat.x, y: retreat.y };
    const normalBefore = battlefieldWorldPointToSource(normal);

    resolveBaseAccessCollisions([retreat, normal], bases);

    expect({ x: retreat.x, y: retreat.y }).toEqual(retreatBefore);
    const normalAfter = battlefieldWorldPointToSource(normal);
    expect(normalAfter.x - normalBefore.x).toBeCloseTo(-6, 6);
    expect(normal.baseContactLockTicks).toBe(10);
  });
});

describe("direct SWF recovery entry and exit geometry", () => {
  it.each(recoveryTileCases)("admits %s retreat through its confirmed recovery tile at source (%i,%i)", (team, sourceX, sourceY, gate) => {
    const bases = createBattleBases();
    const point = battlefieldSourcePointToWorld({ x: sourceX, y: sourceY });
    const soldier = createSoldier(`${team}-1`, team, "ai", point.x, point.y);
    soldier.state = "EMERGENCY_RETREAT";
    soldier.recoveryGate = gate;
    updateEmergencyRetreat(soldier, bases, () => 1, [soldier]);
    expect(soldier.state).toBe("HEALING");
    expect(soldier.recoveryGate).toBe(gate);
    expect(soldier.x).toBeCloseTo(getSwfHealingSlotPosition(soldier).x, 6);
    expect(soldier.y).toBeCloseTo(getSwfHealingSlotPosition(soldier).y, 6);
  });

  it("does not treat an alpha-derived visual corridor as recovery admission by itself", () => {
    const bases = createBattleBases();
    const point = battlefieldSourcePointToWorld({ x: 180, y: 450 });
    const soldier = createSoldier("player-14", "player", "ai", point.x, point.y);
    soldier.state = "EMERGENCY_RETREAT";
    updateEmergencyRetreat(soldier, bases, () => 1, [soldier]);
    expect(soldier.state).toBe("EMERGENCY_RETREAT");
  });

  it.each(rejoinCases)("moves healed %s through the SWF p7-equivalent %s route", (team, sourceY, interiorY, targetX, targetY, gate) => {
    const bases = createBattleBases();
    const start = battlefieldSourcePointToWorld({ x: team === "player" ? 100 : 1650, y: sourceY });
    const soldier = createSoldier(`${team}-2`, team, "ai", start.x, start.y);
    soldier.state = "HEALING";
    soldier.recoveryGate = gate;
    soldier.recoveryGateEntered = true;
    soldier.hp = soldier.maxHp;
    updateHealing(soldier, 1 / 24, bases);
    expect(soldier.state).toBe("REJOINING");
    expect(battlefieldWorldPointToSource(soldier).y).toBeCloseTo(interiorY, 6);
    const target = battlefieldWorldPointToSource({ x: soldier.moveTargetX!, y: soldier.moveTargetY! });
    expect(target.x).toBeCloseTo(targetX, 6);
    expect(target.y).toBeCloseTo(targetY, 6);
  });
});

describe("direct SWF deterministic field-hospital slots", () => {
  it("maps the protagonist and m27 swap plus ordinary player/enemy roster indices exactly", () => {
    const cases = [
      [createSoldier("player-0", "player", "player", 0, 0), 193, 600],
      [createSoldier("player-27", "player", "ai", 0, 0), 68, 480],
      [createSoldier("player-1", "player", "ai", 0, 0), 68, 540],
      [createSoldier("enemy-0", "enemy", "ai", 0, 0), 1647, 480],
      [createSoldier("enemy-29", "enemy", "ai", 0, 0), 1772, 720],
    ] as const;

    for (const [soldier, expectedX, expectedY] of cases) {
      const source = battlefieldWorldPointToSource(getSwfHealingSlotPosition(soldier));
      expect(source.x).toBeCloseTo(expectedX, 6);
      expect(source.y).toBeCloseTo(expectedY, 6);
    }
  });

  it.each(["player", "enemy"] as const)("produces 30 deterministic unique %s healing positions", (team) => {
    const keys = new Set<string>();
    for (let index = 0; index < 30; index += 1) {
      const soldier = createSoldier(`${team}-${index}`, team, team === "player" && index === 0 ? "player" : "ai", 0, 0);
      const source = battlefieldWorldPointToSource(getSwfHealingSlotPosition(soldier));
      keys.add(`${Math.round(source.x)},${Math.round(source.y)}`);
    }
    expect(keys.size).toBe(30);
  });
});
