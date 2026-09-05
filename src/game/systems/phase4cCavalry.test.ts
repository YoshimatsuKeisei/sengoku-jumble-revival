import { describe, expect, it } from "vitest";
import { CAVALRY_CONFIG, SPECIAL_ATTACK_CONFIG } from "../config";
import { createSoldier } from "../entities/Soldier";
import { createArmy } from "../factories/createArmy";
import { createCavalryStats } from "../stats/cavalryStats";
import type { SoldierLoadout } from "../types";
import { createDefaultTeamArmySetup, isValidTeamArmySetup } from "./armySetupSystem";
import { updateTrackedSmoke } from "./bombardmentEffectSystem";
import { calculateSafeCavalryKnockbackDistance, CAVALRY_CHARGE_KNOCKBACK, CAVALRY_CHARGE_RADIUS, executeCavalryCharge, getVerticalChargeDirection, queueMoutaiOnDamage } from "./cavalryChargeSystem";
import { createBattleBases } from "./baseSystem";
import { updateHealing, startEmergencyRetreat } from "./recoverySystem";
import { updateSpecialAttacks } from "./specialAttackSystem";
import { formatSoldierInspector } from "./soldierInspectorSystem";
import { isTechniqueCompatibleWithUnitType, makePlayerDebugPreset, TECHNIQUE_DEFINITIONS, UNIT_DEFINITIONS, UNIT_TYPE_LABELS } from "./unitLoadoutSystem";

const cavalryLoadout = (abilities: SoldierLoadout["specialAbilities"] = []): SoldierLoadout => ({
  unitType: "CAVALRY", technique: "CAVALRY_CHARGE",
  stats: { maxHp: 82, skill: 95, foot: 6, combat: 125, defense: 52 }, specialAbilities: abilities,
});
describe("Phase 4C cavalry and follow-up fixes", () => {
  it("tracks each bombardment smoke by victim and safely retains the last position after battle out", () => {
    const a = createSoldier("a", "enemy", "ai", 10, 20); const b = createSoldier("b", "enemy", "ai", 30, 40);
    let smokeA = { victimSoldierId: "a", x: 10, y: 20 }; let smokeB = { victimSoldierId: "b", x: 30, y: 40 };
    a.x = 50; a.y = 60; b.x = 70; smokeA = updateTrackedSmoke(smokeA, [a, b]); smokeB = updateTrackedSmoke(smokeB, [a, b]);
    expect(smokeA).toMatchObject({ x: 50, y: 60 }); expect(smokeB).toMatchObject({ x: 70, y: 40 });
    a.isDead = true; expect(updateTrackedSmoke(smokeA, [a, b])).toEqual(smokeA);
  });
  it("forces healing teppou and cavalry to face team-forward without aim", () => {
    for (const team of ["player", "enemy"] as const) {
      const gun = createSoldier("g", team, "ai", 0, 0, "melee", undefined, { ...makePlayerDebugPreset("TEPPOU_SHOOTING"), specialAbilities: [] });
      gun.state = "HEALING"; gun.facingX = 0; gun.facingY = 1; gun.aimX = 0; gun.aimY = -1;
      updateHealing(gun, 0, createBattleBases());
      expect(gun.facingX).toBe(team === "player" ? 1 : -1); expect(gun.facingY).toBe(0); expect(gun.aimX).toBeNull();
    }
  });
  it("defines cavalry, charge compatibility, labels, and team cap", () => {
    expect(isTechniqueCompatibleWithUnitType("CAVALRY", "CAVALRY_CHARGE")).toBe(true);
    expect(isTechniqueCompatibleWithUnitType("TEPPOU", "CAVALRY_CHARGE")).toBe(false);
    expect(UNIT_TYPE_LABELS.CAVALRY).toBe("騎馬"); expect(TECHNIQUE_DEFINITIONS.CAVALRY_CHARGE.label).toBe("騎突");
    expect(UNIT_DEFINITIONS.CAVALRY.maxPerTeam).toBe(1);
  });
  it("generates deterministic cavalry stats in every configured range", () => {
    const low = createCavalryStats(() => 0); const high = createCavalryStats(() => 0.999999);
    expect(low).toEqual({ maxHp: 70, skill: 80, foot: 6, combat: 125, defense: 40 });
    expect(high).toEqual({ maxHp: 94, skill: 110, foot: 6, combat: 125, defense: 63 });
  });
  it("enforces rush, fleet foot, moutai, and charge strategy", () => {
    const setup = createDefaultTeamArmySetup(); setup.defaultStrategy = "wait";
    const cavalry = createArmy("enemy", () => 0, { armySetup: setup }).find((s) => s.unitType === "CAVALRY")!;
    expect(cavalry.specialAbilities).toEqual(expect.arrayContaining(["RUSH", "FLEET_FOOT"]));
    expect(new Set(cavalry.specialAbilities).size).toBe(cavalry.specialAbilities.length);
    expect(cavalry.rareSpecialAbilities).toContain("MOUTAI"); expect(cavalry.strategy).toBe("charge");
  });
  it("skips treatment search and heads directly to base", () => {
    const cavalry = createSoldier("c", "player", "ai", 500, 400, "charge", undefined, cavalryLoadout());
    const healer = createSoldier("h", "player", "ai", 505, 400); healer.specialAbilities = ["TREATMENT"];
    startEmergencyRetreat(cavalry, createBattleBases(), [cavalry, healer]);
    expect(cavalry.recoveryTargetKind).toBe("BASE_GATE"); expect(cavalry.recoveryHealerId).toBeNull(); expect(cavalry.recoveryGate).not.toBeNull();
  });
  it("uses triple area radius, double knockback, vertical direction and might damage", () => {
    expect(CAVALRY_CHARGE_RADIUS).toBe(SPECIAL_ATTACK_CONFIG.radius * 3);
    expect(CAVALRY_CHARGE_KNOCKBACK).toBe(SPECIAL_ATTACK_CONFIG.knockbackDistance * 2);
    const cavalry = createSoldier("c", "player", "ai", 400, 400, "charge", undefined, cavalryLoadout(["MIGHT"]));
    const above = createSoldier("a", "enemy", "ai", 410, 350); const below = createSoldier("b", "enemy", "ai", 410, 450);
    expect(getVerticalChargeDirection(cavalry, above)).toBe(-1); expect(getVerticalChargeDirection(cavalry, below)).toBe(1);
    const event = executeCavalryCharge(cavalry, [cavalry, above, below], [], createBattleBases(), 0, () => 1)!;
    expect(event.targetIds).toEqual(["a", "b"]); expect(above.hp).toBe(above.maxHp - 2); expect(below.hp).toBe(below.maxHp - 2);
    expect(above.combatFeedbackMarker).toBe("H"); expect(above.reactionState).toBe("HIT_STUN");
  });
  it("clamps knockback before any soldier blocker without chain push", () => {
    const victim = createSoldier("v", "enemy", "ai", 400, 400); const blocker = createSoldier("block", "enemy", "ai", 400, 440);
    const blockerY = blocker.y; const safe = calculateSafeCavalryKnockbackDistance(victim, 1, 64, [victim, blocker]);
    expect(safe).toBeLessThan(64); expect(safe).toBeGreaterThan(0); expect(blocker.y).toBe(blockerY);
    expect(calculateSafeCavalryKnockbackDistance(victim, -1, 64, [victim, blocker])).toBe(64);
  });
  it("queues one cooldown-free reactive charge per damaging retreat hit, including no-target visuals", () => {
    const cavalry = createSoldier("c", "player", "player", 400, 400, "charge", undefined, cavalryLoadout());
    cavalry.state = "EMERGENCY_RETREAT"; cavalry.specialReadyAt = 9_999;
    queueMoutaiOnDamage(cavalry, 1); queueMoutaiOnDamage(cavalry, 1); queueMoutaiOnDamage(cavalry, 0);
    const events = updateSpecialAttacks([cavalry], [], createBattleBases(), 100, false, () => 1);
    expect(events).toHaveLength(2); expect(events.every((event) => event.kind === "CAVALRY" && event.reactive)).toBe(true);
    expect(cavalry.specialReadyAt).toBe(9_999); expect(cavalry.pendingMoutaiCharges).toBe(0);
  });
  it("enforces default 23/6/1 composition, cap one, and player cavalry transfer", () => {
    const setup = createDefaultTeamArmySetup();
    expect(setup.techniqueCounts).toMatchObject({ PROTOTYPE_AREA: 23, TEPPOU_BOMBARDMENT: 6, CAVALRY_CHARGE: 1 });
    setup.techniqueCounts.CAVALRY_CHARGE = 2; setup.techniqueCounts.PROTOTYPE_AREA = 22; expect(isValidTeamArmySetup(setup)).toBe(false);
    const defaults = createDefaultTeamArmySetup(); const army = createArmy("player", () => 0, { playerLoadout: makePlayerDebugPreset("CAVALRY_CHARGE"), armySetup: defaults });
    expect(army).toHaveLength(30); expect(army.filter((s) => s.unitType === "CAVALRY")).toHaveLength(1);
    expect(army[0].unitType).toBe("CAVALRY"); expect(army.filter((s) => s.controller === "ai" && s.unitType === "CAVALRY")).toHaveLength(0);
    expect(formatSoldierInspector(army[0])).toContain("希少能力：\n・猛退");
  });
});
