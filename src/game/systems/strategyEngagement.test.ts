import { describe, expect, it } from "vitest";
import { BATTLEFIELD_CONFIG, STRATEGY_ENGAGEMENT_CONFIG } from "../config";
import { createSoldier } from "../entities/Soldier";
import {
  startEngagement,
  updateChargeAI,
  updateDefendAI,
  updateInterceptAI,
  updateMeleeAI,
  updateWaitAI,
} from "./aiSystem";

describe("strategy objective and engagement lifecycle", () => {
  it("keeps a valid combat target when a closer enemy appears", () => {
    const unit = createSoldier("p", "player", "ai", 100, 500, "charge");
    const target = createSoldier("e1", "enemy", "ai", 180, 500);
    const closer = createSoldier("e2", "enemy", "ai", 110, 500);
    startEngagement(unit, target, 100);
    updateChargeAI(unit, [unit, target, closer], 200);
    expect(unit.targetId).toBe(target.id);
  });

  it("clears a dead charge target and returns to the enemy-side objective", () => {
    const unit = createSoldier("p", "player", "ai", 100, 500, "charge");
    const target = createSoldier("e", "enemy", "ai", 120, 500);
    startEngagement(unit, target, 0);
    target.isDead = true;
    updateChargeAI(unit, [unit, target], 100);
    expect(unit.targetId).toBeNull();
    expect(unit.strategyObjectiveKind).toBe("ENEMY_SIDE");
    expect(unit.moveTargetX).toBeGreaterThan(unit.x);
  });

  it("does not pull charge soldiers toward enemies outside detection range", () => {
    const unit = createSoldier("p", "player", "ai", 100, 500, "charge");
    const enemy = createSoldier("e", "enemy", "ai", 100, 100);
    updateChargeAI(unit, [unit, enemy], 0);
    expect(unit.targetId).toBeNull();
    expect(unit.moveTargetX).toBeGreaterThan(unit.x);
  });

  it("clears charge engagements after the pursuit distance is exceeded", () => {
    const unit = createSoldier("p", "player", "ai", 100, 500, "charge");
    const enemy = createSoldier("e", "enemy", "ai", 120, 500);
    startEngagement(unit, enemy, 0);
    unit.y -= STRATEGY_ENGAGEMENT_CONFIG.charge.maxPursuitDistance + 1;
    updateChargeAI(unit, [unit, enemy], 100);
    expect(unit.targetId).toBeNull();
  });

  it("clears engagements after the strategy time limit", () => {
    const unit = createSoldier("p", "player", "ai", 100, 500, "charge");
    const enemy = createSoldier("e", "enemy", "ai", 120, 500);
    startEngagement(unit, enemy, 0);
    updateChargeAI(unit, [unit, enemy], STRATEGY_ENGAGEMENT_CONFIG.charge.maxEngagementMs);
    expect(unit.targetId).toBeNull();
    expect(unit.engagementStartedAt).toBeNull();
  });

  it("does not acquire enemies outside the defend recognition area", () => {
    const unit = createSoldier("p", "player", "ai", 100, 500, "defend");
    const enemy = createSoldier("e", "enemy", "ai", 100, 200);
    updateDefendAI(unit, [unit, enemy], 0);
    expect(unit.targetId).toBeNull();
  });

  it("drops a defender target that leaves its pursuit area and returns to anchor", () => {
    const unit = createSoldier("p", "player", "ai", 100, 500, "defend");
    const enemy = createSoldier("e", "enemy", "ai", 110, 500);
    startEngagement(unit, enemy, 0);
    enemy.y = 100;
    updateDefendAI(unit, [unit, enemy], 100);
    expect(unit.targetId).toBeNull();
    expect([unit.moveTargetX, unit.moveTargetY]).toEqual([unit.anchorX, unit.anchorY]);
  });

  it("returns intercept soldiers to their team intercept point", () => {
    const unit = createSoldier("p", "player", "ai", 100, 500, "intercept");
    updateInterceptAI(unit, [unit], 0);
    expect(unit.strategyObjectiveKind).toBe("INTERCEPT_POINT");
    expect(unit.moveTargetX).toBe(BATTLEFIELD_CONFIG.playerInterceptX);
  });

  it("keeps a valid melee target instead of selecting a nearer one", () => {
    const unit = createSoldier("p", "player", "ai", 0, 0, "melee");
    const current = createSoldier("e1", "enemy", "ai", 100, 0);
    const nearer = createSoldier("e2", "enemy", "ai", 10, 0);
    startEngagement(unit, current, 0);
    updateMeleeAI(unit, [unit, current, nearer], 100);
    expect(unit.targetId).toBe(current.id);
  });

  it("lets melee acquire another target after its target dies", () => {
    const unit = createSoldier("p", "player", "ai", 0, 0, "melee");
    const dead = createSoldier("e1", "enemy", "ai", 10, 0);
    const next = createSoldier("e2", "enemy", "ai", 20, 0);
    startEngagement(unit, dead, 0);
    dead.isDead = true;
    updateMeleeAI(unit, [unit, dead, next], 100);
    expect(unit.targetId).toBe(next.id);
  });

  it("wait only recognizes nearby enemies", () => {
    const unit = createSoldier("p", "player", "ai", 100, 500, "wait");
    const far = createSoldier("e", "enemy", "ai", 100, 300);
    updateWaitAI(unit, [unit, far], 0);
    expect(unit.targetId).toBeNull();
    far.y = 450;
    updateWaitAI(unit, [unit, far], 100);
    expect(unit.targetId).toBe(far.id);
  });

  it("drops a waiting soldier's distant target and returns to anchor", () => {
    const unit = createSoldier("p", "player", "ai", 100, 500, "wait");
    const enemy = createSoldier("e", "enemy", "ai", 110, 500);
    startEngagement(unit, enemy, 0);
    enemy.y = 200;
    updateWaitAI(unit, [unit, enemy], 100);
    expect(unit.targetId).toBeNull();
    expect([unit.moveTargetX, unit.moveTargetY]).toEqual([unit.anchorX, unit.anchorY]);
  });
});
