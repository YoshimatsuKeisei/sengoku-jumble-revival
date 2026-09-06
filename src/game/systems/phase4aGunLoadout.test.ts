import { describe, expect, it } from "vitest";
import { GUN_CONFIG } from "../config";
import { createSoldier } from "../entities/Soldier";
import { createArmy } from "../factories/createArmy";
import type { SoldierLoadout } from "../types";
import { executeGunAttack, findGunTarget, getGunRange, isGunTechnique } from "./gunAttackSystem";
import { calculateSpecialCooldownMs, updateSpecialAttacks } from "./specialAttackSystem";
import { COMMON_SPECIAL_ABILITY_POOL } from "./specialAbilitySystem";
import { createBattleBases } from "./baseSystem";
import { formatSoldierInspector } from "./soldierInspectorSystem";
import { DEFAULT_PLAYER_LOADOUT, isTechniqueCompatibleWithUnitType, makePlayerDebugPreset, validateSoldierLoadout } from "./unitLoadoutSystem";

const shooting: SoldierLoadout = {
  unitType: "TEPPOU", technique: "TEPPOU_SHOOTING",
  stats: { maxHp: 60, skill: 50, foot: 4, combat: 50, defense: 50 }, specialAbilities: [],
};

describe("Phase 4A loadouts and gun specials", () => {
  it("validates compatibility, stats, and deduplicates common abilities", () => {
    expect(isTechniqueCompatibleWithUnitType("TEPPOU", "TEPPOU_SNIPING")).toBe(true);
    expect(isTechniqueCompatibleWithUnitType("PROTOTYPE", "TEPPOU_SNIPING")).toBe(false);
    expect(() => validateSoldierLoadout({ ...shooting, unitType: "PROTOTYPE" })).toThrow();
    expect(() => validateSoldierLoadout({ ...shooting, stats: { ...shooting.stats, foot: 7 } })).toThrow();
    expect(validateSoldierLoadout({ ...shooting, specialAbilities: ["MIGHT", "MIGHT"] }).specialAbilities).toEqual(["MIGHT"]);
  });
  it("applies an explicit loadout to any soldier", () => {
    const soldier = createSoldier("s", "enemy", "ai", 0, 0, "melee", undefined, { ...shooting, specialAbilities: ["FORESIGHT"] });
    expect(soldier.unitType).toBe("TEPPOU"); expect(soldier.technique).toBe("TEPPOU_SHOOTING");
    expect(soldier.stats).toEqual(shooting.stats); expect(soldier.specialAbilities).toEqual(["FORESIGHT"]);
  });
  it("provides prototype, shooting, sniping and all-ability debug presets", () => {
    expect(DEFAULT_PLAYER_LOADOUT.technique).toBe("PROTOTYPE_AREA");
    expect(makePlayerDebugPreset("TEPPOU_SHOOTING").unitType).toBe("TEPPOU");
    expect(makePlayerDebugPreset("TEPPOU_SNIPING").technique).toBe("TEPPOU_SNIPING");
    expect(makePlayerDebugPreset("PROTOTYPE_AREA").specialAbilities).toEqual(COMMON_SPECIAL_ABILITY_POOL);
  });
  it.each(["player", "enemy"] as const)("creates the default bombardment composition per %s team", (team) => {
    const army = createArmy(team, () => 0, { playerAllCommonAbilities: false });
    expect(army.filter((s) => s.unitType === "TEPPOU")).toHaveLength(6);
    expect(army.filter((s) => s.technique === "TEPPOU_SHOOTING")).toHaveLength(0);
    expect(army.filter((s) => s.technique === "TEPPOU_SNIPING")).toHaveLength(0);
    expect(army.filter((s) => s.technique === "TEPPOU_BOMBARDMENT")).toHaveLength(6);
    expect(army.filter((s) => s.unitType === "PROTOTYPE")).toHaveLength(23);
  });
  it("lets the player loadout override the fixed composition slot", () => {
    const loadout = makePlayerDebugPreset("TEPPOU_SNIPING");
    expect(createArmy("player", () => 0, { playerLoadout: loadout })[0].technique).toBe("TEPPOU_SNIPING");
  });
  it("uses a longer sniping range and selects a sticky or nearest target", () => {
    expect(GUN_CONFIG.shootingRange).toBeLessThan(GUN_CONFIG.snipingRange);
    expect(getGunRange("PROTOTYPE_AREA")).toBeNull(); expect(isGunTechnique("TEPPOU_SHOOTING")).toBe(true);
    const attacker = createSoldier("a", "player", "ai", 0, 0, "melee", undefined, shooting);
    attacker.combatGauge = 201;
    const near = createSoldier("near", "enemy", "ai", 100, 0); const far = createSoldier("far", "enemy", "ai", 200, 0);
    expect(findGunTarget(attacker, [attacker, far, near])).toBe(near);
    attacker.targetId = far.id; expect(findGunTarget(attacker, [attacker, far, near])).toBe(far);
  });
  it("does not fire or spend cooldown without an in-range target", () => {
    const attacker = createSoldier("a", "player", "player", 0, 0, "melee", undefined, shooting);
    const far = createSoldier("e", "enemy", "ai", GUN_CONFIG.shootingRange + 1, 0);
    expect(findGunTarget(attacker, [attacker, far])).toBeNull();
    expect(updateSpecialAttacks([attacker, far], [], createBattleBases(), 100, true)).toEqual([]);
    expect(attacker.specialReadyAt).toBe(0);
  });
  it("deals one, bypasses normal defense, supports foresight, and has no knockback", () => {
    const attacker = createSoldier("a", "player", "ai", 0, 0, "melee", undefined, shooting);
    const target = createSoldier("t", "enemy", "ai", 100, 0); const x = target.x;
    const event = executeGunAttack(attacker, target, 0, () => 1, false);
    expect(event).toMatchObject({ kind: "GUN", smoke: true, shotLine: true, shooterFlash: true });
    expect(target.hp).toBe(target.maxHp - 1); expect(target.combatFeedbackMarker).toBe("H");
    expect(target.reactionState).toBe("HIT_STUN"); expect(target.x).toBe(x);
    const guarded = createSoldier("g", "enemy", "ai", 100, 0); guarded.specialAbilities = ["FORESIGHT"];
    attacker.specialReadyAt = 0; executeGunAttack(attacker, guarded, 0, () => 0, false);
    expect(guarded.hp).toBe(guarded.maxHp); expect(guarded.combatFeedbackMarker).toBe("S");
  });
  it("keeps the player cooldown separate and does not use a fixed delayed second shot", () => {
    expect(calculateSpecialCooldownMs(100)).toBeLessThan(calculateSpecialCooldownMs(0));
    const attacker = createSoldier("a", "player", "player", 0, 0, "melee", undefined, { ...shooting, specialAbilities: ["DOUBLE_SPECIAL"] });
    const target = createSoldier("t", "enemy", "ai", 100, 0);
    const first = updateSpecialAttacks([attacker, target], [], createBattleBases(), 0, true, () => 0);
    const readyAt = attacker.specialReadyAt;
    const second = updateSpecialAttacks([attacker, target], [], createBattleBases(), 120, false, () => 1);
    expect(first).toHaveLength(1); expect(second).toHaveLength(0);
    expect(attacker.specialReadyAt).toBe(readyAt);
  });
  it("shows unit, technique and range in the inspector", () => {
    const soldier = createSoldier("s", "player", "ai", 0, 0, "melee", undefined, shooting);
    expect(formatSoldierInspector(soldier)).toContain("兵種：鉄砲");
    expect(formatSoldierInspector(soldier)).toContain("駒種：射撃");
    expect(formatSoldierInspector(soldier)).toContain(`射程：${Math.round(GUN_CONFIG.shootingRange)} px`);
  });
});
