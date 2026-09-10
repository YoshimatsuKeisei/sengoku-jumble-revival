import { describe, expect, it } from "vitest";
import { battlefieldSourcePointToWorld } from "../../src/game/battlefieldLayout";
import { createSoldier } from "../../src/game/entities/Soldier";
import type { Soldier } from "../../src/game/types";
import { createBattleBases } from "../../src/game/systems/baseSystem";
import { advanceCombatGauge, COMBAT_GAUGE_UPDATE_INTERVAL_MS } from "../../src/game/systems/combatGaugeSystem";
import { updateSpecialAttacks } from "../../src/game/systems/specialAttackSystem";
import combatSpec from "../../swf-spec/rules/combat.json";

function archer(id: string): Soldier {
  const point = battlefieldSourcePointToWorld({ x: 520, y: 450 });
  const soldier = createSoldier(id, "player", "ai", point.x, point.y);
  soldier.unitType = "ARCHER";
  soldier.technique = "ARCHER_ARROW";
  soldier.stats.skill = 100;
  return soldier;
}

function enemy(id: string, sourceX = 600): Soldier {
  const point = battlefieldSourcePointToWorld({ x: sourceX, y: 450 });
  return createSoldier(id, "enemy", "ai", point.x, point.y);
}

describe("SWF conformance: direct ranged scd gauge rollover", () => {
  it("records the direct kd/kp threshold-consumption rule as confirmed", () => {
    const rule = combatSpec.rules.find((candidate) => candidate.id === "RANGED_GAUGE_BANKING_LIMIT");
    expect(rule?.status).toBe("confirmed");
    expect(rule?.expected).toMatchObject({
      swfGaugeVariable: "kd",
      swfSkillIncrementVariable: "kp",
      rangedCharacterCodes: [2, 6],
      gaugeStepAddsSkillBeforeThresholdCheck: true,
      activationThresholdExclusive: 200,
      normalThresholdConsumption: 200,
      doubleSpecialAbilityCode: "s21",
      doubleSpecialRetentionChance: 0.4,
      doubleSpecialRetentionMaximumExpression: "399 + kp",
      overflowForcesConsumption: true,
      consumptionOccursBeforeRangeAndActionLockChecks: true,
      explicitHardCap: null,
      arbitraryUnboundedBankingAllowed: false,
      mustNotInventFixedCap: true,
    });
  });

  it("does not bank an idle skill-100 ranged soldier to 1000 across ten gauge steps", () => {
    const subject = archer("idle");
    subject.combatGauge = 0;
    subject.combatGaugeUpdatedAt = 0;
    const time = COMBAT_GAUGE_UPDATE_INTERVAL_MS * 10 + 1;

    expect(updateSpecialAttacks([subject], [], createBattleBases(), time, false, () => 1)).toEqual([]);
    expect(subject.combatGauge).toBe(200);
  });

  it("applies s21 retention at the threshold but consumes the next failed retention before target checks", () => {
    const subject = archer("double");
    subject.specialAbilities = ["DOUBLE_SPECIAL"];
    subject.combatGauge = 200;
    subject.combatGaugeUpdatedAt = 0;

    const first = COMBAT_GAUGE_UPDATE_INTERVAL_MS + 1;
    advanceCombatGauge(subject, first, () => 0.4);
    expect(subject.combatGauge).toBe(300);

    const second = COMBAT_GAUGE_UPDATE_INTERVAL_MS * 2 + 1;
    advanceCombatGauge(subject, second, () => 0.400001);
    expect(subject.combatGauge).toBe(200);
  });

  it("still emits one shot for the threshold-crossing gauge step after that step consumes 200", () => {
    const subject = archer("triggered");
    const target = enemy("target");
    subject.targetId = target.id;
    subject.combatGauge = 200;
    subject.combatGaugeUpdatedAt = 0;
    const time = COMBAT_GAUGE_UPDATE_INTERVAL_MS + 1;

    const events = updateSpecialAttacks([subject, target], [], createBattleBases(), time, false, () => 1);
    expect(events.filter((event) => event.kind === "ARROW" && event.projectile.shooterId === subject.id)).toHaveLength(1);
    expect(subject.combatGauge).toBe(100);
  });
});
