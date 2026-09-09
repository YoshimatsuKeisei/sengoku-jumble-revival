import { describe, expect, it } from "vitest";
import {
  BATTLEFIELD_STRATEGY_SOURCE_GEOMETRY,
  battlefieldSourceDistanceToWorldX,
  battlefieldSourceDistanceToWorldY,
  battlefieldSourcePointToWorld,
  battlefieldWorldPointToSource,
} from "../battlefieldLayout";
import { createSoldier } from "../entities/Soldier";
import type { Soldier } from "../types";
import {
  startEngagement,
  updateChargeAI,
  updateDefendAI,
  updateInterceptAI,
  updateMeleeAI,
  updateWaitAI,
} from "./aiSystem";
import { clearReaction, startHitReaction } from "./reactionSystem";

function sourceUnit(
  id: string,
  team: "player" | "enemy",
  sourceX: number,
  sourceY: number,
  strategy: Soldier["strategy"] = "melee",
): Soldier {
  const point = battlefieldSourcePointToWorld({ x: sourceX, y: sourceY });
  return createSoldier(id, team, "ai", point.x, point.y, strategy);
}

function sourceObjective(soldier: Soldier): { x: number; y: number } {
  return battlefieldWorldPointToSource({ x: soldier.strategyObjectiveX, y: soldier.strategyObjectiveY });
}

describe("raw-SWF strategy objective and temporary engagement lifecycle", () => {
  it("charge advances without proactive nearest targeting and resumes after an invalid retaliation target", () => {
    const unit = sourceUnit("p", "player", 100, 500, "charge");
    const enemy = sourceUnit("e", "enemy", 110, 500);
    updateChargeAI(unit, [unit, enemy], 0);
    expect(unit.targetId).toBeNull();
    expect(unit.strategyObjectiveKind).toBe("ENEMY_SIDE");
    expect(unit.moveTargetX).toBeGreaterThan(unit.x);
    startHitReaction(unit, enemy, 10, 0, () => 1);
    expect(unit.targetId).toBe(enemy.id);
    enemy.isDead = true;
    updateChargeAI(unit, [unit, enemy], 20);
    expect(unit.targetId).toBeNull();
    expect(unit.strategy).toBe("charge");
    expect(unit.strategyObjectiveKind).toBe("ENEMY_SIDE");
  });

  it("RUSH ignores eligible non-contact charge retargeting on the confirmed 70% branch, never normal contact", () => {
    const unit = sourceUnit("p", "player", 100, 500, "charge");
    const enemy = sourceUnit("e", "enemy", 110, 500);
    unit.specialAbilities = ["RUSH"];
    startHitReaction(unit, enemy, 0, 0, () => 0.69, "GUN_ATTACK");
    expect(unit.targetId).toBeNull();
    clearReaction(unit);
    startHitReaction(unit, enemy, 1, 0, () => 0, "NORMAL_ATTACK");
    expect(unit.targetId).toBe(enemy.id);
  });

  it("defend applies the raw -200 unengaged-AI front bias before the X=434 threshold", () => {
    expect(BATTLEFIELD_STRATEGY_SOURCE_GEOMETRY.defendFrontLineX.player).toBe(434);
    const defender = sourceUnit("d", "player", 300, 500, "defend");
    const biased = sourceUnit("biased", "enemy", 600, 500, "charge");
    updateDefendAI(defender, [defender, biased], 0);
    expect(defender.targetId).toBe(biased.id);

    biased.targetId = "already-engaged";
    updateDefendAI(defender, [defender, biased], 1);
    expect(defender.targetId).toBeNull();
    expect([defender.moveTargetX, defender.moveTargetY]).toEqual([defender.anchorX, defender.anchorY]);
  });

  it("intercept reacts farther forward than defend after the same raw projection", () => {
    const defend = sourceUnit("d", "player", 300, 500, "defend");
    const intercept = sourceUnit("i", "player", 700, 500, "intercept");
    const candidate = sourceUnit("front", "enemy", 700, 500, "charge");
    updateDefendAI(defend, [defend, intercept, candidate], 0);
    updateInterceptAI(intercept, [defend, intercept, candidate], 0);
    expect(defend.targetId).toBeNull();
    expect(intercept.targetId).toBe(candidate.id);
    candidate.isDead = true;
    updateInterceptAI(intercept, [intercept, candidate], 1);
    expect(intercept.targetId).toBeNull();
    expect([intercept.moveTargetX, intercept.moveTargetY]).toEqual([intercept.anchorX, intercept.anchorY]);
  });

  it("mirrors frontmost selection for ENEMY defend and uses 30-step prediction only on the raw long-pursuit branch", () => {
    const defender = sourceUnit("d", "enemy", 1500, 300, "defend");
    const front = sourceUnit("front", "player", 1450, 600, "charge");
    const rear = sourceUnit("rear", "player", 1420, 600, "charge");
    front.velocityX = battlefieldSourceDistanceToWorldX(2);
    front.velocityY = battlefieldSourceDistanceToWorldY(-1);
    updateDefendAI(defender, [defender, front, rear], 0);
    expect(defender.targetId).toBe(front.id);
    expect(defender.strategyObjectiveKind).toBe("SEEK_COMBAT");
    const objective = sourceObjective(defender);
    expect(objective.x).toBeCloseTo(1510, 6);
    expect(objective.y).toBeCloseTo(570, 6);
  });

  it("melee selects by fixed random enemy roster slot rather than nearest distance", () => {
    const unit = sourceUnit("m", "player", 500, 400, "melee");
    const nearest = sourceUnit("near", "enemy", 510, 400);
    const farther = sourceUnit("far", "enemy", 900, 400);
    // 0.04 * 30 -> fixed slot 1, which is the farther unit.
    updateMeleeAI(unit, [unit, nearest, farther], 0, () => 0.04);
    expect(unit.targetId).toBe(farther.id);
  });

  it("melee moves to a raw integer random point after an invalid slot and reselects a fixed slot after arrival", () => {
    const unit = sourceUnit("m", "player", 500, 400, "melee");
    const dead = sourceUnit("dead", "enemy", 600, 400);
    const valid = sourceUnit("valid", "enemy", 700, 400);
    dead.isDead = true;
    updateMeleeAI(unit, [unit, dead, valid], 0, () => 0);
    expect(unit.targetId).toBeNull();
    expect(unit.strategyObjectiveKind).toBe("RANDOM_ROAM");
    unit.x = unit.strategyObjectiveX;
    unit.y = unit.strategyObjectiveY;
    updateMeleeAI(unit, [unit, dead, valid], 1, () => 0.04);
    expect(unit.targetId).toBe(valid.id);
  });

  it("wait never acquires a nearby enemy, retaliates when hit, then returns to anchor", () => {
    const unit = sourceUnit("w", "player", 100, 500, "wait");
    const enemy = sourceUnit("e", "enemy", 105, 500);
    updateWaitAI(unit, [unit, enemy], 0);
    expect(unit.targetId).toBeNull();
    startHitReaction(unit, enemy, 1, 0);
    expect(unit.targetId).toBe(enemy.id);
    enemy.state = "HEALING";
    updateWaitAI(unit, [unit, enemy], 2);
    expect(unit.targetId).toBeNull();
    expect([unit.moveTargetX, unit.moveTargetY]).toEqual([unit.anchorX, unit.anchorY]);
  });

  it("retains a valid charge retaliation engagement without arbitrary timeout or pursuit-distance release", () => {
    const unit = sourceUnit("p", "player", 100, 500, "charge");
    const enemy = sourceUnit("e", "enemy", 120, 500);
    startEngagement(unit, enemy, 0);
    unit.y = battlefieldSourcePointToWorld({ x: 100, y: 850 }).y;
    updateChargeAI(unit, [unit, enemy], 999_999);
    expect(unit.targetId).toBe(enemy.id);
  });
});
