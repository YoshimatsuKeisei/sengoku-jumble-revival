import { describe, expect, it } from "vitest";
import { battlefieldSourcePointToWorld } from "../../src/game/battlefieldLayout";
import { createSoldier } from "../../src/game/entities/Soldier";
import {
  startSoldierAttack,
  updateAttackStates,
} from "../../src/game/systems/attackSystem";
import { isRawNormalContactGuarded } from "../../src/game/systems/defenseSystem";
import combatSpec from "../../swf-spec/rules/combat.json";

const STATS = { maxHp: 60, skill: 50, foot: 3, combat: 50, defense: 50 } as const;

function unit(id: string, team: "player" | "enemy", sourceX: number) {
  const point = battlefieldSourcePointToWorld({ x: sourceX, y: 500 });
  return createSoldier(id, team, "ai", point.x, point.y, "melee", STATS);
}

function sequenceRandom(values: number[]): { random: () => number; calls: () => number } {
  let index = 0;
  return {
    random: () => values[Math.min(index++, values.length - 1)] ?? 0,
    calls: () => index,
  };
}

describe("raw mode-0 normal-contact defense", () => {
  it("records the direct AVM1 defense and HORO ordering", () => {
    const rule = combatSpec.rules.find((candidate) => candidate.id === "NORMAL_CONTACT_DEFENSE");
    expect(rule?.status).toBe("confirmed");
    expect(rule?.expected).toMatchObject({
      atckMode: 0,
      ordinaryDefenseRandomScale: 200,
      ordinaryDefenseRollConsumedBeforeHoroRoll: true,
      guardComparison: "roll <= df",
      hitComparison: "roll > df",
      horoAbilityCode: "s12",
      horoExtraRandomScale: 100,
      horoForceGuardWhenPercentStrictlyGreaterThan: 30,
      horoBoundary30ForcesGuard: false,
      horoForcedDefenseRoll: 0,
      rangedDefenseIntegrationChangedByThisStage: false,
    });
  });

  it("uses the ordinary random*200 roll with <= defense meaning guard", () => {
    const defender = unit("defender", "player", 500);
    defender.stats.defense = 50;

    expect(isRawNormalContactGuarded(defender, () => 0.25)).toBe(true);
    expect(isRawNormalContactGuarded(defender, () => 0.250001)).toBe(false);
  });

  it("consumes the ordinary roll before HORO and forces guard only above 30 percent", () => {
    const defender = unit("defender", "player", 500);
    defender.stats.defense = 0;
    defender.specialAbilities.push("HORO");

    const forced = sequenceRandom([0.99, 0.31]);
    expect(isRawNormalContactGuarded(defender, forced.random)).toBe(true);
    expect(forced.calls()).toBe(2);

    const boundary = sequenceRandom([0.99, 0.30]);
    expect(isRawNormalContactGuarded(defender, boundary.random)).toBe(false);
    expect(boundary.calls()).toBe(2);
  });

  it("routes a normal melee HORO guard to S without changing HP", () => {
    const attacker = unit("attacker", "enemy", 510);
    const defender = unit("defender", "player", 500);
    defender.stats.defense = 0;
    defender.specialAbilities.push("HORO");
    const beforeHp = defender.hp;

    expect(startSoldierAttack(attacker, defender, 1_000)).toBe(true);
    expect(attacker.attackHitAt).not.toBeNull();
    const rng = sequenceRandom([0.99, 0.31]);
    updateAttackStates([attacker, defender], [], attacker.attackHitAt!, false, rng.random);

    expect(rng.calls()).toBe(2);
    expect(defender.hp).toBe(beforeHp);
    expect(defender.combatFeedbackMarker).toBe("S");
  });
});
