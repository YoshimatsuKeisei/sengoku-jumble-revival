import { describe, expect, it } from "vitest";
import { BASE_CONFIG, BATTLE_OBSTACLES, SOLDIER_RADIUS } from "../config";
import { createSoldier } from "../entities/Soldier";
import type { BaseGate, Team } from "../types";
import { createBattleBases, getBaseForTeam } from "./baseSystem";
import {
  distanceToRect,
  getBaseGatePoint,
  getBaseHealingInteriorRect,
  getBaseLowerGateRect,
  getBaseRect,
  getBaseUpperGateRect,
  hasClearedBaseGateBoundary,
  isPointInsideRect,
} from "./battlefieldGeometry";
import { circleIntersectsObstacle } from "./movementSystem";
import { chooseHealingSlotPosition, updateEmergencyRetreat, updateHealing } from "./recoverySystem";

const gateCases = [
  ["player", "TOP"],
  ["player", "BOTTOM"],
  ["enemy", "TOP"],
  ["enemy", "BOTTOM"],
] as const satisfies ReadonlyArray<readonly [Team, BaseGate]>;

function gateRect(team: Team, gate: BaseGate) {
  const base = getBaseForTeam(createBattleBases(), team);
  return gate === "TOP" ? getBaseUpperGateRect(base) : getBaseLowerGateRect(base);
}

function entryPosition(team: Team, gate: BaseGate, clearanceDelta: number) {
  const rect = gateRect(team, gate);
  return {
    x: rect.x + rect.width / 2,
    y: gate === "TOP"
      ? rect.y + rect.height + SOLDIER_RADIUS + clearanceDelta
      : rect.y - SOLDIER_RADIUS - clearanceDelta,
  };
}

describe("base gate crossing geometry", () => {
  it.each(gateCases)("does not admit %s through %s before the horizontal fence is cleared", (team, gate) => {
    const bases = createBattleBases();
    const base = getBaseForTeam(bases, team);
    const soldier = createSoldier(`${team}-${gate}`, team, "player", 0, 0);
    soldier.state = "EMERGENCY_RETREAT";
    Object.assign(soldier, entryPosition(team, gate, -0.01));
    expect(hasClearedBaseGateBoundary(soldier, base, gate, "ENTER")).toBe(false);
    updateEmergencyRetreat(soldier, bases, () => 1, [soldier]);
    expect(soldier.state).toBe("EMERGENCY_RETREAT");
  });

  it.each(gateCases)("admits %s through %s after the horizontal fence is cleared", (team, gate) => {
    const bases = createBattleBases();
    const base = getBaseForTeam(bases, team);
    const soldier = createSoldier(`${team}-${gate}`, team, "player", 0, 0);
    soldier.state = "EMERGENCY_RETREAT";
    Object.assign(soldier, entryPosition(team, gate, 0));
    updateEmergencyRetreat(soldier, bases, () => 1, [soldier]);
    expect(soldier.state).toBe("HEALING");
    expect(soldier.recoveryGate).toBe(gate);
    expect(isPointInsideRect(soldier, getBaseHealingInteriorRect(base))).toBe(true);
  });

  it.each(gateCases)("does not admit %s beside the %s fence corridor", (team, gate) => {
    const bases = createBattleBases();
    const base = getBaseForTeam(bases, team);
    const position = entryPosition(team, gate, 0);
    const rect = gateRect(team, gate);
    const soldier = createSoldier(`${team}-${gate}`, team, "player", rect.x - SOLDIER_RADIUS - 0.01, position.y);
    soldier.state = "EMERGENCY_RETREAT";
    updateEmergencyRetreat(soldier, bases, () => 1, [soldier]);
    expect(soldier.state).toBe("EMERGENCY_RETREAT");
  });

  it.each(gateCases)("returns healed %s instantly through the stored %s gate", (team, gate) => {
    const bases = createBattleBases();
    const base = getBaseForTeam(bases, team);
    const interior = getBaseHealingInteriorRect(base);
    const soldier = createSoldier(`${team}-${gate}`, team, "ai", interior.x, interior.y);
    soldier.state = "HEALING";
    soldier.recoveryGate = gate;
    soldier.recoveryGateEntered = true;
    soldier.hp = soldier.maxHp - 1;
    updateHealing(soldier, 1, bases);
    expect(soldier.state).toBe("NORMAL");
    expect({ x: soldier.x, y: soldier.y }).toEqual(getBaseGatePoint(base, gate, false));
    expect(soldier.recoveryGate).toBeNull();
  });
});

describe("safe base recovery slots", () => {
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
