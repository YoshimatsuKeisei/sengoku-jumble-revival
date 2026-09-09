import { describe, expect, it } from "vitest";
import {
  battlefieldSourcePointToWorld,
  battlefieldWorldPointToSource,
} from "../../src/game/battlefieldLayout";
import { createSoldier } from "../../src/game/entities/Soldier";
import { updateNormalCombatContests } from "../../src/game/systems/normalCombatSystem";
import {
  resolveRawNormalContactAttack,
  SWF_IRON_WALL_GUARD_IMPULSE_UNITS,
  SWF_NORMAL_CONTACT_IMPULSE_UNITS,
  SWF_NORMAL_CONTACT_K_TICKS,
} from "../../src/game/systems/normalContactAttackSystem";
import {
  getRawFiToward,
  getRawOppositeFi,
  SWF_DIRECTION_FX,
  SWF_DIRECTION_FY,
} from "../../src/game/systems/rawCombatImpulseSystem";
import { updateReactions } from "../../src/game/systems/reactionSystem";
import { swfLogicTicksToMs } from "../../src/game/systems/techniqueCombatProfiles";
import combatSpec from "../../swf-spec/rules/combat.json";

function unit(id: string, team: "player" | "enemy", x: number, y: number) {
  const point = battlefieldSourcePointToWorld({ x, y });
  return createSoldier(id, team, "ai", point.x, point.y, "melee");
}

function sequence(...values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0;
}

describe("direct raw-SWF normal contact atck(mode=0)", () => {
  it("records synchronous mode-0 timing, k=10, defense boundary, and raw impulse metadata", () => {
    const rule = combatSpec.rules.find((candidate) => candidate.id === "NORMAL_CONTACT_ATTACK_TIMING");
    expect(rule?.status).toBe("confirmed");
    expect(rule?.expected).toMatchObject({
      atckMode: 0,
      resolutionIsSynchronousWithContactContest: true,
      independentWindupMs: null,
      laterRangeRecheckBeforeDamage: false,
      independentRecoveryMs: null,
      separateCooldownMs: null,
      defenseRandomScale: 200,
      guardIncludesEquality: true,
      damageMutatesHpInAtckCall: true,
      kAssignedToDefender: 10,
      kAssignedToAttacker: 10,
      impulseTicks: 10,
      impulseDecayPerTick: 0.7,
      normalDefenderInitialImpulseUnits: 10,
      ironWallGuardDefenderInitialImpulseUnits: 5,
      ironWallGuardAttackerOppositeInitialImpulseUnits: 10,
      fatalCleanupWaitsForKResponse: true,
    });
    expect(rule?.expected.directionFx).toEqual(SWF_DIRECTION_FX);
    expect(rule?.expected.directionFy).toEqual(SWF_DIRECTION_FY);
  });

  it("mutates HP synchronously on contact instead of reserving a later windup hit", () => {
    const attacker = unit("a", "player", 500, 500);
    const defender = unit("d", "enemy", 520, 500);
    defender.stats.defense = 0;
    const before = defender.hp;

    const result = resolveRawNormalContactAttack(attacker, defender, 0, () => 1);

    expect(result.resolved).toBe(true);
    expect(result.guarded).toBe(false);
    expect(result.appliedDamage).toBe(1);
    expect(defender.hp).toBe(before - 1);
    expect(defender.reactionState).toBe("HIT_STUN");
    expect(attacker.combatActionState).toBe("ATTACK_RECOVERY");
    expect(attacker.attackHitApplied).toBe(true);
    expect(attacker.attackHitAt).toBe(0);
    expect(attacker.attackRecoveryEndsAt).toBeCloseTo(swfLogicTicksToMs(SWF_NORMAL_CONTACT_K_TICKS + 1));
  });

  it("guards on the exact random*200 == defense boundary and hits immediately above it", () => {
    const attacker = unit("a", "player", 500, 500);
    const exact = unit("exact", "enemy", 520, 500);
    exact.stats.defense = 100;
    const exactResult = resolveRawNormalContactAttack(attacker, exact, 0, () => 0.5);
    expect(exactResult.guarded).toBe(true);
    expect(exact.hp).toBe(exact.maxHp);

    const attacker2 = unit("a2", "player", 500, 600);
    const above = unit("above", "enemy", 520, 600);
    above.stats.defense = 100;
    const aboveResult = resolveRawNormalContactAttack(attacker2, above, 0, () => 0.500001);
    expect(aboveResult.guarded).toBe(false);
    expect(above.hp).toBe(above.maxHp - 1);
  });

  it("uses the exact eight-direction fx/fy table and applies 10 then 7 source units on successive k ticks", () => {
    const attacker = unit("a", "player", 500, 500);
    const defender = unit("d", "enemy", 520, 500);
    defender.stats.defense = 0;
    const fi = getRawFiToward(defender, attacker);
    const start = battlefieldWorldPointToSource(defender);
    resolveRawNormalContactAttack(attacker, defender, 0, () => 1);

    updateReactions([attacker, defender], [], swfLogicTicksToMs(1), swfLogicTicksToMs(1));
    let source = battlefieldWorldPointToSource(defender);
    expect(source.x - start.x).toBeCloseTo(SWF_DIRECTION_FX[fi] * SWF_NORMAL_CONTACT_IMPULSE_UNITS, 6);
    expect(source.y - start.y).toBeCloseTo(SWF_DIRECTION_FY[fi] * SWF_NORMAL_CONTACT_IMPULSE_UNITS, 6);

    updateReactions([attacker, defender], [], swfLogicTicksToMs(2), swfLogicTicksToMs(1));
    source = battlefieldWorldPointToSource(defender);
    expect(source.x - start.x).toBeCloseTo(
      SWF_DIRECTION_FX[fi] * SWF_NORMAL_CONTACT_IMPULSE_UNITS * (1 + 0.7),
      6,
    );
    expect(source.y - start.y).toBeCloseTo(
      SWF_DIRECTION_FY[fi] * SWF_NORMAL_CONTACT_IMPULSE_UNITS * (1 + 0.7),
      6,
    );
  });

  it("gives only an IRON_WALL successful guard the defender-5 plus opposite-attacker-10 impulse pair", () => {
    const attacker = unit("a", "player", 500, 500);
    const defender = unit("d", "enemy", 520, 500);
    defender.stats.defense = 100;
    defender.specialAbilities = ["IRON_WALL"];
    const defenderFi = getRawFiToward(defender, attacker);
    const attackerFi = getRawOppositeFi(defenderFi);
    const attackerStart = battlefieldWorldPointToSource(attacker);
    const defenderStart = battlefieldWorldPointToSource(defender);

    const result = resolveRawNormalContactAttack(attacker, defender, 0, () => 0);
    expect(result.guarded).toBe(true);
    updateReactions([attacker, defender], [], swfLogicTicksToMs(1), swfLogicTicksToMs(1));

    const attackerAfter = battlefieldWorldPointToSource(attacker);
    const defenderAfter = battlefieldWorldPointToSource(defender);
    expect(defenderAfter.x - defenderStart.x).toBeCloseTo(
      SWF_DIRECTION_FX[defenderFi] * SWF_IRON_WALL_GUARD_IMPULSE_UNITS,
      6,
    );
    expect(defenderAfter.y - defenderStart.y).toBeCloseTo(
      SWF_DIRECTION_FY[defenderFi] * SWF_IRON_WALL_GUARD_IMPULSE_UNITS,
      6,
    );
    expect(attackerAfter.x - attackerStart.x).toBeCloseTo(
      SWF_DIRECTION_FX[attackerFi] * SWF_NORMAL_CONTACT_IMPULSE_UNITS,
      6,
    );
    expect(attackerAfter.y - attackerStart.y).toBeCloseTo(
      SWF_DIRECTION_FY[attackerFi] * SWF_NORMAL_CONTACT_IMPULSE_UNITS,
      6,
    );
  });

  it("does not give an ordinary successful guard an attacker recoil impulse", () => {
    const attacker = unit("a", "player", 500, 500);
    const defender = unit("d", "enemy", 520, 500);
    defender.stats.defense = 100;
    const attackerStart = battlefieldWorldPointToSource(attacker);
    const defenderStart = battlefieldWorldPointToSource(defender);
    const defenderFi = getRawFiToward(defender, attacker);

    const result = resolveRawNormalContactAttack(attacker, defender, 0, () => 0);
    expect(result.guarded).toBe(true);
    updateReactions([attacker, defender], [], swfLogicTicksToMs(1), swfLogicTicksToMs(1));

    const attackerAfter = battlefieldWorldPointToSource(attacker);
    const defenderAfter = battlefieldWorldPointToSource(defender);
    expect(attackerAfter.x).toBeCloseTo(attackerStart.x, 6);
    expect(attackerAfter.y).toBeCloseTo(attackerStart.y, 6);
    expect(defenderAfter.x - defenderStart.x).toBeCloseTo(
      SWF_DIRECTION_FX[defenderFi] * SWF_NORMAL_CONTACT_IMPULSE_UNITS,
      6,
    );
  });

  it("uses k rather than the legacy 700ms cooldown to suppress an immediate repeat contact", () => {
    const attacker = unit("a", "player", 500, 500);
    const defender = unit("d", "enemy", 510, 500);
    attacker.stats.combat = 100;
    defender.stats.combat = 0;
    defender.stats.defense = 0;
    attacker.attackCooldownMs = 99_999;
    const draws = sequence(0, 1, 0, 1);

    updateNormalCombatContests([attacker, defender], 0, draws);
    const afterFirst = defender.hp;
    updateNormalCombatContests([attacker, defender], swfLogicTicksToMs(5), draws);
    expect(defender.hp).toBe(afterFirst);

    updateReactions(
      [attacker, defender],
      [],
      swfLogicTicksToMs(10),
      swfLogicTicksToMs(10),
    );
    updateNormalCombatContests([attacker, defender], swfLogicTicksToMs(11), draws);
    expect(defender.hp).toBe(afterFirst - 1);
  });

  it("keeps fatal HP at zero through the k response and finalizes battle-out only after it completes", () => {
    const attacker = unit("a", "player", 500, 500);
    const defender = unit("d", "enemy", 520, 500);
    defender.stats.defense = 0;
    defender.hp = 1;

    resolveRawNormalContactAttack(attacker, defender, 0, () => 1);
    expect(defender.hp).toBe(0);
    expect(defender.isDead).toBe(false);

    updateReactions([attacker, defender], [], swfLogicTicksToMs(9), swfLogicTicksToMs(9));
    expect(defender.isDead).toBe(false);
    updateReactions([attacker, defender], [], swfLogicTicksToMs(10), swfLogicTicksToMs(1));
    expect(defender.isDead).toBe(true);
    expect(defender.battleOutState).toBe("EXITING");
  });
});
