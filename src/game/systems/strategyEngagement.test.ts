import { describe, expect, it } from "vitest";
import { BATTLEFIELD_STRATEGY_SOURCE_GEOMETRY, battlefieldSourcePointToWorld } from "../battlefieldLayout";
import { createSoldier } from "../entities/Soldier";
import {
  startEngagement,
  updateChargeAI,
  updateDefendAI,
  updateInterceptAI,
  updateMeleeAI,
  updateWaitAI,
} from "./aiSystem";
import { startHitReaction } from "./reactionSystem";

describe("SWF strategy objective and temporary engagement lifecycle", () => {
  it("charge advances without proactive nearest targeting and resumes after an invalid retaliation target", () => {
    const unit = createSoldier("p", "player", "ai", 100, 500, "charge");
    const enemy = createSoldier("e", "enemy", "ai", 110, 500);
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

  it("RUSH maps to 突進 behavior and ignores charge retaliation on the confirmed 70% branch", () => {
    const unit = createSoldier("p", "player", "ai", 100, 500, "charge");
    const enemy = createSoldier("e", "enemy", "ai", 110, 500);
    unit.specialAbilities = ["RUSH"];
    startHitReaction(unit, enemy, 0, 0, () => 0.69);
    expect(unit.targetId).toBeNull();
    startHitReaction(unit, enemy, 1, 0, () => 0.70);
    expect(unit.targetId).toBe(enemy.id);
  });

  it("defend keeps its anchor before the threshold, then selects the global frontmost invader", () => {
    const threshold = battlefieldSourcePointToWorld({ x: BATTLEFIELD_STRATEGY_SOURCE_GEOMETRY.defendFrontLineX.player, y: 0 }).x;
    const defender = createSoldier("d", "player", "ai", 300, 500, "defend");
    const rear = createSoldier("rear", "enemy", "ai", threshold + 20, 500);
    const front = createSoldier("front", "enemy", "ai", threshold + 1, 600);
    updateDefendAI(defender, [defender, rear, front], 0);
    expect(defender.targetId).toBeNull();
    expect([defender.moveTargetX, defender.moveTargetY]).toEqual([defender.anchorX, defender.anchorY]);
    front.velocityX = -2;
    updateDefendAI(defender, [defender, rear, front], 1);
    expect(defender.targetId).toBe(front.id);
    front.x = threshold + 100;
    updateDefendAI(defender, [defender, rear, front], 2);
    expect(defender.targetId).toBe(front.id);
    front.isDead = true;
    updateDefendAI(defender, [defender, rear, front], 3);
    expect(defender.targetId).toBeNull();
    expect([defender.moveTargetX, defender.moveTargetY]).toEqual([defender.anchorX, defender.anchorY]);
  });

  it("intercept reacts farther forward than defend and also chooses the frontmost enemy", () => {
    const defendLine = battlefieldSourcePointToWorld({ x: BATTLEFIELD_STRATEGY_SOURCE_GEOMETRY.defendFrontLineX.player, y: 0 }).x;
    const interceptLine = battlefieldSourcePointToWorld({ x: BATTLEFIELD_STRATEGY_SOURCE_GEOMETRY.interceptFrontLineX.player, y: 0 }).x;
    const defend = createSoldier("d", "player", "ai", 300, 500, "defend");
    const intercept = createSoldier("i", "player", "ai", 700, 500, "intercept");
    const front = createSoldier("front", "enemy", "ai", (defendLine + interceptLine) / 2, 500);
    const rear = createSoldier("rear", "enemy", "ai", interceptLine - 1, 500);
    updateDefendAI(defend, [defend, intercept, front, rear], 0);
    updateInterceptAI(intercept, [defend, intercept, front, rear], 0);
    expect(defend.targetId).toBeNull();
    expect(intercept.targetId).toBe(front.id);
    front.isDead = true;
    rear.isDead = true;
    updateInterceptAI(intercept, [intercept, front, rear], 1);
    expect(intercept.targetId).toBeNull();
    expect([intercept.moveTargetX, intercept.moveTargetY]).toEqual([intercept.anchorX, intercept.anchorY]);
  });

  it("mirrors frontmost selection for ENEMY defend and uses the 30-tick pursuit prediction", () => {
    const threshold = battlefieldSourcePointToWorld({ x: BATTLEFIELD_STRATEGY_SOURCE_GEOMETRY.defendFrontLineX.enemy, y: 0 }).x;
    const defender = createSoldier("d", "enemy", "ai", threshold + 50, 300, "defend");
    const front = createSoldier("front", "player", "ai", threshold - 1, 500);
    const rear = createSoldier("rear", "player", "ai", threshold - 20, 500);
    front.velocityX = 2;
    front.velocityY = -1;
    updateDefendAI(defender, [defender, front, rear], 0);
    expect(defender.targetId).toBe(front.id);
    expect(defender.strategyObjectiveKind).toBe("SEEK_COMBAT");
    expect(defender.strategyObjectiveX).toBe(front.x + front.velocityX * 30);
    expect(defender.strategyObjectiveY).toBe(front.y + front.velocityY * 30);
  });

  it("melee selects by random enemy slot rather than nearest", () => {
    const unit = createSoldier("m", "player", "ai", 500, 400, "melee");
    const nearest = createSoldier("near", "enemy", "ai", 510, 400);
    const farther = createSoldier("far", "enemy", "ai", 900, 400);
    updateMeleeAI(unit, [unit, nearest, farther], 0, () => 0.75);
    expect(unit.targetId).toBe(farther.id);
  });

  it("melee moves to a source-space random point after an invalid slot and reselects after arrival", () => {
    const unit = createSoldier("m", "player", "ai", 500, 400, "melee");
    const dead = createSoldier("dead", "enemy", "ai", 600, 400);
    const valid = createSoldier("valid", "enemy", "ai", 700, 400);
    dead.isDead = true;
    updateMeleeAI(unit, [unit, dead, valid], 0, () => 0);
    expect(unit.targetId).toBeNull();
    expect(unit.strategyObjectiveKind).toBe("RANDOM_ROAM");
    unit.x = unit.strategyObjectiveX;
    unit.y = unit.strategyObjectiveY;
    updateMeleeAI(unit, [unit, dead, valid], 1, () => 0.75);
    expect(unit.targetId).toBe(valid.id);
  });

  it("wait never acquires a nearby enemy, retaliates when hit, then returns to anchor", () => {
    const unit = createSoldier("w", "player", "ai", 100, 500, "wait");
    const enemy = createSoldier("e", "enemy", "ai", 105, 500);
    updateWaitAI(unit, [unit, enemy], 0);
    expect(unit.targetId).toBeNull();
    startHitReaction(unit, enemy, 1, 0);
    expect(unit.targetId).toBe(enemy.id);
    enemy.state = "HEALING";
    updateWaitAI(unit, [unit, enemy], 2);
    expect(unit.targetId).toBeNull();
    expect([unit.moveTargetX, unit.moveTargetY]).toEqual([unit.anchorX, unit.anchorY]);
  });

  it("retains a valid engagement without arbitrary timeout or pursuit-distance release", () => {
    const unit = createSoldier("p", "player", "ai", 100, 500, "charge");
    const enemy = createSoldier("e", "enemy", "ai", 120, 500);
    startEngagement(unit, enemy, 0);
    unit.y = 850;
    updateChargeAI(unit, [unit, enemy], 999_999);
    expect(unit.targetId).toBe(enemy.id);
  });
});
