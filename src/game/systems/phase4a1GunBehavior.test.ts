import { describe, expect, it } from "vitest";
import { GUN_CONFIG } from "../config";
import { createSoldier } from "../entities/Soldier";
import type { SoldierLoadout } from "../types";
import { executeGunAttack, getGunMovementDecision } from "./gunAttackSystem";
import { moveAiSoldiers, movePlayer } from "./movementSystem";
import { LOADOUT_PANEL_KEY } from "../ui/playerLoadoutPanel";

const gunLoadout = (technique: "TEPPOU_SHOOTING" | "TEPPOU_SNIPING"): SoldierLoadout => ({
  unitType: "TEPPOU", technique,
  stats: { maxHp: 60, skill: 50, foot: 3, combat: 50, defense: 50 }, specialAbilities: [],
});

describe("Phase 4A.1 gun hold, facing, and loadout key", () => {
  it("uses L rather than F3 for the loadout panel", () => {
    expect(LOADOUT_PANEL_KEY).toBe("L"); expect(LOADOUT_PANEL_KEY).not.toBe("F3");
  });
  it.each([
    ["TEPPOU_SHOOTING", 300, "ADVANCE_TO_RANGE"], ["TEPPOU_SHOOTING", 239, "HOLD_IN_RANGE"],
    ["TEPPOU_SNIPING", 350, "ADVANCE_TO_RANGE"], ["TEPPOU_SNIPING", 339, "HOLD_IN_RANGE"],
  ] as const)("decides %s at distance %s", (technique, distance, expected) => {
    const gun = createSoldier("g", "player", "ai", 0, 0, "charge", undefined, gunLoadout(technique));
    const enemy = createSoldier("e", "enemy", "ai", distance, 0);
    expect(getGunMovementDecision(gun, enemy)).toBe(expected);
  });
  it("holds in range without advancing or backing away, then advances when target leaves range", () => {
    const gun = createSoldier("g", "player", "ai", 0, 0, "charge", undefined, gunLoadout("TEPPOU_SHOOTING"));
    const enemy = createSoldier("e", "enemy", "ai", 200, 30); gun.targetId = enemy.id; gun.moveTargetX = 500; gun.moveTargetY = 0;
    moveAiSoldiers([gun, enemy], 1); expect({ x: gun.x, y: gun.y }).toEqual({ x: 0, y: 0 });
    expect(gun.facingY).toBeGreaterThan(0);
    enemy.x = 100; moveAiSoldiers([gun, enemy], 1); expect(gun.x).toBe(0);
    enemy.x = 300; enemy.y = 0; moveAiSoldiers([gun, enemy], 1); expect(gun.x).toBeGreaterThan(0);
  });
  it("gives contact combat priority over range hold", () => {
    const gun = createSoldier("g", "player", "ai", 0, 0, "charge", undefined, gunLoadout("TEPPOU_SHOOTING"));
    const enemy = createSoldier("e", "enemy", "ai", gun.attackRange, 0);
    expect(getGunMovementDecision(gun, enemy)).toBe("NORMAL_COMBAT");
  });
  it("updates player gun facing from cardinal and diagonal manual movement", () => {
    const gun = createSoldier("g", "player", "player", 100, 100, "melee", undefined, gunLoadout("TEPPOU_SHOOTING"));
    movePlayer(gun, -1, 0, 0.1); expect(gun.facingX).toBe(-1); expect(gun.facingY).toBe(0);
    movePlayer(gun, 1, -1, 0.1); expect(gun.facingX).toBeCloseTo(Math.SQRT1_2); expect(gun.facingY).toBeCloseTo(-Math.SQRT1_2);
    gun.state = "EMERGENCY_RETREAT"; movePlayer(gun, 0, 1, 0.1); expect(gun.facingY).toBe(1);
  });
  it("aims at target, places muzzle on aim axis, and returns gun visual feedback", () => {
    const gun = createSoldier("g", "player", "ai", 100, 100, "melee", undefined, gunLoadout("TEPPOU_SHOOTING"));
    const enemy = createSoldier("e", "enemy", "ai", 100, 200);
    const event = executeGunAttack(gun, enemy, 0, () => 1)!;
    expect(gun.aimX).toBe(0); expect(gun.aimY).toBe(1); expect(gun.facingY).toBe(1);
    expect(event.x).toBe(100); expect(event.y).toBe(116);
    expect(event.targetX - event.x).toBeCloseTo(0); expect(event.smoke && event.shotLine && event.shooterFlash).toBe(true);
    expect(GUN_CONFIG.shootingRange).toBeLessThan(GUN_CONFIG.snipingRange);
  });
});
