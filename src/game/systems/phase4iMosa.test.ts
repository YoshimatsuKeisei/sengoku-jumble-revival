import { describe, expect, it } from "vitest";
import { BASE_CONTACT_CONFIG, MOSA_CONFIG, SPECIAL_ATTACK_CONFIG } from "../config";
import { battlefieldSourceDistanceToWorldX } from "../battlefieldLayout";
import { createSoldier } from "../entities/Soldier";
import { createArmy } from "../factories/createArmy";
import { createMosaStats } from "../stats/mosaStats";
import type { SoldierLoadout } from "../types";
import { createDefaultTeamArmySetup, getArmySetupTotal, isValidTeamArmySetup } from "./armySetupSystem";
import { BASE_ATTACK_BOUNCE_DISTANCE, getBaseAttackBounceDistance } from "./baseAttackBounceSystem";
import { executeMosaAttack, findMosaTargets, getMosaKnockback, getMosaRadius } from "./mosaAttackSystem";
import { formatSoldierInspector } from "./soldierInspectorSystem";
import { isTechniqueCompatibleWithUnitType, makePlayerDebugPreset, TECHNIQUE_DEFINITIONS, UNIT_DEFINITIONS, UNIT_TYPE_LABELS } from "./unitLoadoutSystem";

const mosa = (technique: "MOSA_SENPUU" | "MOSA_MUSOU" | "MOSA_KIJIN", abilities: SoldierLoadout["specialAbilities"] = []): SoldierLoadout => ({
  unitType: "MOSA", technique, stats: { maxHp: 98, skill: 90, foot: 3, combat: 108, defense: 90 }, specialAbilities: abilities,
});
describe("Phase 4I mosa and base bounce", () => {
  it("defines three compatible techniques, labels and a six-unit cap", () => {
    for (const technique of ["MOSA_SENPUU", "MOSA_MUSOU", "MOSA_KIJIN"] as const)
      expect(isTechniqueCompatibleWithUnitType("MOSA", technique)).toBe(true);
    expect(isTechniqueCompatibleWithUnitType("NINJA", "MOSA_SENPUU")).toBe(false);
    expect(UNIT_TYPE_LABELS.MOSA).toBe("猛者"); expect(TECHNIQUE_DEFINITIONS.MOSA_KIJIN.label).toBe("鬼神");
    expect(UNIT_DEFINITIONS.MOSA.maxPerTeam).toBe(6);
  });

  it("generates deterministic inclusive stats", () => {
    expect(createMosaStats(() => 0)).toEqual({ maxHp: 85, skill: 70, foot: 2, combat: 105, defense: 70 });
    expect(createMosaStats(() => 0.999999)).toEqual({ maxHp: 110, skill: 110, foot: 4, combat: 110, defense: 110 });
  });

  it("senpuu hits multiple forward targets, misses rear, supports MIGHT and knockback", () => {
    const attacker = createSoldier("m", "player", "ai", 100, 100, "melee", undefined, mosa("MOSA_SENPUU", ["MIGHT"])); attacker.facingX = 1;
    const front = createSoldier("f", "enemy", "ai", 135, 100); const diagonal = createSoldier("d", "enemy", "ai", 130, 120);
    const rear = createSoldier("r", "enemy", "ai", 70, 100); const hp = front.hp;
    expect(findMosaTargets(attacker, [attacker, front, diagonal, rear]).map((s) => s.id)).toEqual(["f", "d"]);
    const event = executeMosaAttack(attacker, [attacker, front, diagonal, rear], [], [], 0, () => 1)!;
    expect(front.hp).toBe(hp - 2); expect(event.hitIds).toEqual(["f", "d"]); expect(front.combatFeedbackMarker).toBe("H");
    expect(front.knockbackRemainingDistance).toBeGreaterThan(SPECIAL_ATTACK_CONFIG.knockbackDistance);
  });

  it("musou is 360 degrees and kijin doubles its radius with stronger knockback", () => {
    expect(getMosaRadius("MOSA_MUSOU")).toBe(SPECIAL_ATTACK_CONFIG.radius);
    expect(getMosaRadius("MOSA_KIJIN")).toBe(getMosaRadius("MOSA_MUSOU") * 2);
    expect(getMosaKnockback("MOSA_KIJIN")).toBeGreaterThan(getMosaKnockback("MOSA_MUSOU"));
    const attacker = createSoldier("m", "player", "ai", 100, 100, "melee", undefined, mosa("MOSA_MUSOU"));
    const front = createSoldier("f", "enemy", "ai", 130, 100); const rear = createSoldier("r", "enemy", "ai", 70, 100);
    expect(findMosaTargets(attacker, [attacker, front, rear]).map((s) => s.id)).toEqual(["f", "r"]);
  });

  it("uses existing defense feedback and suppresses damage/stun/knockback on guard", () => {
    const attacker = createSoldier("m", "player", "ai", 100, 100, "melee", undefined, mosa("MOSA_KIJIN"));
    const target = createSoldier("t", "enemy", "ai", 130, 100); target.stats.defense = 110; target.specialAbilities = ["FORESIGHT"]; const hp = target.hp;
    const event = executeMosaAttack(attacker, [attacker, target], [], [], 0, () => 0)!;
    expect(event.defendedIds).toEqual(["t"]); expect(target.hp).toBe(hp); expect(target.combatFeedbackMarker).toBe("S");
    expect(target.reactionState).toBe("NONE"); expect(target.knockbackRemainingDistance).toBe(0);
  });

  it("validates setup cap, total, cap-aware override and inspector metadata", () => {
    const setup = createDefaultTeamArmySetup(); setup.techniqueCounts.PROTOTYPE_AREA = 17;
    setup.techniqueCounts.MOSA_SENPUU = 2; setup.techniqueCounts.MOSA_MUSOU = 2; setup.techniqueCounts.MOSA_KIJIN = 2;
    expect(isValidTeamArmySetup(setup)).toBe(true); expect(getArmySetupTotal(setup)).toBe(30);
    setup.techniqueCounts.PROTOTYPE_AREA = 16; setup.techniqueCounts.MOSA_KIJIN = 3; expect(isValidTeamArmySetup(setup)).toBe(false);
    setup.techniqueCounts.PROTOTYPE_AREA = 17; setup.techniqueCounts.MOSA_KIJIN = 2;
    const army = createArmy("player", () => 0, { armySetup: setup, playerLoadout: makePlayerDebugPreset("MOSA_SENPUU") });
    expect(army.filter((s) => s.unitType === "MOSA")).toHaveLength(6);
    expect(formatSoldierInspector(army[0])).toContain("兵種：猛者"); expect(formatSoldierInspector(army[0])).toContain("駒種：旋風");
  });

  it("uses a dedicated source-scaled base bounce instead of cavalry knockback", () => {
    expect(BASE_ATTACK_BOUNCE_DISTANCE).toBe(
      battlefieldSourceDistanceToWorldX(BASE_CONTACT_CONFIG.baseBounceSourceDistance),
    );
    const defender = createSoldier("d", "enemy", "ai", 500, 100);
    defender.specialAbilities = ["FORTIFY"];
    expect(getBaseAttackBounceDistance([defender])).toBe(
      battlefieldSourceDistanceToWorldX(
        BASE_CONTACT_CONFIG.baseBounceSourceDistance + BASE_CONTACT_CONFIG.fortifyBounceSourceDistance,
      ),
    );
  });
});
