import { describe, expect, it } from "vitest";
import { createSoldier } from "../../src/game/entities/Soldier";
import { applyDamage } from "../../src/game/systems/combatSystem";
import {
  advanceCombatGauge,
  beginTechniqueAction,
  COMBAT_GAUGE_UPDATE_INTERVAL_MS,
  hasTechniqueGauge,
} from "../../src/game/systems/combatGaugeSystem";
import { startHitReaction, SWF_HIT_REACTION_MS, updateReaction } from "../../src/game/systems/reactionSystem";
import { swfLogicTicksToMs } from "../../src/game/systems/techniqueCombatProfiles";
import abilitySpec from "../../swf-spec/rules/abilities.json";
import combatSpec from "../../swf-spec/rules/combat.json";
import damageSpec from "../../swf-spec/rules/damage.json";
import nonRangedGaugeSpec from "../../swf-spec/rules/non_ranged_gauge.json";

function nonRanged(id: string) {
  const soldier = createSoldier(id, "player", "ai", 500, 450);
  soldier.technique = "PROTOTYPE_AREA";
  return soldier;
}

function ranged(id: string) {
  const soldier = createSoldier(id, "player", "ai", 500, 450);
  soldier.unitType = "ARCHER";
  soldier.technique = "ARCHER_ARROW";
  return soldier;
}

describe("raw sgjbgm.swf re-audit corrections", () => {
  it("records corrected direct-SWF metadata instead of the previous generalized assumptions", () => {
    const nonRangedRule = nonRangedGaugeSpec.rules.find((rule) => rule.id === "NON_RANGED_SPECIAL_GAUGE_SEMANTICS");
    expect(nonRangedRule?.status).toBe("confirmed");
    expect(nonRangedRule?.expected).toMatchObject({
      activationThresholdExclusive: 400,
      requiresSpZero: true,
      normalGaugeOperationBeforeSpl: "reset_to_zero",
      doubleSpecialRetentionChance: 0.4,
      doubleSpecialRetentionInclusiveRandomBoundary: true,
      doubleSpecialRetentionMaximumExpression: "399 + kp",
      splCalledAfterGaugeDecision: true,
      mustNotReRollRetentionInsideBeginTechniqueAction: true,
    });

    const scheduler = nonRangedGaugeSpec.rules.find((rule) => rule.id === "COMBAT_GAUGE_UPDATE_INTERVAL");
    expect(scheduler?.status).toBe("confirmed");
    expect(scheduler?.expected).toMatchObject({ initialCounter: 19, steadyIntervalLogicTicks: 23, firstTriggerAfterLogicTicks: 4 });

    const projectile = combatSpec.rules.find((rule) => rule.id === "RANGED_ATTACK_CYCLE_SINGLE_LAUNCH");
    expect(projectile?.expected.projectileChildTimelineFrames).toBe(5);
    expect(projectile?.expected.projectileStopFrame).toBe(5);

    expect(abilitySpec.rules.find((rule) => rule.id === "NON_RANGED_DOUBLE_SPECIAL_RETENTION")?.status).toBe("confirmed");
    expect(abilitySpec.rules.find((rule) => rule.id === "RANGED_DOUBLE_SPECIAL_RETENTION")?.expected.globalMaximumTwoActivations).toBe(false);

    const damage = damageSpec.rules.find((rule) => rule.id === "DAMAGE_REACTION_PRIORITY");
    expect(damage?.expected).toMatchObject({ hitReactionLogicTicks: 10, fatalHitStillCompletesHitReaction: true,
      deathCheckRequiresHpBelowOneAndKZero: true, deathState: 99 });
  });

  it("matches the SWF tc=19 initial phase: first scd opportunity occurs after four logic frames", () => {
    const soldier = nonRanged("initial-phase");
    soldier.stats.skill = 1;
    soldier.combatGauge = 400;
    soldier.combatGaugeUpdatedAt = null;

    advanceCombatGauge(soldier, 0, () => 1);
    expect(soldier.combatGauge).toBe(400);
    advanceCombatGauge(soldier, swfLogicTicksToMs(3), () => 1);
    expect(soldier.combatGauge).toBe(400);
    advanceCombatGauge(soldier, swfLogicTicksToMs(4), () => 1);
    expect(soldier.combatGauge).toBe(0);
    expect(hasTechniqueGauge(soldier)).toBe(true);
  });

  it("makes the non-ranged s21 decision in scd and does not roll it again at action start", () => {
    const soldier = nonRanged("non-ranged-s21");
    soldier.stats.skill = 2;
    soldier.specialAbilities = ["DOUBLE_SPECIAL"];
    soldier.combatGauge = 399;
    soldier.combatGaugeUpdatedAt = 0;

    advanceCombatGauge(soldier, COMBAT_GAUGE_UPDATE_INTERVAL_MS, () => 0.4);
    expect(soldier.combatGauge).toBe(401);
    expect(hasTechniqueGauge(soldier)).toBe(true);

    expect(beginTechniqueAction(soldier, COMBAT_GAUGE_UPDATE_INTERVAL_MS, () => 1, true)).toBe(true);
    expect(soldier.combatGauge).toBe(401);
    expect(hasTechniqueGauge(soldier)).toBe(false);
  });

  it("does not encode a global two-activation cap for ranged s21 retention", () => {
    const soldier = ranged("ranged-s21-chain");
    soldier.stats.skill = 100;
    soldier.specialAbilities = ["DOUBLE_SPECIAL"];
    soldier.combatGauge = 200;
    soldier.combatGaugeUpdatedAt = 0;

    advanceCombatGauge(soldier, COMBAT_GAUGE_UPDATE_INTERVAL_MS, () => 0.4);
    expect(hasTechniqueGauge(soldier)).toBe(true);
    expect(soldier.combatGauge).toBe(300);

    advanceCombatGauge(soldier, COMBAT_GAUGE_UPDATE_INTERVAL_MS * 2, () => 0.4);
    expect(hasTechniqueGauge(soldier)).toBe(true);
    expect(soldier.combatGauge).toBe(400);

    advanceCombatGauge(soldier, COMBAT_GAUGE_UPDATE_INTERVAL_MS * 3, () => 0.4);
    expect(hasTechniqueGauge(soldier)).toBe(true);
    expect(soldier.combatGauge).toBe(300);
  });

  it("keeps a fatal hit in the confirmed k=10 hit reaction before final death", () => {
    const attacker = nonRanged("attacker");
    const target = nonRanged("target");
    target.hp = 1;

    expect(SWF_HIT_REACTION_MS).toBeCloseTo(swfLogicTicksToMs(10));
    applyDamage(target, 1);
    expect(target.hp).toBe(0);
    expect(target.isDead).toBe(false);

    startHitReaction(target, attacker, 0);
    expect(target.reactionState).toBe("HIT_STUN");

    updateReaction(target, [], swfLogicTicksToMs(9), swfLogicTicksToMs(9));
    expect(target.isDead).toBe(false);
    expect(target.reactionState).toBe("HIT_STUN");

    updateReaction(target, [], swfLogicTicksToMs(10), swfLogicTicksToMs(1));
    expect(target.isDead).toBe(true);
    expect(target.battleOutState).toBe("EXITING");
  });
});
