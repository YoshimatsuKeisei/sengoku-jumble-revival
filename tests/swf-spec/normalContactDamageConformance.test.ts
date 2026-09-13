import { describe, expect, it } from "vitest";
import { battlefieldSourcePointToWorld } from "../../src/game/battlefieldLayout";
import { createSoldier } from "../../src/game/entities/Soldier";
import {
  startSoldierAttack,
  updateAttackStates,
} from "../../src/game/systems/attackSystem";
import { calculateNormalAttackDamage } from "../../src/game/systems/specialAbilitySystem";
import combatSpec from "../../swf-spec/rules/combat.json";

const STATS = { maxHp: 60, skill: 50, foot: 3, combat: 50, defense: 0 } as const;

function unit(id: string, team: "player" | "enemy", sourceX: number) {
  const point = battlefieldSourcePointToWorld({ x: sourceX, y: 500 });
  return createSoldier(id, team, "ai", point.x, point.y, "melee", STATS);
}

describe("raw mode-0 normal-contact damage order", () => {
  it("records the direct AVM1 damage sequence", () => {
    const rule = combatSpec.rules.find((candidate) => candidate.id === "NORMAL_CONTACT_DAMAGE_ORDER");
    expect(rule?.status).toBe("confirmed");
    expect(rule?.expected).toMatchObject({
      atckMode: 0,
      baseDamage: 1,
      damageOrder: ["BASE", "MIGHT", "FINISHER", "NINJA_HUNTER"],
      mightAbilityCode: "s10",
      finisherAbilityCode: "s9s",
      finisherHpCheckOccursAfter: ["BASE", "MIGHT"],
      finisherHpThresholdExclusive: 6,
      ninjaHunterAbilityCode: "s34",
      ninjaCharacterCode: 7,
      ninjaHunterContributesToFinisherThreshold: false,
      sharedTechniqueDamageHelperChangedByThisStage: false,
    });
  });

  it("checks FINISHER after base plus MIGHT and before NINJA_HUNTER", () => {
    const attacker = unit("attacker", "player", 500);
    const defender = unit("defender", "enemy", 510);
    attacker.specialAbilities = ["MIGHT", "FINISHER"];

    defender.hp = 8;
    expect(calculateNormalAttackDamage(attacker, defender)).toBe(2);
    defender.hp = 7;
    expect(calculateNormalAttackDamage(attacker, defender)).toBe(3);
  });

  it("does not let NINJA_HUNTER trigger FINISHER early at HP 7", () => {
    const attacker = unit("attacker", "player", 500);
    const defender = unit("defender", "enemy", 510);
    attacker.specialAbilities = ["FINISHER"];
    attacker.rareSpecialAbilities = ["NINJA_HUNTER"];
    defender.unitType = "NINJA";
    defender.hp = 7;

    expect(calculateNormalAttackDamage(attacker, defender)).toBe(2);
  });

  it("routes the corrected order through the existing normal melee hit path", () => {
    const attacker = unit("attacker", "player", 500);
    const defender = unit("defender", "enemy", 510);
    attacker.specialAbilities = ["FINISHER"];
    attacker.rareSpecialAbilities = ["NINJA_HUNTER"];
    defender.unitType = "NINJA";
    defender.hp = 7;

    expect(startSoldierAttack(attacker, defender, 1_000)).toBe(true);
    updateAttackStates([attacker, defender], [], attacker.attackHitAt!, false, () => 0.99);

    expect(defender.hp).toBe(5);
    expect(defender.combatFeedbackMarker).toBe("H");
  });
});
