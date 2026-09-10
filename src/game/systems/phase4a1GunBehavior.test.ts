import { describe, expect, it } from "vitest";
import { GUN_CONFIG } from "../config";
import { createSoldier } from "../entities/Soldier";
import type { SoldierLoadout } from "../types";
import { executeGunAttack, getGunMovementDecision, getGunRange } from "./gunAttackSystem";
import { moveAiSoldiers, movePlayer } from "./movementSystem";
import { getRangedHoldMarginWorld } from "./techniqueCombatProfiles";
import { LOADOUT_PANEL_KEY } from "../ui/playerLoadoutPanel";

const gunLoadout = (technique: "TEPPOU_SHOOTING" | "TEPPOU_SNIPING"): SoldierLoadout => ({
  unitType: "TEPPOU", technique,
  stats: { maxHp: 60, skill: 50, foot: 3, combat: 50, defense: 50 }, specialAbilities: [],
});

describe("Phase 4A.1 gun hold, facing, and loadout key", () => {
  it("uses L rather than F3 for the loadout panel", () => {
    expect(LOADOUT_PANEL_KEY).toBe("L"); expect(LOADOUT_PANEL_KEY).not.toBe("F3");
  });
  it.each(["TEPPOU_SHOOTING", "TEPPOU_SNIPING"] as const)("derives %s hold/advance decisions from the raw source-scaled range", (technique) => {
    const gun = createSoldier("g", "player", "ai", 100, 100, "charge", undefined, gunLoadout(technique));
    const range = getGunRange(technique)!;
    const holdMargin = getRangedHoldMarginWorld();
    const inRange = createSoldier("in", "enemy", "ai", gun.x + range - holdMargin - 1, gun.y);
    const outside = createSoldier("out", "enemy", "ai", gun.x + range + 1, gun.y);
    expect(getGunMovementDecision(gun, inRange)).toBe("HOLD_IN_RANGE");
    expect(getGunMovementDecision(gun, outside)).toBe("ADVANCE_TO_RANGE");
  });
  it("holds in range without advancing or backing away", () => {
    const gun = createSoldier("g", "player", "ai", 100, 100, "charge", undefined, gunLoadout("TEPPOU_SHOOTING"));
    const range = getGunRange("TEPPOU_SHOOTING")!;
    const enemy = createSoldier("e", "enemy", "ai", gun.x + range - getRangedHoldMarginWorld() - 1, gun.y + 1);
    gun.targetId = enemy.id; gun.moveTargetX = enemy.x; gun.moveTargetY = enemy.y;
    const before = { x: gun.x, y: gun.y };
    moveAiSoldiers([gun, enemy], 1);
    expect({ x: gun.x, y: gun.y }).toEqual(before);
    expect(gun.facingX).toBeGreaterThan(0);
  });
  it("gives normal contact combat priority over range hold", () => {
    const gun = createSoldier("g", "player", "ai", 100, 100, "charge", undefined, gunLoadout("TEPPOU_SHOOTING"));
    const enemy = createSoldier("e", "enemy", "ai", 110, 100);
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
    const event = executeGunAttack(gun, enemy, 0, () => 1, false)!;
    expect(gun.aimX).toBe(0); expect(gun.aimY).toBe(1); expect(gun.facingY).toBe(1);
    expect(event.x).toBe(100); expect(event.y).toBe(116);
    expect(event.targetX - event.x).toBeCloseTo(0); expect(event.smoke && event.shotLine && event.shooterFlash).toBe(true);
    expect(GUN_CONFIG.shootingRange).toBeLessThan(GUN_CONFIG.snipingRange);
  });
});
