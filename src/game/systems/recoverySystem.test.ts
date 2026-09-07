import { describe, expect, it } from "vitest";
import { createSoldier } from "../entities/Soldier";
import { updateAiTargets } from "./aiSystem";
import { applyDamage } from "./combatSystem";
import { updateAttackStates } from "./attackSystem";
import { movePlayer } from "./movementSystem";
import { createBattleBases } from "./baseSystem";
import { getBaseGatePoint } from "./battlefieldGeometry";
import {
  recoveryDestinationFor,
  rejoinPointFor,
  shouldEmergencyRetreat,
  startEmergencyRetreat,
  updateEmergencyRetreat,
  updateHealing,
  updateRejoining,
  updateRecoveryStates,
} from "./recoverySystem";

describe("recovery state system", () => {
  it("starts emergency retreat below 20 percent and clears combat", () => {
    const unit = createSoldier("p", "player", "ai", 100, 500, "defend");
    unit.maxHp = 100;
    unit.hp = 19;
    unit.targetId = "enemy";
    expect(shouldEmergencyRetreat(unit)).toBe(true);
    updateRecoveryStates([unit], 0);
    expect(unit.state).toBe("EMERGENCY_RETREAT");
    expect(unit.targetId).toBeNull();
    expect(unit.strategy).toBe("defend");
  });

  it("uses floor(percent)<20 OR HP<6, while HP0 is battle-out only", () => {
    const unit = createSoldier("p", "player", "ai", 0, 0);
    unit.maxHp = 100;
    unit.hp = 20;
    expect(shouldEmergencyRetreat(unit)).toBe(false);
    unit.maxHp = 20;
    unit.hp = 5;
    expect(shouldEmergencyRetreat(unit)).toBe(true);
    unit.hp = 6;
    expect(shouldEmergencyRetreat(unit)).toBe(false);
    unit.hp = 0;
    expect(shouldEmergencyRetreat(unit)).toBe(false);
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

  it("enters healing only after clearing its friendly gate", () => {
    const station = recoveryDestinationFor("player");
    const unit = createSoldier("p", "player", "ai", station.x, station.y, "charge");
    startEmergencyRetreat(unit);
    const base = createBattleBases()[0];
    Object.assign(unit, getBaseGatePoint(base, unit.recoveryGate!, false));
    updateEmergencyRetreat(unit);
    expect(unit.state).toBe("EMERGENCY_RETREAT");
    Object.assign(unit, getBaseGatePoint(base, unit.recoveryGate!, true));
    updateEmergencyRetreat(unit);
    expect(unit.state).toBe("HEALING");
    expect(unit.moveTargetX).toBeNull();
    expect([unit.facingX, unit.facingY]).toEqual([1, 0]);
  });

  it("locks healing facing by team on entry and on every healing update", () => {
    for (const team of ["player", "enemy"] as const) {
      const unit = createSoldier(team, team, "ai", 0, 0);
      unit.state = "HEALING";
      unit.hp = unit.maxHp - 10;
      unit.facingX = 0;
      unit.facingY = 1;
      updateHealing(unit, 0);
      expect([unit.facingX, unit.facingY]).toEqual(team === "player" ? [1, 0] : [-1, 0]);
    }
  });

  it("leaves emergency-retreat facing free to follow actual movement", () => {
    const unit = createSoldier("p", "player", "player", 500, 500);
    startEmergencyRetreat(unit);
    movePlayer(unit, 0, -1, 0.1);
    expect([unit.facingX, unit.facingY]).toEqual([0, -1]);
  });

  it("returns to ordinary facing updates after healing completes", () => {
    const unit = createSoldier("p", "player", "player", 500, 500);
    unit.state = "HEALING";
    unit.hp = unit.maxHp;
    updateHealing(unit, 0);
    expect(unit.state).toBe("NORMAL");
    expect([unit.facingX, unit.facingY]).toEqual([1, 0]);
    movePlayer(unit, 0, -1, 0.1);
    expect([unit.facingX, unit.facingY]).toEqual([0, -1]);
  });

  it("heals using delta time, caps HP, and snaps out at full HP", () => {
    const unit = createSoldier("p", "player", "ai", 0, 0);
    unit.state = "HEALING";
    unit.hp = unit.maxHp - 20;
    const hpBefore = unit.hp;
    updateHealing(unit, 0.5);
    expect(unit.hp).toBeCloseTo(hpBefore + unit.maxHp / 400 * 24 * 0.5);
    expect(unit.state).toBe("HEALING");
    updateHealing(unit, 20);
    expect(unit.hp).toBe(unit.maxHp);
    expect(unit.state).toBe("NORMAL");
  });

  it("returns to normal at the rejoin point without changing strategy", () => {
    const point = rejoinPointFor("enemy");
    const unit = createSoldier("e", "enemy", "ai", point.x, point.y, "wait");
    unit.state = "REJOINING";
    updateRejoining(unit);
    expect(unit.state).toBe("NORMAL");
    expect(unit.strategy).toBe("wait");
  });

  it("does not loop from healing back into emergency retreat", () => {
    const unit = createSoldier("p", "player", "ai", 0, 0);
    unit.state = "HEALING";
    unit.hp = 10;
    updateRecoveryStates([unit], 0.1);
    expect(unit.state).toBe("HEALING");
  });

  it("can die normally while retreating", () => {
    const unit = createSoldier("p", "player", "ai", 0, 0);
    startEmergencyRetreat(unit);
    applyDamage(unit, unit.maxHp);
    updateRecoveryStates([unit], 1);
    expect(unit.isDead).toBe(true);
    expect(unit.hp).toBe(0);
  });
});
