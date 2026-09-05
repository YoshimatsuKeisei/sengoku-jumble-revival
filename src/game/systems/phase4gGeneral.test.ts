import { describe, expect, it } from "vitest";
import { GENERAL_CONFIG, SPECIAL_ATTACK_CONFIG } from "../config";
import { createSoldier } from "../entities/Soldier";
import { createArmy } from "../factories/createArmy";
import { createGeneralStats } from "../stats/generalStats";
import type { SoldierLoadout } from "../types";
import { createDefaultTeamArmySetup, getArmySetupTotal, isValidTeamArmySetup } from "./armySetupSystem";
import { applyConfusion } from "./confusionSystem";
import { executeGeneralAttack, findGeneralCommandRecipients, findGeneralHealTargets } from "./generalAttackSystem";
import { updateSpecialAttacks } from "./specialAttackSystem";
import { isTechniqueCompatibleWithUnitType, makePlayerDebugPreset, TECHNIQUE_DEFINITIONS, UNIT_DEFINITIONS, UNIT_TYPE_LABELS } from "./unitLoadoutSystem";

const general = (technique: "GENERAL_COMMAND" | "GENERAL_HEROIC" | "GENERAL_HEAL", abilities: SoldierLoadout["specialAbilities"] = []): SoldierLoadout => ({
  unitType: "GENERAL", technique, stats: { maxHp: 90, skill: 90, foot: 3, combat: 90, defense: 108 }, specialAbilities: abilities,
});

describe("Phase 4G general", () => {
  it("defines three compatible techniques, labels and a four-unit cap", () => {
    for (const technique of ["GENERAL_COMMAND", "GENERAL_HEROIC", "GENERAL_HEAL"] as const)
      expect(isTechniqueCompatibleWithUnitType("GENERAL", technique)).toBe(true);
    expect(isTechniqueCompatibleWithUnitType("NINJA", "GENERAL_COMMAND")).toBe(false);
    expect(UNIT_TYPE_LABELS.GENERAL).toBe("武将"); expect(TECHNIQUE_DEFINITIONS.GENERAL_COMMAND.label).toBe("号令");
    expect(UNIT_DEFINITIONS.GENERAL.maxPerTeam).toBe(4);
  });

  it("generates inclusive deterministic general stats", () => {
    expect(createGeneralStats(() => 0)).toEqual({ maxHp: 70, skill: 70, foot: 2, combat: 70, defense: 105 });
    expect(createGeneralStats(() => 0.999999)).toEqual({ maxHp: 110, skill: 110, foot: 4, combat: 110, defense: 110 });
  });

  it("collects active non-general allies only", () => {
    const caster = createSoldier("g", "player", "ai", 100, 100, "melee", undefined, general("GENERAL_COMMAND"));
    const ally = createSoldier("a", "player", "ai", 120, 100); const player = createSoldier("p", "player", "player", 130, 100);
    const otherGeneral = createSoldier("og", "player", "ai", 110, 100, "melee", undefined, general("GENERAL_HEAL"));
    const enemy = createSoldier("e", "enemy", "ai", 120, 100); const healing = createSoldier("h", "player", "ai", 120, 110); healing.state = "HEALING";
    expect(findGeneralCommandRecipients(caster, [caster, ally, player, otherGeneral, enemy, healing]).map((s) => s.id)).toEqual(["a", "p"]);
  });

  it("clears confusion before forcing AI, preserves cooldown, readies but does not auto-fire player, and excludes generals", () => {
    const caster = createSoldier("g", "player", "ai", 100, 100, "melee", undefined, general("GENERAL_COMMAND"));
    const ai = createSoldier("a", "player", "ai", 120, 100); ai.specialReadyAt = 99_999; ai.targetId = "old"; applyConfusion(ai);
    const player = createSoldier("p", "player", "player", 125, 100); player.specialReadyAt = 99_999;
    const confusedGeneral = createSoldier("og", "player", "ai", 130, 100, "melee", undefined, general("GENERAL_HEAL")); applyConfusion(confusedGeneral);
    let forced = 0;
    const event = executeGeneralAttack(caster, [caster, ai, player, confusedGeneral], [], [], 100, () => 1, true,
      (recipient) => { forced += 1; expect(recipient.targetId).toBeNull(); return false; })!;
    expect(ai.isConfused).toBe(false); expect(ai.specialReadyAt).toBe(99_999); expect(forced).toBe(1);
    expect(player.specialReadyAt).toBe(100); expect(event.playerReadyIds).toEqual(["p"]);
    expect(confusedGeneral.isConfused).toBe(true);
  });

  it("forces an in-range special while ignoring and preserving recipient cooldown", () => {
    const caster = createSoldier("g", "player", "ai", 100, 100, "melee", undefined, general("GENERAL_COMMAND"));
    const ally = createSoldier("a", "player", "ai", 120, 100); ally.specialReadyAt = 99_999;
    const enemy = createSoldier("e", "enemy", "ai", 140, 100);
    const events = updateSpecialAttacks([caster, ally, enemy], [], [], 100, false, () => 1);
    expect(events.some((event) => event.kind === "AREA" && event.attackerId === ally.id)).toBe(true);
    expect(ally.specialReadyAt).toBe(99_999);
  });

  it("heroic reuses prototype radius, damages with MIGHT, steps, and commands allies", () => {
    expect(GENERAL_CONFIG.heroicRadius).toBe(SPECIAL_ATTACK_CONFIG.radius);
    const caster = createSoldier("g", "player", "ai", 100, 100, "melee", undefined, general("GENERAL_HEROIC", ["MIGHT"]));
    const ally = createSoldier("a", "player", "ai", 105, 120); applyConfusion(ally);
    const enemy = createSoldier("e", "enemy", "ai", 140, 100); const hp = enemy.hp;
    const event = executeGeneralAttack(caster, [caster, ally, enemy], [], [], 0, () => 1, true, () => false)!;
    expect(caster.x).toBeGreaterThan(100); expect(enemy.hp).toBe(hp - 2); expect(event.hitIds).toEqual(["e"]);
    expect(ally.isConfused).toBe(false); expect(event.recipientIds).toEqual(["a"]);
  });

  it("heals self, generals and allies by one without clearing confusion or touching HEALING/full targets", () => {
    const caster = createSoldier("g", "player", "ai", 100, 100, "melee", undefined, general("GENERAL_HEAL")); caster.hp -= 2; applyConfusion(caster);
    const ally = createSoldier("a", "player", "ai", 120, 100); ally.hp -= 2; applyConfusion(ally);
    const other = createSoldier("og", "player", "ai", 130, 100, "melee", undefined, general("GENERAL_COMMAND")); other.hp -= 2;
    const healing = createSoldier("h", "player", "ai", 140, 100); healing.hp -= 2; healing.state = "HEALING";
    expect(findGeneralHealTargets(caster, [caster, ally, other, healing])).toHaveLength(3);
    const event = executeGeneralAttack(caster, [caster, ally, other, healing], [], [], 0, () => 1, true, () => false)!;
    expect(event.healed.map((h) => h.targetId)).toEqual(["g", "a", "og"]); expect(ally.isConfused).toBe(true); expect(caster.isConfused).toBe(true);
  });

  it("validates general cap and preserves total/cap-aware player override", () => {
    const setup = createDefaultTeamArmySetup(); expect(setup.techniqueCounts).toMatchObject({ GENERAL_COMMAND: 0, GENERAL_HEROIC: 0, GENERAL_HEAL: 0 });
    setup.techniqueCounts.PROTOTYPE_AREA = 19; setup.techniqueCounts.GENERAL_COMMAND = 2; setup.techniqueCounts.GENERAL_HEROIC = 1; setup.techniqueCounts.GENERAL_HEAL = 1;
    expect(isValidTeamArmySetup(setup)).toBe(true); expect(getArmySetupTotal(setup)).toBe(30);
    setup.techniqueCounts.PROTOTYPE_AREA = 18; setup.techniqueCounts.GENERAL_HEAL = 2; expect(isValidTeamArmySetup(setup)).toBe(false);
    setup.techniqueCounts.PROTOTYPE_AREA = 19; setup.techniqueCounts.GENERAL_HEAL = 1;
    const army = createArmy("player", () => 0, { armySetup: setup, playerLoadout: makePlayerDebugPreset("GENERAL_COMMAND") });
    expect(army).toHaveLength(30); expect(army.filter((s) => s.unitType === "GENERAL")).toHaveLength(4);
  });
});
