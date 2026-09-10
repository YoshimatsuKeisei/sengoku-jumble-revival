import { describe, expect, it } from "vitest";
import { battlefieldSourcePointToWorld } from "../battlefieldLayout";
import { ARCHER_CONFIG } from "../config";
import { createSoldier } from "../entities/Soldier";
import type { SoldierLoadout, UnitTechnique } from "../types";
import { createDefaultTeamArmySetup, getArmySetupTotal, isValidTeamArmySetup } from "./armySetupSystem";
import { FIRE_ARROW_PRIMARY_COMPONENTS, FIRE_ARROW_SPLASH_COMPONENTS, getArrowPrimaryComponents,
  getArrowRange, HOROKU_PRIMARY_COMPONENTS, HOROKU_SPLASH_COMPONENTS, executeArrowAttack, updateArrowProjectile } from "./arrowAttackSystem";
import { applyRareDamageImmunity, totalDamageComponents } from "./damageComponentSystem";
import { executeGunAttack } from "./gunAttackSystem";
import { formatSoldierInspector } from "./soldierInspectorSystem";
import { isTechniqueCompatibleWithUnitType, makePlayerDebugPreset, TECHNIQUE_DEFINITIONS, UNIT_DEFINITIONS } from "./unitLoadoutSystem";

const loadout = (technique: "ARCHER_FIRE_ARROW" | "ARCHER_HOROKU", abilities: SoldierLoadout["specialAbilities"] = []): SoldierLoadout => ({
  unitType: "ARCHER", technique, stats: { maxHp: 90, skill: 90, foot: 3, combat: 85, defense: 85 }, specialAbilities: abilities,
});
function impact(technique: "ARCHER_FIRE_ARROW" | "ARCHER_HOROKU", targets: ReturnType<typeof createSoldier>[], abilities: SoldierLoadout["specialAbilities"] = []) {
  const attacker = createSoldier("a", "player", "ai", 0, 0, "melee", undefined, loadout(technique, abilities));
  const launch = executeArrowAttack(attacker, targets[0], 0, () => 1, false, [attacker, ...targets])!;
  return { attacker, launch, result: updateArrowProjectile(launch.projectile, [attacker, ...targets], 10_000, 10_000, () => 1) };
}
function sourceUnit(id: string, team: "player" | "enemy", sourceX: number, sourceY = 500) {
  const point = battlefieldSourcePointToWorld({ x: sourceX, y: sourceY });
  return createSoldier(id, team, "ai", point.x, point.y);
}

describe("Phase 4D-2 fire arrow, horoku and katon", () => {
  it("defines four metadata-driven archer techniques", () => {
    for (const technique of ["ARCHER_FIRE_ARROW", "ARCHER_HOROKU"] as UnitTechnique[]) {
      expect(isTechniqueCompatibleWithUnitType("ARCHER", technique)).toBe(true);
      expect(isTechniqueCompatibleWithUnitType("TEPPOU", technique)).toBe(false);
    }
    expect(TECHNIQUE_DEFINITIONS.ARCHER_FIRE_ARROW.label).toBe("火矢");
    expect(TECHNIQUE_DEFINITIONS.ARCHER_HOROKU.label).toBe("焙烙");
    expect(UNIT_DEFINITIONS.ARCHER.techniques).toContain("ARCHER_HOROKU");
  });
  it("shares the three-unit range and common AoE radius", () => {
    expect(getArrowRange("ARCHER_FIRE_ARROW")).toBe(ARCHER_CONFIG.arrowRange);
    expect(getArrowRange("ARCHER_HOROKU")).toBe(ARCHER_CONFIG.arrowRange);
    expect(getArrowRange("ARCHER_HOROKU")).toBeLessThan(ARCHER_CONFIG.longShotRange);
    expect(ARCHER_CONFIG.areaImpactRadius).toBeGreaterThan(0);
  });
  it("keeps the raw fire-arrow and horoku component compositions", () => {
    expect(FIRE_ARROW_PRIMARY_COMPONENTS).toEqual({ DIRECT_ARROW: 1, FIRE: 1 });
    expect(FIRE_ARROW_SPLASH_COMPONENTS).toEqual({ FIRE: 1 });
    expect(HOROKU_PRIMARY_COMPONENTS).toEqual({ DIRECT_ARROW: 1, EXPLOSION: 2 });
    expect(HOROKU_SPLASH_COMPONENTS).toEqual({ EXPLOSION: 1 });
    expect(totalDamageComponents(getArrowPrimaryComponents({ technique: "ARCHER_FIRE_ARROW", specialAbilities: ["MIGHT"] }))).toBe(3);
    expect(totalDamageComponents(getArrowPrimaryComponents({ technique: "ARCHER_HOROKU", specialAbilities: ["MIGHT"] }))).toBe(4);
  });
  it("commits fire and horoku gameplay at launch and keeps their raw pre-effect victims", () => {
    const primary = createSoldier("p", "enemy", "ai", 60, 0); const splash = createSoldier("s", "enemy", "ai", 70, 0);
    const fire = impact("ARCHER_FIRE_ARROW", [primary, splash]);
    expect(primary.hp).toBe(primary.maxHp - 2); expect(splash.hp).toBe(splash.maxHp);
    expect(fire.launch.projectile.flameVictimIds).toEqual(["p"]);
    expect(fire.result.impact?.flameVictimIds).toEqual(["p"]);

    const attacker = sourceUnit("ha", "player", 640);
    attacker.unitType = "ARCHER"; attacker.technique = "ARCHER_HOROKU";
    const hp = [sourceUnit("hp", "enemy", 700), sourceUnit("hs", "enemy", 720)];
    const launch = executeArrowAttack(attacker, hp[0], 0, () => 1, false, [attacker, ...hp])!;
    expect(hp[0].hp).toBe(hp[0].maxHp - 3); expect(hp[1].hp).toBe(hp[1].maxHp - 1);
    expect(launch.projectile.brownSmokeVictimIds).toEqual(expect.arrayContaining(["hp", "hs"]));
  });
  it("keeps fire-arrow fire when the later direct arrow is guarded", () => {
    const attacker = createSoldier("a", "player", "ai", 0, 0, "melee", undefined, loadout("ARCHER_FIRE_ARROW"));
    const primary = createSoldier("p", "enemy", "ai", 60, 0); primary.stats.defense = 200;
    const splash = createSoldier("s", "enemy", "ai", 65, 0);
    const launch = executeArrowAttack(attacker, primary, 0, () => 0, false, [attacker, primary, splash])!;
    expect(primary.hp).toBe(primary.maxHp - 1); expect(primary.combatFeedbackMarker).toBe("S");
    expect(splash.hp).toBe(splash.maxHp); expect(splash.combatFeedbackMarker).toBeNull();
    expect(launch.projectile.flameVictimIds).toEqual(["p"]);
  });
  it("does not run independent defense or KATON checks for horoku splash victims", () => {
    const attacker = sourceUnit("a", "player", 640);
    attacker.unitType = "ARCHER"; attacker.technique = "ARCHER_HOROKU";
    const primary = sourceUnit("p", "enemy", 700);
    const guarded = sourceUnit("g", "enemy", 720); guarded.stats.defense = 200; guarded.specialAbilities = ["FORESIGHT"];
    const katonSplash = sourceUnit("k", "enemy", 700, 536); katonSplash.rareSpecialAbilities = ["KATON"];
    const launch = executeArrowAttack(attacker, primary, 0, () => 1, false, [attacker, primary, guarded, katonSplash])!;
    expect(primary.hp).toBe(primary.maxHp - 3);
    expect(guarded.hp).toBe(guarded.maxHp - 1); expect(guarded.combatFeedbackMarker).toBeNull();
    expect(katonSplash.hp).toBe(katonSplash.maxHp - 1); expect(katonSplash.combatFeedbackMarker).toBeNull();
    expect(launch.projectile.brownSmokeVictimIds).toEqual(expect.arrayContaining(["p", "g", "k"]));
  });
  it("filters only fire and explosion through the generic rare KATON component helper", () => {
    const victim = createSoldier("k", "enemy", "ai", 0, 0); victim.rareSpecialAbilities = ["KATON"];
    const remaining = applyRareDamageImmunity(victim, { DIRECT_ARROW: 2, DIRECT_SPECIAL: 1, FIRE: 1, EXPLOSION: 1 });
    expect(remaining).toEqual({ DIRECT_ARROW: 2, DIRECT_SPECIAL: 1, FIRE: 0, EXPLOSION: 0 });
    expect(totalDamageComponents(remaining)).toBe(3);
  });
  it("lets primary KATON suppress pre-effects while preserving the later direct arrow", () => {
    for (const technique of ["ARCHER_FIRE_ARROW", "ARCHER_HOROKU"] as const) {
      const primary = createSoldier(`p-${technique}`, "enemy", "ai", 60, 0); primary.rareSpecialAbilities = ["KATON"];
      const splash = createSoldier(`s-${technique}`, "enemy", "ai", 65, 0);
      const { launch } = impact(technique, [primary, splash]);
      expect(primary.hp).toBe(primary.maxHp - 1); expect(primary.combatFeedbackMarker).toBe("H");
      expect(splash.hp).toBe(splash.maxHp); expect(splash.combatFeedbackMarker).toBeNull();
      expect(launch.projectile.flameVictimIds).toEqual([]); expect(launch.projectile.brownSmokeVictimIds).toEqual([]);
    }
  });
  it("applies primary KATON to bombardment while preserving direct damage and MIGHT", () => {
    const gun = createSoldier("g", "player", "ai", 0, 0, "melee", undefined, makePlayerDebugPreset("TEPPOU_BOMBARDMENT"));
    gun.specialAbilities = ["MIGHT"];
    const primary = createSoldier("p", "enemy", "ai", 60, 0); primary.rareSpecialAbilities = ["KATON"];
    const splash = createSoldier("s", "enemy", "ai", 65, 0); splash.rareSpecialAbilities = ["KATON"];
    const event = executeGunAttack(gun, primary, 0, () => 1, false, [primary, splash])!;
    expect(primary.hp).toBe(primary.maxHp - 2); expect(splash.hp).toBe(splash.maxHp);
    expect(event.bombardmentVictimIds).toEqual([]);
  });
  it("adds zero-count techniques to unchanged default setup and inspector rare output", () => {
    const setup = createDefaultTeamArmySetup();
    expect(setup.techniqueCounts).toMatchObject({ ARCHER_FIRE_ARROW: 0, ARCHER_HOROKU: 0 });
    expect(getArmySetupTotal(setup)).toBe(30); expect(isValidTeamArmySetup(setup)).toBe(true);
    const soldier = createSoldier("k", "player", "player", 0, 0, "melee", undefined, { ...loadout("ARCHER_FIRE_ARROW"), rareSpecialAbilities: ["KATON"] });
    expect(formatSoldierInspector(soldier)).toContain("駒種：火矢"); expect(formatSoldierInspector(soldier)).toContain("・火遁");
  });
});
