import { describe, expect, it } from "vitest";
import { RECOVERY_CONFIG } from "../config";
import { createSoldier } from "../entities/Soldier";
import { updateAiTargets } from "./aiSystem";
import { applyDamage } from "./combatSystem";
import { updateAttackStates } from "./attackSystem";
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
  });

  it("heals using delta time, caps HP, and snaps out at full HP", () => {
    const unit = createSoldier("p", "player", "ai", 0, 0);
    unit.state = "HEALING";
    unit.hp = unit.maxHp - 20;
    const hpBefore = unit.hp;
    updateHealing(unit, 0.5);
    expect(unit.hp).toBe(hpBefore + 0.5);
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
