import { describe, expect, it } from "vitest";
import { NINJA_CONFIG, SPECIAL_ATTACK_CONFIG } from "../config";
import { createSoldier } from "../entities/Soldier";
import { createArmy } from "../factories/createArmy";
import { createNinjaStats } from "../stats/ninjaStats";
import type { SoldierLoadout } from "../types";
import { createDefaultTeamArmySetup, getArmySetupTotal, isValidTeamArmySetup } from "./armySetupSystem";
import { createBattleBases } from "./baseSystem";
import { issueAdvanceCommand, updateTemporaryOrder } from "./commandSystem";
import { applyConfusion, clearConfusionByCommand } from "./confusionSystem";
import { isDamageGuarded } from "./defenseSystem";
import { moveAiSoldiers } from "./movementSystem";
import { executeNinjaAttack, findNinjaTargets, getNinjaDashDistance, getNinjaKnockback, isInsideNinjaForwardSector } from "./ninjaAttackSystem";
import { formatSoldierInspector } from "./soldierInspectorSystem";
import { isTechniqueCompatibleWithUnitType, makePlayerDebugPreset, TECHNIQUE_DEFINITIONS, UNIT_DEFINITIONS } from "./unitLoadoutSystem";

const ninja = (technique: "NINJA_NINJUTSU" | "NINJA_SHADOW_RUN" | "NINJA_GENJUTSU" | "NINJA_BARRIER" = "NINJA_NINJUTSU",
  abilities: SoldierLoadout["specialAbilities"] = []): SoldierLoadout => ({
  unitType: "NINJA", technique, stats: { maxHp: 31, skill: 90, foot: 5, combat: 108, defense: 108 }, specialAbilities: abilities,
});

describe("Phase 4F ninja", () => {
  it("defines four ninja techniques, labels and team cap six", () => {
    for (const id of ["NINJA_NINJUTSU", "NINJA_SHADOW_RUN", "NINJA_GENJUTSU", "NINJA_BARRIER"] as const)
      expect(isTechniqueCompatibleWithUnitType("NINJA", id)).toBe(true);
    expect(isTechniqueCompatibleWithUnitType("ARCHER", "NINJA_NINJUTSU")).toBe(false);
    expect(TECHNIQUE_DEFINITIONS.NINJA_NINJUTSU.label).toBe("忍術"); expect(TECHNIQUE_DEFINITIONS.NINJA_BARRIER.label).toBe("結界");
    expect(UNIT_DEFINITIONS.NINJA.maxPerTeam).toBe(6);
  });
  it("generates deterministic inclusive ninja stats", () => {
    expect(createNinjaStats(() => 0)).toEqual({ maxHp: 15, skill: 70, foot: 4, combat: 105, defense: 105 });
    expect(createNinjaStats(() => 0.999999)).toEqual({ maxHp: 47, skill: 110, foot: 5, combat: 110, defense: 110 });
  });
  it("hits forward and both diagonals but misses side and rear", () => {
    const attacker = createSoldier("a", "player", "ai", 100, 100, "charge", undefined, ninja()); attacker.facingX = 1; attacker.facingY = 0;
    const front = createSoldier("f", "enemy", "ai", 130, 100); const up = createSoldier("u", "enemy", "ai", 125, 80);
    const down = createSoldier("d", "enemy", "ai", 125, 120); const side = createSoldier("s", "enemy", "ai", 100, 130); const rear = createSoldier("r", "enemy", "ai", 70, 100);
    expect(isInsideNinjaForwardSector(attacker, front)).toBe(true); expect(isInsideNinjaForwardSector(attacker, up)).toBe(true); expect(isInsideNinjaForwardSector(attacker, down)).toBe(true);
    expect(isInsideNinjaForwardSector(attacker, side)).toBe(false); expect(isInsideNinjaForwardSector(attacker, rear)).toBe(false);
    expect(findNinjaTargets(attacker, [attacker, front, up, down, side, rear]).map((s) => s.id)).toEqual(["f", "u", "d"]);
  });
  it("makes shadow run deeper and stronger than ninjutsu, both above prototype", () => {
    expect(getNinjaDashDistance("NINJA_NINJUTSU")).toBeGreaterThan(SPECIAL_ATTACK_CONFIG.radius);
    expect(getNinjaDashDistance("NINJA_SHADOW_RUN")).toBeGreaterThan(getNinjaDashDistance("NINJA_NINJUTSU"));
    expect(getNinjaKnockback("NINJA_NINJUTSU")).toBeGreaterThan(SPECIAL_ATTACK_CONFIG.knockbackDistance);
    expect(getNinjaKnockback("NINJA_SHADOW_RUN")).toBeGreaterThan(getNinjaKnockback("NINJA_NINJUTSU"));
  });
  it("applies MIGHT and defense to ninjutsu but not bypass techniques", () => {
    const guarded = createSoldier("g", "enemy", "ai", 140, 100); guarded.specialAbilities = ["FORESIGHT"];
    const attacker = createSoldier("a", "player", "ai", 100, 100, "charge", undefined, ninja("NINJA_NINJUTSU", ["MIGHT"]));
    executeNinjaAttack(attacker, [attacker, guarded], [], [], 0, () => 0); expect(guarded.hp).toBe(guarded.maxHp); expect(guarded.combatFeedbackMarker).toBe("S");
    const victim = createSoldier("v", "enemy", "ai", 140, 100); victim.specialAbilities = ["FORESIGHT"];
    const genjutsu = createSoldier("j", "player", "ai", 100, 100, "charge", undefined, ninja("NINJA_GENJUTSU", ["MIGHT"]));
    const event = executeNinjaAttack(genjutsu, [genjutsu, victim], [], [], 0, () => 0)!;
    expect(victim.hp).toBe(victim.maxHp - 1); expect(victim.combatFeedbackMarker).toBe("H"); expect(victim.isConfused).toBe(true); expect(event.victimIds).toEqual(["v"]);
  });
  it("clears confusion targets, returns toward own base, persists through hits, and clears by command", () => {
    const victim = createSoldier("v", "player", "ai", 800, 400); const enemy = createSoldier("e", "enemy", "ai", 820, 400);
    victim.targetId = enemy.id; applyConfusion(victim); expect(victim.targetId).toBeNull(); const before = victim.x;
    moveAiSoldiers([victim, enemy], 0.1, [], 0, createBattleBases()); expect(victim.x).toBeLessThan(before); expect(victim.isConfused).toBe(true);
    victim.reactionState = "HIT_STUN"; expect(victim.isConfused).toBe(true); clearConfusionByCommand(victim); expect(victim.isConfused).toBe(false);
    applyConfusion(victim); const player = createSoldier("p", "player", "player", 800, 400); issueAdvanceCommand(player, [victim], 100); expect(victim.isConfused).toBe(false);
  });
  it("supports barrier heal, forced special, charge order, self-heal and prevents recursion", () => {
    const barrier = createSoldier("b", "player", "ai", 100, 100, "charge", undefined, ninja("NINJA_BARRIER")); barrier.hp -= 10;
    const ally = createSoldier("n", "player", "ai", 105, 100, "charge", undefined, ninja()); ally.hp -= 10; ally.specialReadyAt = 99_999;
    const otherBarrier = createSoldier("ob", "player", "ai", 110, 100, "charge", undefined, ninja("NINJA_BARRIER")); otherBarrier.hp -= 10;
    const enemy = createSoldier("e", "enemy", "ai", 140, 100); const event = executeNinjaAttack(barrier, [barrier, ally, otherBarrier, enemy], [], [], 0, () => 0)!;
    expect(ally.hp).toBeGreaterThan(ally.maxHp - 10); expect(otherBarrier.hp).toBe(otherBarrier.maxHp - 10);
    expect(barrier.hp).toBeGreaterThan(barrier.maxHp - 10); expect(ally.specialReadyAt).toBe(99_999);
    expect(ally.temporaryOrder?.type).toBe("NINJA_BARRIER_CHARGE"); expect(event.forcedEvents.length).toBeGreaterThan(0);
    expect(event.forcedEvents.filter((forced) => forced.technique === "NINJA_BARRIER").every((forced) => forced.forcedEvents.length === 0)).toBe(true);
    const strategy = ally.strategy; updateTemporaryOrder(ally, barrier, 4_000); expect(ally.temporaryOrder).toBeNull(); expect(ally.strategy).toBe(strategy);
  });
  it("allows ninja gun defense without foresight and makes foresight stronger under the same cap", () => {
    const ninjaTarget = createSoldier("n", "enemy", "ai", 0, 0, "charge", undefined, ninja());
    expect(isDamageGuarded(ninjaTarget, "GUN_ATTACK", () => 0.5)).toBe(true);
    expect(isDamageGuarded(ninjaTarget, "GUN_ATTACK", () => 0.6)).toBe(false);
    ninjaTarget.specialAbilities = ["FORESIGHT"]; expect(isDamageGuarded(ninjaTarget, "GUN_ATTACK", () => 0.6)).toBe(true);
    const normal = createSoldier("p", "enemy", "ai", 0, 0); expect(isDamageGuarded(normal, "GUN_ATTACK", () => 0)).toBe(false);
  });
  it("validates ninja total six, preserves total thirty, and caps player override", () => {
    const setup = createDefaultTeamArmySetup(); expect(setup.techniqueCounts).toMatchObject({ NINJA_NINJUTSU: 0, NINJA_SHADOW_RUN: 0, NINJA_GENJUTSU: 0, NINJA_BARRIER: 0 });
    setup.techniqueCounts.PROTOTYPE_AREA = 17; setup.techniqueCounts.NINJA_NINJUTSU = 6; expect(isValidTeamArmySetup(setup)).toBe(true); expect(getArmySetupTotal(setup)).toBe(30);
    setup.techniqueCounts.PROTOTYPE_AREA = 16; setup.techniqueCounts.NINJA_SHADOW_RUN = 1; expect(isValidTeamArmySetup(setup)).toBe(false);
    const capped = createDefaultTeamArmySetup(); capped.techniqueCounts.PROTOTYPE_AREA = 17; capped.techniqueCounts.NINJA_NINJUTSU = 6;
    const army = createArmy("player", () => 0, { armySetup: capped, playerLoadout: makePlayerDebugPreset("NINJA_BARRIER") });
    expect(army).toHaveLength(30); expect(army.filter((s) => s.unitType === "NINJA")).toHaveLength(6);
  });
  it("shows ninja technique and confusion in inspector", () => {
    const soldier = createSoldier("n", "player", "player", 0, 0, "charge", undefined, ninja("NINJA_BARRIER")); applyConfusion(soldier);
    const text = formatSoldierInspector(soldier); expect(text).toContain("兵種：忍者"); expect(text).toContain("駒種：結界"); expect(text).toContain("状態：混乱");
    expect(NINJA_CONFIG.barrierRingDurationMs).toBeGreaterThanOrEqual(500);
  });
});
