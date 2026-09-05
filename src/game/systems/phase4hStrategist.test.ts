import { describe, expect, it } from "vitest";
import { BATTLE_RANGE_UNIT_PX, STRATEGIST_CONFIG } from "../config";
import { createSoldier } from "../entities/Soldier";
import { createArmy } from "../factories/createArmy";
import { createStrategistStats } from "../stats/strategistStats";
import type { SoldierLoadout } from "../types";
import { createDefaultTeamArmySetup, getArmySetupTotal, isValidTeamArmySetup } from "./armySetupSystem";
import { applyConfusion } from "./confusionSystem";
import { executeStrategistAttack, getStrategistFirePlacement, getStrategistFireRadius, updateStrategistFireZone } from "./strategistAttackSystem";
import { updateSpecialAttacks } from "./specialAttackSystem";
import { isTechniqueCompatibleWithUnitType, makePlayerDebugPreset, TECHNIQUE_DEFINITIONS, UNIT_DEFINITIONS, UNIT_TYPE_LABELS } from "./unitLoadoutSystem";

const techniques = ["STRATEGIST_FIRE_PLAY", "STRATEGIST_FIRE_ATTACK", "STRATEGIST_FIRE_PLAN", "STRATEGIST_HELLFIRE",
  "STRATEGIST_FLAME_ART", "STRATEGIST_FALSE_REPORT", "STRATEGIST_SORCERY", "STRATEGIST_HEAL"] as const;
const strategist = (technique: typeof techniques[number], abilities: SoldierLoadout["specialAbilities"] = [], rareSpecialAbilities: SoldierLoadout["rareSpecialAbilities"] = []): SoldierLoadout => ({
  unitType: "STRATEGIST", technique, stats: { maxHp: 85, skill: 90, foot: 3, combat: 80, defense: 90 }, specialAbilities: abilities, rareSpecialAbilities,
});

describe("Phase 4H strategist", () => {
  it("defines eight compatible techniques and a four-unit cap", () => {
    for (const technique of techniques) expect(isTechniqueCompatibleWithUnitType("STRATEGIST", technique)).toBe(true);
    expect(isTechniqueCompatibleWithUnitType("GENERAL", "STRATEGIST_SORCERY")).toBe(false);
    expect(UNIT_TYPE_LABELS.STRATEGIST).toBe("軍師"); expect(TECHNIQUE_DEFINITIONS.STRATEGIST_FLAME_ART.label).toBe("炎術");
    expect(UNIT_DEFINITIONS.STRATEGIST.maxPerTeam).toBe(4);
  });

  it("generates deterministic inclusive base stats", () => {
    expect(createStrategistStats(() => 0)).toEqual({ maxHp: 60, skill: 70, foot: 2, combat: 50, defense: 70 });
    expect(createStrategistStats(() => 0.999999)).toEqual({ maxHp: 110, skill: 110, foot: 3, combat: 110, defense: 110 });
  });

  it("uses shared 1/3/5/7/9 fire diameters and places zones forward", () => {
    const expected = [1, 3, 5, 7, 9];
    for (const [index, technique] of techniques.slice(0, 5).entries())
      expect(getStrategistFireRadius(technique as keyof typeof STRATEGIST_CONFIG.fireDiameterUnits) * 2).toBe(BATTLE_RANGE_UNIT_PX * expected[index]);
    const caster = createSoldier("s", "player", "ai", 100, 100, "melee", undefined, strategist("STRATEGIST_FIRE_PLAN"));
    const enemy = createSoldier("e", "enemy", "ai", 150, 100); const placement = getStrategistFirePlacement(caster, [caster, enemy])!;
    expect(placement.x).toBeGreaterThan(caster.x); expect(placement.y).toBe(caster.y);
  });

  it("creates one persistent fire zone, damages each victim once, is non-lethal, ignores MIGHT and respects KATON", () => {
    const caster = createSoldier("s", "player", "ai", 100, 100, "melee", undefined, strategist("STRATEGIST_FIRE_PLAN", ["MIGHT"]));
    const victim = createSoldier("v", "enemy", "ai", 145, 100); victim.hp = 2;
    const immune = createSoldier("k", "enemy", "ai", 145, 105, "melee", undefined, { ...strategist("STRATEGIST_FIRE_PLAY"), unitType: "PROTOTYPE", technique: "PROTOTYPE_AREA", rareSpecialAbilities: ["KATON"] });
    const event = executeStrategistAttack(caster, [caster, victim, immune], [], [], 0, () => 1, true)!;
    expect(victim.hp).toBe(1); expect(immune.hp).toBe(immune.maxHp); expect(immune.combatFeedbackMarker).toBeNull();
    updateStrategistFireZone(event.fireZone!, [caster, victim, immune], 500); expect(victim.hp).toBe(1);
    expect(executeStrategistAttack(caster, [caster, victim], [], [], 100, () => 1, false)).toBeNull();
  });

  it("damages a soldier entering an active zone later exactly once", () => {
    const caster = createSoldier("s", "player", "ai", 100, 100, "melee", undefined, strategist("STRATEGIST_FIRE_ATTACK"));
    const initial = createSoldier("i", "enemy", "ai", 140, 100);
    const late = createSoldier("l", "enemy", "ai", 400, 100);
    const zone = executeStrategistAttack(caster, [caster, initial, late], [], [], 0, () => 1, true)!.fireZone!;
    late.x = zone.x; const hp = late.hp;
    expect(updateStrategistFireZone(zone, [caster, initial, late], 500)).toEqual(["l"]); expect(late.hp).toBe(hp - 1);
    expect(updateStrategistFireZone(zone, [caster, initial, late], 600)).toEqual([]);
  });

  it("false report applies confusion without damage or defense feedback", () => {
    const caster = createSoldier("s", "player", "ai", 100, 100, "melee", undefined, strategist("STRATEGIST_FALSE_REPORT"));
    const enemy = createSoldier("e", "enemy", "ai", 140, 100); enemy.specialAbilities = ["FORESIGHT"]; const hp = enemy.hp;
    const event = executeStrategistAttack(caster, [caster, enemy], [], [], 0, () => 0, true)!;
    expect(event.radius).toBe(BATTLE_RANGE_UNIT_PX * 3); expect(enemy.hp).toBe(hp); expect(enemy.isConfused).toBe(true);
    expect(enemy.combatFeedbackMarker).toBeNull();
  });

  it("sorcery bypasses defense, deals non-lethal one without MIGHT and applies shared confusion", () => {
    const caster = createSoldier("s", "player", "ai", 100, 100, "melee", undefined, strategist("STRATEGIST_SORCERY", ["MIGHT"]));
    const enemy = createSoldier("e", "enemy", "ai", 140, 100); enemy.specialAbilities = ["FORESIGHT"]; enemy.hp = 2;
    const event = executeStrategistAttack(caster, [caster, enemy], [], [], 0, () => 0, true)!;
    expect(enemy.hp).toBe(1); expect(enemy.combatFeedbackMarker).toBe("H"); expect(enemy.isConfused).toBe(true); expect(event.victimIds).toEqual(["e"]);
  });

  it("heals all active damaged allies in twelve units without clearing confusion", () => {
    const caster = createSoldier("s", "player", "ai", 100, 100, "melee", undefined, strategist("STRATEGIST_HEAL")); caster.hp -= 2; applyConfusion(caster);
    const general = createSoldier("g", "player", "ai", 200, 100, "melee", undefined, makePlayerDebugPreset("GENERAL_COMMAND")); general.hp -= 2;
    const healing = createSoldier("h", "player", "ai", 150, 100); healing.hp -= 2; healing.state = "HEALING";
    const event = executeStrategistAttack(caster, [caster, general, healing], [], [], 0, () => 1, true)!;
    expect(event.radius).toBe(BATTLE_RANGE_UNIT_PX * 12); expect(event.healed.map((h) => h.targetId)).toEqual(["s", "g"]);
    expect(caster.isConfused).toBe(true); expect(healing.hp).toBe(healing.maxHp - 2);
  });

  it("is a General Command recipient and forced activation preserves cooldown", () => {
    const general = createSoldier("g", "player", "ai", 100, 100, "melee", undefined, makePlayerDebugPreset("GENERAL_COMMAND"));
    const adviser = createSoldier("s", "player", "ai", 120, 100, "melee", undefined, strategist("STRATEGIST_FALSE_REPORT")); adviser.specialReadyAt = 99_999; applyConfusion(adviser);
    const enemy = createSoldier("e", "enemy", "ai", 140, 100);
    const events = updateSpecialAttacks([general, adviser, enemy], [], [], 100, false, () => 1);
    expect(events.some((event) => event.kind === "STRATEGIST" && event.attackerId === adviser.id)).toBe(true);
    expect(adviser.specialReadyAt).toBe(99_999); expect(adviser.isConfused).toBe(false);
  });

  it("validates strategist cap, total and cap-aware player override", () => {
    const setup = createDefaultTeamArmySetup(); expect(setup.techniqueCounts.STRATEGIST_FIRE_PLAY).toBe(0);
    setup.techniqueCounts.PROTOTYPE_AREA = 19; setup.techniqueCounts.STRATEGIST_FIRE_PLAY = 1; setup.techniqueCounts.STRATEGIST_SORCERY = 2; setup.techniqueCounts.STRATEGIST_HEAL = 1;
    expect(isValidTeamArmySetup(setup)).toBe(true); expect(getArmySetupTotal(setup)).toBe(30);
    setup.techniqueCounts.PROTOTYPE_AREA = 18; setup.techniqueCounts.STRATEGIST_HEAL = 2; expect(isValidTeamArmySetup(setup)).toBe(false);
    setup.techniqueCounts.PROTOTYPE_AREA = 19; setup.techniqueCounts.STRATEGIST_HEAL = 1;
    const army = createArmy("player", () => 0, { armySetup: setup, playerLoadout: makePlayerDebugPreset("STRATEGIST_HELLFIRE") });
    expect(army).toHaveLength(30); expect(army.filter((s) => s.unitType === "STRATEGIST")).toHaveLength(4);
  });
});
