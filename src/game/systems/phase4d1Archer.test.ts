import { describe, expect, it } from "vitest";
import { ARCHER_CONFIG, BATTLE_RANGE_UNIT_PX, GUN_CONFIG } from "../config";
import { createSoldier } from "../entities/Soldier";
import { createArmy } from "../factories/createArmy";
import { createArcherStats } from "../stats/archerStats";
import type { SoldierLoadout } from "../types";
import { createDefaultTeamArmySetup, getArmySetupTotal, isValidTeamArmySetup } from "./armySetupSystem";
import { calculateArrowDamage, executeArrowAttack, getArrowMovementDecision, resolveArrowDefense, updateArrowProjectile } from "./arrowAttackSystem";
import { formatSoldierInspector } from "./soldierInspectorSystem";
import { isTechniqueCompatibleWithUnitType, makePlayerDebugPreset, UNIT_DEFINITIONS } from "./unitLoadoutSystem";

const archer = (technique: "ARCHER_ARROW" | "ARCHER_LONG_SHOT" = "ARCHER_ARROW", abilities: SoldierLoadout["specialAbilities"] = []): SoldierLoadout => ({
  unitType: "ARCHER", technique, stats: { maxHp: 90, skill: 90, foot: 3, combat: 85, defense: 85 }, specialAbilities: abilities,
});

describe("Phase 4D-1 archer", () => {
  it("defines compatible archer techniques and a cap of 30", () => {
    expect(isTechniqueCompatibleWithUnitType("ARCHER", "ARCHER_ARROW")).toBe(true);
    expect(isTechniqueCompatibleWithUnitType("ARCHER", "ARCHER_LONG_SHOT")).toBe(true);
    expect(isTechniqueCompatibleWithUnitType("ARCHER", "TEPPOU_SHOOTING")).toBe(false);
    expect(isTechniqueCompatibleWithUnitType("TEPPOU", "ARCHER_ARROW")).toBe(false);
    expect(UNIT_DEFINITIONS.ARCHER.maxPerTeam).toBe(30);
  });
  it("generates deterministic inclusive archer stats", () => {
    expect(createArcherStats(() => 0)).toEqual({ maxHp: 70, skill: 70, combat: 60, defense: 60, foot: 2 });
    expect(createArcherStats(() => 0.999999)).toEqual({ maxHp: 110, skill: 110, combat: 110, defense: 110, foot: 4 });
  });
  it("derives three/five-unit ranges below gun ranges", () => {
    expect(ARCHER_CONFIG.arrowRange).toBe(BATTLE_RANGE_UNIT_PX * 3);
    expect(ARCHER_CONFIG.longShotRange).toBe(BATTLE_RANGE_UNIT_PX * 5);
    expect(ARCHER_CONFIG.arrowRange).toBeLessThan(ARCHER_CONFIG.longShotRange);
    expect(ARCHER_CONFIG.longShotRange).toBeLessThan(GUN_CONFIG.shootingRange);
  });
  it("applies might to both direct arrow techniques", () => {
    expect(calculateArrowDamage(createSoldier("a", "player", "ai", 0, 0, "melee", undefined, archer()))).toBe(1);
    expect(calculateArrowDamage(createSoldier("a", "player", "ai", 0, 0, "melee", undefined, archer("ARCHER_LONG_SHOT", ["MIGHT"])))).toBe(2);
  });
  it("only permits arrow defense through horo or foresight", () => {
    const target = createSoldier("t", "enemy", "ai", 50, 0); target.stats.defense = 100;
    expect(resolveArrowDefense(target, () => 0)).toBe("HIT");
    target.specialAbilities = ["FORESIGHT"]; expect(resolveArrowDefense(target, () => 0)).toBe("DEFENDED");
    target.specialAbilities = ["HORO"]; expect(resolveArrowDefense(target, () => 0.74)).toBe("DEFENDED");
    expect(resolveArrowDefense(target, () => 0.76)).toBe("HIT");
  });
  it("delays damage until impact and cancels healing targets", () => {
    const shooter = createSoldier("a", "player", "ai", 0, 0, "melee", undefined, archer());
    const target = createSoldier("t", "enemy", "ai", 60, 0); const hp = target.hp;
    const launch = executeArrowAttack(shooter, target, 0, () => 1)!;
    expect(target.hp).toBe(hp); expect(updateArrowProjectile(launch.projectile, [shooter, target], 1, 1, () => 1).active).toBe(true);
    const result = updateArrowProjectile(launch.projectile, [shooter, target], 10_000, 10_001, () => 1);
    expect(result.impact).toMatchObject({ defended: false, targetId: "t" }); expect(target.hp).toBe(hp - 1);
    const second = executeArrowAttack(shooter, target, shooter.specialReadyAt, () => 1)!; target.state = "HEALING";
    expect(updateArrowProjectile(second.projectile, [shooter, target], 10_000, 20_000).impact).toBeNull();
  });
  it("holds at range, but yields to normal contact combat", () => {
    const shooter = createSoldier("a", "player", "ai", 0, 0, "melee", undefined, archer());
    const target = createSoldier("t", "enemy", "ai", 60, 0);
    expect(getArrowMovementDecision(shooter, target)).toBe("HOLD_IN_RANGE");
    target.x = shooter.attackRange; expect(getArrowMovementDecision(shooter, target)).toBe("NORMAL_COMBAT");
  });
  it("keeps default armies unchanged and supports archer composition/player override", () => {
    const setup = createDefaultTeamArmySetup();
    expect(setup.techniqueCounts).toMatchObject({ PROTOTYPE_AREA: 23, TEPPOU_BOMBARDMENT: 6, CAVALRY_CHARGE: 1, ARCHER_ARROW: 0, ARCHER_LONG_SHOT: 0 });
    expect(getArmySetupTotal(setup)).toBe(30);
    setup.techniqueCounts.PROTOTYPE_AREA = 17; setup.techniqueCounts.ARCHER_ARROW = 3; setup.techniqueCounts.ARCHER_LONG_SHOT = 3;
    expect(isValidTeamArmySetup(setup)).toBe(true);
    const army = createArmy("player", () => 0, { playerLoadout: makePlayerDebugPreset("ARCHER_LONG_SHOT") });
    expect(army).toHaveLength(30); expect(army[0].technique).toBe("ARCHER_LONG_SHOT"); expect(army.filter((s) => s.unitType === "CAVALRY")).toHaveLength(1);
    expect(formatSoldierInspector(army[0])).toContain("射程：約5マス / 133 px");
  });
});
