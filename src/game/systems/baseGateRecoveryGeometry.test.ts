import { describe, expect, it } from "vitest";
import { BASE_CONFIG, BATTLE_OBSTACLES, SOLDIER_RADIUS } from "../config";
import { battlefieldSourcePointToWorld, battlefieldWorldPointToSource } from "../battlefieldLayout";
import { createSoldier } from "../entities/Soldier";
import { createBattleBases, getBaseForTeam } from "./baseSystem";
import {
  distanceToRect,
  getBaseHealingInteriorRect,
  getBaseLowerGateRect,
  getBaseRect,
  getBaseUpperGateRect,
  isPointInsideRect,
} from "./battlefieldGeometry";
import { circleIntersectsObstacle } from "./movementSystem";
import { chooseHealingSlotPosition, updateEmergencyRetreat, updateHealing } from "./recoverySystem";

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

describe("direct SWF recovery entry and exit geometry", () => {
  it.each(recoveryTileCases)("admits %s retreat through its confirmed recovery tile at source (%i,%i)", (team, sourceX, sourceY, gate) => {
    const bases = createBattleBases();
    const point = battlefieldSourcePointToWorld({ x: sourceX, y: sourceY });
    const soldier = createSoldier(`${team}-${gate}`, team, "ai", point.x, point.y);
    soldier.state = "EMERGENCY_RETREAT";
    soldier.recoveryGate = gate;
    updateEmergencyRetreat(soldier, bases, () => 1, [soldier]);
    expect(soldier.state).toBe("HEALING");
    expect(soldier.recoveryGate).toBe(gate);
    expect(isPointInsideRect(soldier, getBaseHealingInteriorRect(getBaseForTeam(bases, team)))).toBe(true);
  });

  it("does not treat an alpha-derived visual corridor as recovery admission by itself", () => {
    const bases = createBattleBases();
    const point = battlefieldSourcePointToWorld({ x: 180, y: 450 });
    const soldier = createSoldier("visual-only", "player", "ai", point.x, point.y);
    soldier.state = "EMERGENCY_RETREAT";
    updateEmergencyRetreat(soldier, bases, () => 1, [soldier]);
    expect(soldier.state).toBe("EMERGENCY_RETREAT");
  });

  it.each(rejoinCases)("moves healed %s through the SWF p7-equivalent %s route", (team, sourceY, interiorY, targetX, targetY, gate) => {
    const bases = createBattleBases();
    const start = battlefieldSourcePointToWorld({ x: team === "player" ? 100 : 1650, y: sourceY });
    const soldier = createSoldier(`${team}-${gate}`, team, "ai", start.x, start.y);
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

describe("safe reconstructed healing slots", () => {
  it.each(["player", "enemy"] as const)("keeps 30 %s recovery slots inside all radius-safe bounds", (team) => {
    const base = getBaseForTeam(createBattleBases(), team);
    const safe = getBaseHealingInteriorRect(base);
    const outer = getBaseRect(base);
    const topFence = getBaseUpperGateRect(base);
    const bottomFence = getBaseLowerGateRect(base);
    const occupied: ReturnType<typeof createSoldier>[] = [];

    for (let index = 0; index < 30; index += 1) {
      const slot = chooseHealingSlotPosition(base, occupied, () => 0);
      const soldier = createSoldier(`${team}-${index}`, team, "ai", slot.x, slot.y);
      soldier.state = "HEALING";
      expect(isPointInsideRect(slot, safe)).toBe(true);
      expect(slot.x - SOLDIER_RADIUS).toBeGreaterThanOrEqual(outer.x);
      expect(slot.x + SOLDIER_RADIUS).toBeLessThanOrEqual(outer.x + outer.width);
      expect(slot.y - SOLDIER_RADIUS).toBeGreaterThanOrEqual(outer.y);
      expect(slot.y + SOLDIER_RADIUS).toBeLessThanOrEqual(outer.y + outer.height);
      expect(distanceToRect(slot, topFence)).toBeGreaterThanOrEqual(SOLDIER_RADIUS);
      expect(distanceToRect(slot, bottomFence)).toBeGreaterThanOrEqual(SOLDIER_RADIUS);
      expect(BATTLE_OBSTACLES.some((obstacle) => circleIntersectsObstacle(slot.x, slot.y, SOLDIER_RADIUS, obstacle))).toBe(false);
      expect(occupied.every((other) => Math.hypot(slot.x - other.x, slot.y - other.y) >= BASE_CONFIG.healingMinSpacing)).toBe(true);
      occupied.push(soldier);
    }
  });
});
