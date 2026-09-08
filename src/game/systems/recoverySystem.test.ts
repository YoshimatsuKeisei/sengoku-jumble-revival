import { describe, expect, it } from "vitest";
import { RECOVERY_CONFIG } from "../config";
import { battlefieldSourcePointToWorld, battlefieldWorldPointToSource } from "../battlefieldLayout";
import { createSoldier } from "../entities/Soldier";
import { updateAiTargets } from "./aiSystem";
import { applyDamage } from "./combatSystem";
import { updateAttackStates } from "./attackSystem";
import { createBattleBases } from "./baseSystem";
import { startHitReaction, SWF_HIT_REACTION_MS, updateReaction } from "./reactionSystem";
import {
  shouldEmergencyRetreat,
  startEmergencyRetreat,
  updateEmergencyRetreat,
  updateHealing,
  updateRejoining,
  updateRecoveryStates,
} from "./recoverySystem";

describe("recovery state system", () => {
  it("starts emergency retreat at the temporary danger threshold and clears combat", () => {
    const unit = createSoldier("p", "player", "ai", 100, 500, "defend");
    unit.hp = unit.maxHp * RECOVERY_CONFIG.dangerHpRatio;
    unit.targetId = "enemy";
    expect(shouldEmergencyRetreat(unit)).toBe(true);
    updateRecoveryStates([unit], 0);
    expect(unit.state).toBe("EMERGENCY_RETREAT");
    expect(unit.targetId).toBeNull();
    expect(unit.strategy).toBe("defend");
  });

  it("does not run strategy targeting during emergency retreat", () => {
    const unit = createSoldier("p", "player", "ai", 100, 500, "melee");
    const enemy = createSoldier("e", "enemy", "ai", 110, 500);
    startEmergencyRetreat(unit);
    updateAiTargets([unit, enemy]);
    expect(unit.targetId).toBeNull();
  });

  it("cannot attack while emergency retreat has priority", () => {
    const unit = createSoldier("p", "player", "ai", 100, 500, "melee");
    const enemy = createSoldier("e", "enemy", "ai", 110, 500);
    startEmergencyRetreat(unit);
    unit.targetId = enemy.id;
    updateAttackStates([unit, enemy], createBattleBases(), 1_000);
    expect(enemy.hp).toBe(enemy.maxHp);
  });

  it("enters healing only on its confirmed SWF recovery tile", () => {
    const bases = createBattleBases();
    const outside = battlefieldSourcePointToWorld({ x: 240, y: 432 });
    const unit = createSoldier("p", "player", "ai", outside.x, outside.y, "charge");
    unit.state = "EMERGENCY_RETREAT";
    updateEmergencyRetreat(unit, bases);
    expect(unit.state).toBe("EMERGENCY_RETREAT");

    const tile999 = battlefieldSourcePointToWorld({ x: 216, y: 432 });
    Object.assign(unit, tile999);
    updateEmergencyRetreat(unit, bases);
    expect(unit.state).toBe("HEALING");
    expect(unit.moveTargetX).toBeNull();
  });

  it("heals using SWF logic time, stays at exact max, then enters p7-equivalent rejoin on overshoot", () => {
    const point = battlefieldSourcePointToWorld({ x: 100, y: 500 });
    const unit = createSoldier("p", "player", "ai", point.x, point.y);
    unit.state = "HEALING";
    unit.hp = unit.maxHp - 20;
    const hpBefore = unit.hp;
    updateHealing(unit, 0.5);
    expect(unit.hp).toBeCloseTo(hpBefore + unit.maxHp / 400 * 24 * 0.5);
    expect(unit.state).toBe("HEALING");

    unit.hp = unit.maxHp - unit.maxHp / 400;
    updateHealing(unit, 1 / 24);
    expect(unit.hp).toBeCloseTo(unit.maxHp);
    expect(unit.state).toBe("HEALING");
    updateHealing(unit, 1 / 24);
    expect(unit.hp).toBe(unit.maxHp);
    expect(unit.state).toBe("REJOINING");
  });

  it("returns to normal below the strict p7 Manhattan threshold without changing strategy", () => {
    const point = battlefieldSourcePointToWorld({ x: 1500, y: 249 });
    const unit = createSoldier("e", "enemy", "ai", point.x, point.y, "wait");
    unit.state = "REJOINING";
    unit.recoveryGate = "TOP";
    updateRejoining(unit);
    expect(unit.state).toBe("NORMAL");
    expect(unit.strategy).toBe("wait");
    expect(unit.moveTargetX).toBeNull();
    expect(unit.moveTargetY).toBeNull();
  });

  it("keeps p7 active at exactly 50 source Manhattan units", () => {
    const point = battlefieldSourcePointToWorld({ x: 296, y: 249 });
    const unit = createSoldier("p7", "player", "ai", point.x, point.y, "wait");
    unit.state = "REJOINING";
    unit.recoveryGate = "TOP";
    updateRejoining(unit);
    expect(unit.state).toBe("REJOINING");
    const target = battlefieldWorldPointToSource({ x: unit.moveTargetX!, y: unit.moveTargetY! });
    expect(target).toEqual({ x: 346, y: 249 });
  });

  it("does not loop from healing back into emergency retreat", () => {
    const unit = createSoldier("p", "player", "ai", 0, 0);
    unit.state = "HEALING";
    unit.hp = 10;
    updateRecoveryStates([unit], 0.1);
    expect(unit.state).toBe("HEALING");
  });

  it("finishes the SWF hit reaction before death while retreating", () => {
    const unit = createSoldier("p", "player", "ai", 0, 0);
    const attacker = createSoldier("e", "enemy", "ai", 10, 0);
    startEmergencyRetreat(unit);
    applyDamage(unit, unit.maxHp);
    startHitReaction(unit, attacker, 0);
    updateRecoveryStates([unit], 0);
    expect(unit.isDead).toBe(false);
    expect(unit.reactionState).toBe("HIT_STUN");
    updateReaction(unit, [], SWF_HIT_REACTION_MS, SWF_HIT_REACTION_MS);
    expect(unit.isDead).toBe(true);
    expect(unit.hp).toBe(0);
  });
});
