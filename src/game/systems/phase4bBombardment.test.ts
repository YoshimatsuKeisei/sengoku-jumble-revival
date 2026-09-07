import { describe, expect, it } from "vitest";
import { GUN_CONFIG, SPECIAL_ATTACK_CONFIG } from "../config";
import { createSoldier } from "../entities/Soldier";
import { createArmy } from "../factories/createArmy";
import type { SoldierLoadout } from "../types";
import { createDefaultArmySetup, createDefaultTeamArmySetup, getArmySetupTotal, isValidTeamArmySetup, techniqueSlotsForTeam, validateArmySetup } from "./armySetupSystem";
import { BOMBARDMENT_DAMAGE_COMPONENTS, calculateBombardmentPrimaryDamage, calculateGunDirectDamage, executeGunAttack, getGunMovementDecision, getGunRange } from "./gunAttackSystem";
import { formatSoldierInspector } from "./soldierInspectorSystem";
import { isTechniqueCompatibleWithUnitType, makePlayerDebugPreset, TECHNIQUE_DEFINITIONS } from "./unitLoadoutSystem";
import { getRangedHoldMarginWorld, getTechniqueAreaWorld } from "./techniqueCombatProfiles";

const loadout = (technique: "TEPPOU_SHOOTING" | "TEPPOU_SNIPING" | "TEPPOU_BOMBARDMENT", abilities: SoldierLoadout["specialAbilities"] = []): SoldierLoadout => ({
  unitType: "TEPPOU", technique, stats: { maxHp: 60, skill: 50, foot: 3, combat: 50, defense: 100 }, specialAbilities: abilities,
});

describe("Phase 4B bombardment and army setup", () => {
  it("defines compatible bombardment metadata with the confirmed nine-cell range", () => {
    expect(isTechniqueCompatibleWithUnitType("TEPPOU", "TEPPOU_BOMBARDMENT")).toBe(true);
    expect(isTechniqueCompatibleWithUnitType("PROTOTYPE", "TEPPOU_BOMBARDMENT")).toBe(false);
    expect(TECHNIQUE_DEFINITIONS.TEPPOU_BOMBARDMENT.label).toBe("砲撃");
    expect(getGunRange("TEPPOU_BOMBARDMENT")!).toBeGreaterThan(getGunRange("TEPPOU_SHOOTING")!);
    expect(getGunRange("TEPPOU_SNIPING")!).toBeGreaterThan(getGunRange("TEPPOU_BOMBARDMENT")!);
  });
  it("keeps explicit direct, fire, and explosion components", () => {
    expect(BOMBARDMENT_DAMAGE_COMPONENTS).toEqual({ DIRECT_SPECIAL: 1, FIRE: 1, EXPLOSION: 1 });
    const gun = createSoldier("g", "player", "ai", 0, 0, "melee", undefined, loadout("TEPPOU_BOMBARDMENT"));
    expect(calculateBombardmentPrimaryDamage(gun)).toBe(3);
    gun.specialAbilities = ["MIGHT"]; expect(calculateBombardmentPrimaryDamage(gun)).toBe(4);
  });
  it("applies might to shooting and sniping direct damage", () => {
    for (const technique of ["TEPPOU_SHOOTING", "TEPPOU_SNIPING"] as const) {
      const gun = createSoldier("g", "player", "ai", 0, 0, "melee", undefined, loadout(technique, ["MIGHT"]));
      expect(calculateGunDirectDamage(gun)).toBe(2);
    }
  });
  it("hits primary for three and nearby enemies for one with feedback and smoke events", () => {
    const gun = createSoldier("g", "player", "ai", 0, 0, "melee", undefined, loadout("TEPPOU_BOMBARDMENT"));
    gun.combatGauge = 201;
    const halfArea = getTechniqueAreaWorld("TEPPOU_BOMBARDMENT").width / 2;
    const primary = createSoldier("p", "enemy", "ai", 100, 0); const splash = createSoldier("s", "enemy", "ai", 100 + halfArea, 0);
    const outside = createSoldier("o", "enemy", "ai", 101 + halfArea, 0); const friendly = createSoldier("f", "player", "ai", 101, 0);
    const event = executeGunAttack(gun, primary, 0, () => 1, true, [gun, primary, splash, outside, friendly])!;
    expect(primary.hp).toBe(primary.maxHp - 3); expect(splash.hp).toBe(splash.maxHp - 1);
    expect(outside.hp).toBe(outside.maxHp); expect(friendly.hp).toBe(friendly.maxHp);
    expect(primary.combatFeedbackMarker).toBe("H"); expect(splash.combatFeedbackMarker).toBe("H");
    expect(primary.reactionState).toBe("HIT_STUN"); expect(splash.reactionState).toBe("HIT_STUN");
    expect(event.bombardmentVictimIds).toEqual(["p", "s"]); expect(event.primaryDefended).toBe(false);
    expect(event.bombardmentSmokeDurationMs).toBe(1_000);
  });
  it("primary defense shows only S and cancels every splash result", () => {
    const gun = createSoldier("g", "player", "ai", 0, 0, "melee", undefined, loadout("TEPPOU_BOMBARDMENT", ["MIGHT"]));
    gun.combatGauge = 201;
    const primary = createSoldier("p", "enemy", "ai", 100, 0); primary.unitType = "NINJA"; primary.specialAbilities = ["HORO"];
    const splash = createSoldier("s", "enemy", "ai", 110, 0);
    const event = executeGunAttack(gun, primary, 0, () => 1, true, [gun, primary, splash])!;
    expect(primary.hp).toBe(primary.maxHp); expect(primary.combatFeedbackMarker).toBe("S");
    expect(splash.hp).toBe(splash.maxHp); expect(splash.combatFeedbackMarker).toBeNull();
    expect(event.primaryDefended).toBe(true); expect(event.bombardmentVictimIds).toEqual([]);
    expect(event.smoke && event.shotLine && event.shooterFlash).toBe(true);
  });
  it("silently defends one splash victim without affecting other victims", () => {
    const gun = createSoldier("g", "player", "ai", 0, 0, "melee", undefined, loadout("TEPPOU_BOMBARDMENT"));
    gun.combatGauge = 201;
    const primary = createSoldier("p", "enemy", "ai", 100, 0); const hitA = createSoldier("a", "enemy", "ai", 110, 0);
    const defended = createSoldier("b", "enemy", "ai", 120, 0); defended.unitType = "NINJA"; defended.specialAbilities = ["HORO"];
    const hitC = createSoldier("c", "enemy", "ai", 130, 0);
    const event = executeGunAttack(gun, primary, 0, () => 1, true, [gun, primary, hitA, defended, hitC])!;
    expect(hitA.hp).toBe(hitA.maxHp - 1); expect(hitC.hp).toBe(hitC.maxHp - 1);
    expect(defended.hp).toBe(defended.maxHp); expect(defended.combatFeedbackMarker).toBeNull();
    expect(event.bombardmentVictimIds).toEqual(["p", "a", "c"]);
  });
  it("uses the three-cell impact rectangle, smoke duration, and range-hold behavior", () => {
    expect(getTechniqueAreaWorld("TEPPOU_BOMBARDMENT").width).toBeGreaterThan(SPECIAL_ATTACK_CONFIG.radius * 2);
    expect(GUN_CONFIG.bombardmentVictimSmokeDurationMs).toBe(1_000);
    const gun = createSoldier("g", "player", "ai", 0, 0, "charge", undefined, loadout("TEPPOU_BOMBARDMENT"));
    const range = getGunRange("TEPPOU_BOMBARDMENT")!;
    const enemy = createSoldier("e", "enemy", "ai", range, 0); expect(getGunMovementDecision(gun, enemy)).toBe("ADVANCE_TO_RANGE");
    enemy.x = range - getRangedHoldMarginWorld() - 1; expect(getGunMovementDecision(gun, enemy)).toBe("HOLD_IN_RANGE");
    enemy.x = 10; expect(getGunMovementDecision(gun, enemy)).toBe("NORMAL_COMBAT");
  });
  it("validates independent 30-soldier army setups", () => {
    const setup = createDefaultArmySetup(); expect(setup.player).not.toBe(setup.enemy);
    expect(getArmySetupTotal(setup.player)).toBe(30); expect(isValidTeamArmySetup(setup.player)).toBe(true);
    setup.player.defaultStrategy = "wait"; expect(setup.enemy.defaultStrategy).toBe("melee");
    setup.player.techniqueCounts.PROTOTYPE_AREA = 22; expect(isValidTeamArmySetup(setup.player)).toBe(false);
    setup.player.techniqueCounts.PROTOTYPE_AREA = 25; expect(isValidTeamArmySetup(setup.player)).toBe(false);
    setup.player.techniqueCounts.PROTOTYPE_AREA = 24; setup.player.techniqueCounts.TEPPOU_BOMBARDMENT = -1;
    expect(isValidTeamArmySetup(setup.player)).toBe(false);
    setup.player.techniqueCounts.TEPPOU_BOMBARDMENT = 5.5; expect(isValidTeamArmySetup(setup.player)).toBe(false);
  });
  it("generates deterministic default armies and applies independent strategy", () => {
    const playerSetup = createDefaultTeamArmySetup(); playerSetup.defaultStrategy = "wait";
    const enemySetup = createDefaultTeamArmySetup(); enemySetup.defaultStrategy = "charge";
    const player = createArmy("player", () => 0, { playerLoadout: makePlayerDebugPreset("PROTOTYPE_AREA"), armySetup: playerSetup });
    const enemy = createArmy("enemy", () => 0, { armySetup: enemySetup });
    for (const army of [player, enemy]) {
      expect(army.filter((s) => s.technique === "PROTOTYPE_AREA")).toHaveLength(23);
      expect(army.filter((s) => s.technique === "TEPPOU_BOMBARDMENT")).toHaveLength(6);
      expect(army.filter((s) => s.technique === "CAVALRY_CHARGE")).toHaveLength(1);
    }
    expect(player.filter((s) => s.unitType !== "CAVALRY").every((s) => s.strategy === "wait")).toBe(true);
    expect(player.find((s) => s.unitType === "CAVALRY")?.strategy).toBe("charge");
    expect(enemy.every((s) => s.strategy === "charge")).toBe(true);
  });
  it("replaces one prototype slot for a player technique override without adding a soldier", () => {
    const setup = createDefaultTeamArmySetup();
    const army = createArmy("player", () => 0, { playerLoadout: makePlayerDebugPreset("TEPPOU_SNIPING"), armySetup: setup });
    expect(army).toHaveLength(30); expect(army.filter((s) => s.technique === "PROTOTYPE_AREA")).toHaveLength(22);
    expect(army.filter((s) => s.technique === "TEPPOU_SNIPING")).toHaveLength(1);
    expect(army.filter((s) => s.technique === "TEPPOU_BOMBARDMENT")).toHaveLength(6);
    expect(formatSoldierInspector(army.find((s) => s.technique === "TEPPOU_BOMBARDMENT")!)).toContain("駒種：砲撃");
  });
});
