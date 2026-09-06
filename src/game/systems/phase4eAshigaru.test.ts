import { describe, expect, it } from "vitest";
import { ASHIGARU_CONFIG, REACTION_CONFIG, SPECIAL_ATTACK_CONFIG } from "../config";
import { createSoldier } from "../entities/Soldier";
import { createArmy } from "../factories/createArmy";
import { createAshigaruStats } from "../stats/ashigaruStats";
import type { SoldierLoadout } from "../types";
import { createDefaultTeamArmySetup, getArmySetupTotal, isValidTeamArmySetup } from "./armySetupSystem";
import { createBattleBases } from "./baseSystem";
import { executeSpearAttack, findSpearStrikeTargets, findSpearTechniqueTargets, isInsideSpearStrike,
  SPEAR_STRIKE_KNOCKBACK, SPEAR_STRIKE_REACH, SPEAR_TECHNIQUE_KNOCKBACK, SPEAR_TECHNIQUE_RADIUS } from "./spearAttackSystem";
import { updateSpecialAttacks } from "./specialAttackSystem";
import { formatSoldierInspector } from "./soldierInspectorSystem";
import { isTechniqueCompatibleWithUnitType, makePlayerDebugPreset, TECHNIQUE_DEFINITIONS, UNIT_DEFINITIONS, UNIT_TYPE_LABELS } from "./unitLoadoutSystem";

const ashigaru = (technique: "ASHIGARU_SPEAR_STRIKE" | "ASHIGARU_SPEAR_TECHNIQUE" = "ASHIGARU_SPEAR_STRIKE",
  abilities: SoldierLoadout["specialAbilities"] = []): SoldierLoadout => ({
  unitType: "ASHIGARU", technique, stats: { maxHp: 90, skill: 90, foot: 3, combat: 95, defense: 90 }, specialAbilities: abilities,
});

describe("Phase 4E ashigaru spear attacks", () => {
  it("defines ashigaru metadata, compatibility, labels and cap", () => {
    expect(isTechniqueCompatibleWithUnitType("ASHIGARU", "ASHIGARU_SPEAR_STRIKE")).toBe(true);
    expect(isTechniqueCompatibleWithUnitType("ASHIGARU", "ASHIGARU_SPEAR_TECHNIQUE")).toBe(true);
    expect(isTechniqueCompatibleWithUnitType("ARCHER", "ASHIGARU_SPEAR_STRIKE")).toBe(false);
    expect(UNIT_TYPE_LABELS.ASHIGARU).toBe("足軽"); expect(TECHNIQUE_DEFINITIONS.ASHIGARU_SPEAR_STRIKE.label).toBe("槍撃");
    expect(UNIT_DEFINITIONS.ASHIGARU.maxPerTeam).toBe(30);
  });
  it("generates deterministic inclusive default stats", () => {
    expect(createAshigaruStats(() => 0)).toEqual({ maxHp: 70, skill: 70, foot: 2, combat: 80, defense: 70 });
    expect(createAshigaruStats(() => 0.999999)).toEqual({ maxHp: 110, skill: 110, foot: 4, combat: 110, defense: 110 });
  });
  it("limits spear strike to its narrow forward shape and supports multiple targets", () => {
    const attacker = createSoldier("a", "player", "ai", 100, 100, "melee", undefined, ashigaru()); attacker.facingX = 1; attacker.facingY = 0;
    const frontA = createSoldier("fa", "enemy", "ai", 125, 100); const frontB = createSoldier("fb", "enemy", "ai", 145, 108);
    const behind = createSoldier("b", "enemy", "ai", 90, 100); const side = createSoldier("s", "enemy", "ai", 100, 125);
    const far = createSoldier("f", "enemy", "ai", 100 + SPEAR_STRIKE_REACH * 2, 100);
    expect(isInsideSpearStrike(attacker, frontA)).toBe(true); expect(isInsideSpearStrike(attacker, behind)).toBe(false);
    expect(isInsideSpearStrike(attacker, side)).toBe(false); expect(isInsideSpearStrike(attacker, far)).toBe(false);
    expect(findSpearStrikeTargets(attacker, [attacker, frontA, frontB, behind, side, far]).map((s) => s.id)).toEqual(["fa", "fb"]);
  });
  it("deals one or MIGHT two, supports special defense, H and HIT_STUN", () => {
    const attacker = createSoldier("a", "player", "ai", 100, 100, "melee", undefined, ashigaru("ASHIGARU_SPEAR_STRIKE", ["MIGHT"]));
    const hit = createSoldier("h", "enemy", "ai", 130, 100); executeSpearAttack(attacker, [attacker, hit], [], [], 0, () => 1, false, true);
    expect(hit.hp).toBe(hit.maxHp - 2); expect(hit.combatFeedbackMarker).toBe("H"); expect(hit.reactionState).toBe("HIT_STUN");
    const guarded = createSoldier("g", "enemy", "ai", 130, 100); guarded.specialAbilities = ["FORESIGHT"]; attacker.specialReadyAt = 0;
    executeSpearAttack(attacker, [attacker, guarded], [], [], 0, () => 0, false, true);
    expect(guarded.hp).toBe(guarded.maxHp); expect(guarded.combatFeedbackMarker).toBe("S");
  });
  it("derives strike knockback between normal and spear-technique values and pushes along facing", () => {
    expect(SPEAR_STRIKE_KNOCKBACK).toBe(SPECIAL_ATTACK_CONFIG.knockbackDistance * 0.75);
    expect(SPEAR_STRIKE_KNOCKBACK).toBeGreaterThan(REACTION_CONFIG.knockbackDistance);
    expect(SPEAR_STRIKE_KNOCKBACK).toBeLessThan(SPEAR_TECHNIQUE_KNOCKBACK);
    const attacker = createSoldier("a", "player", "ai", 100, 100, "melee", undefined, ashigaru()); attacker.facingX = 1; attacker.facingY = 0;
    const target = createSoldier("t", "enemy", "ai", 130, 100); executeSpearAttack(attacker, [attacker, target], [], [], 0, () => 1, false, true);
    expect(target.knockbackDirectionX).toBe(1); expect(target.knockbackDirectionY).toBe(0);
    expect(target.knockbackRemainingDistance).toBe(SPEAR_STRIKE_KNOCKBACK);
  });
  it("makes spear technique exactly the prototype 360-degree area behavior", () => {
    expect(SPEAR_TECHNIQUE_RADIUS).toBeGreaterThan(SPECIAL_ATTACK_CONFIG.radius);
    expect(SPEAR_TECHNIQUE_KNOCKBACK).toBe(SPECIAL_ATTACK_CONFIG.knockbackDistance);
    const attacker = createSoldier("a", "player", "ai", 100, 100, "melee", undefined, ashigaru("ASHIGARU_SPEAR_TECHNIQUE"));
    const front = createSoldier("f", "enemy", "ai", 130, 100); const back = createSoldier("b", "enemy", "ai", 70, 100);
    const ally = createSoldier("ally", "player", "ai", 100, 120);
    expect(findSpearTechniqueTargets(attacker, [attacker, front, back, ally]).map((s) => s.id)).toEqual(["f", "b"]);
    const event = executeSpearAttack(attacker, [attacker, front, back, ally], [], [], 0, () => 1, false)!;
    expect(event.targetIds).toEqual(["f", "b"]); expect(front.hp).toBe(front.maxHp - 1); expect(back.hp).toBe(back.maxHp - 1);
    expect(front.knockbackDirectionX).toBe(1); expect(back.knockbackDirectionX).toBe(-1); expect(ally.hp).toBe(ally.maxHp);
  });
  it("emits one visual event per activation and supports cooldown-free second special", () => {
    expect(ASHIGARU_CONFIG.spearTipGlowDurationMs).toBe(500);
    const attacker = createSoldier("a", "player", "player", 100, 100, "melee", undefined, ashigaru("ASHIGARU_SPEAR_STRIKE", ["DOUBLE_SPECIAL"]));
    const target = createSoldier("t", "enemy", "ai", 130, 100);
    const first = updateSpecialAttacks([attacker, target], [], createBattleBases(), 0, true, () => 0); const ready = attacker.specialReadyAt;
    const second = updateSpecialAttacks([attacker, target], [], createBattleBases(), 120, false, () => 1);
    expect(first).toHaveLength(1); expect(second).toHaveLength(2); expect(first[0].kind).toBe("SPEAR"); expect(attacker.specialReadyAt).toBe(ready);
  });
  it("allows the confirmed empty special activation without an in-range enemy", () => {
    const attacker = createSoldier("a", "player", "player", 100, 100, "melee", undefined, ashigaru());
    const far = createSoldier("f", "enemy", "ai", 100 + SPEAR_STRIKE_REACH * 3, 100);
    const events = updateSpecialAttacks([attacker, far], [], createBattleBases(), 100, true);
    expect(events).toHaveLength(1); expect(events[0]).toMatchObject({ kind: "SPEAR", targetIds: [] });
    expect(attacker.specialReadyAt).toBeGreaterThan(100);
  });
  it("extends default composition with zero ashigaru and preserves cavalry/player override", () => {
    const setup = createDefaultTeamArmySetup(); expect(setup.techniqueCounts).toMatchObject({ ASHIGARU_SPEAR_STRIKE: 0, ASHIGARU_SPEAR_TECHNIQUE: 0 });
    expect(getArmySetupTotal(setup)).toBe(30); setup.techniqueCounts.PROTOTYPE_AREA = 13; setup.techniqueCounts.ASHIGARU_SPEAR_STRIKE = 5; setup.techniqueCounts.ASHIGARU_SPEAR_TECHNIQUE = 5;
    expect(isValidTeamArmySetup(setup)).toBe(true);
    const army = createArmy("player", () => 0, { playerLoadout: makePlayerDebugPreset("ASHIGARU_SPEAR_STRIKE") });
    expect(army).toHaveLength(30); expect(army[0].unitType).toBe("ASHIGARU"); expect(army.filter((s) => s.unitType === "CAVALRY")).toHaveLength(1);
  });
  it("shows ashigaru technique and existing details in inspector", () => {
    const soldier = createSoldier("s", "player", "ai", 0, 0, "melee", undefined, ashigaru("ASHIGARU_SPEAR_TECHNIQUE", ["MIGHT"]));
    const text = formatSoldierInspector(soldier); expect(text).toContain("兵種：足軽"); expect(text).toContain("駒種：槍術"); expect(text).toContain("・将力");
  });
});
