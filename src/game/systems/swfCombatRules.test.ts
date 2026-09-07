import { describe, expect, it } from "vitest";
import { REACTION_CONFIG } from "../config";
import { createSoldier } from "../entities/Soldier";
import { calculateMoveSpeedFromFoot } from "../stats/soldierStats";
import type { Soldier, UnitTechnique } from "../types";
import {
  advanceCombatGauge,
  beginTechniqueAction,
  COMBAT_GAUGE_UPDATE_INTERVAL_MS,
  PLAYER_TECHNIQUE_GAUGE_FRAME_MS,
  hasTechniqueGauge,
} from "./combatGaugeSystem";
import { isDamageGuarded } from "./defenseSystem";
import { getCombatWinProbability, resolveCombatContest } from "./normalCombatSystem";
import { calculateNormalAttackDamage } from "./specialAbilitySystem";
import { updateSpecialAttacks } from "./specialAttackSystem";
import { executeStrategistAttack } from "./strategistAttackSystem";
import {
  getArrivalToleranceWorld,
  getTechniqueAreaCenter,
  getTechniqueAreaWorld,
  getTechniqueProfile,
  getTechniqueRangeWorld,
  swfCellsToWorldX,
  swfCellsToWorldY,
  swfUnitsToWorldX,
} from "./techniqueCombatProfiles";

function soldier(id: string, team: "player" | "enemy" = "player"): Soldier {
  return createSoldier(id, team, "ai", 400, 300, "melee", {
    maxHp: 60, skill: 100, foot: 3, combat: 100, defense: 100,
  });
}

function useTechnique(subject: Soldier, technique: UnitTechnique, unitType: Soldier["unitType"]): Soldier {
  subject.technique = technique;
  subject.unitType = unitType;
  return subject;
}

describe("SWF combat/defense formulas", () => {
  it("uses the linear combat ratio only to choose the contact attacker", () => {
    expect(getCombatWinProbability(100, 100)).toBe(0.5);
    const weighted = 100 / (100 + 80);
    expect(getCombatWinProbability(100, 80)).toBeCloseTo(weighted, 12);
    const a = soldier("a");
    const b = soldier("b", "enemy"); b.stats.combat = 80;
    expect(resolveCombatContest(a, b, () => weighted - 0.000001)).toBe(a);
    expect(resolveCombatContest(a, b, () => weighted)).toBe(b);
    a.stats.combat = 9999; a.stats.skill = 9999;
    expect(calculateNormalAttackDamage(a, b)).toBe(1);
    a.specialAbilities = ["MIGHT"];
    expect(calculateNormalAttackDamage(a, b)).toBe(2);
  });

  it("applies confirmed additive damage components before FINISHER", () => {
    const attacker = soldier("attacker"); attacker.specialAbilities = ["MIGHT", "FINISHER"];
    attacker.rareSpecialAbilities = ["NINJA_HUNTER"];
    const ninja = soldier("ninja", "enemy"); ninja.unitType = "NINJA"; ninja.hp = 8;
    expect(calculateNormalAttackDamage(attacker, ninja)).toBe(4);
    ninja.hp = 9;
    expect(calculateNormalAttackDamage(attacker, ninja)).toBe(3);
  });

  it("uses random*200 > defense, while ordinary specials bypass it", () => {
    const target = soldier("target", "enemy");
    expect(isDamageGuarded(target, "NORMAL_ATTACK", () => 0.5)).toBe(true);
    expect(isDamageGuarded(target, "NORMAL_ATTACK", () => 0.500001)).toBe(false);
    expect(isDamageGuarded(target, "SPECIAL_ATTACK", () => 0)).toBe(false);
    target.specialAbilities = ["FORESIGHT"];
    expect(isDamageGuarded(target, "SPECIAL_ATTACK", () => 0.5)).toBe(true);
  });

  it("applies HORO to ninja gun defense while guns bypass other unit classes", () => {
    const target = soldier("target", "enemy"); target.specialAbilities = ["HORO"];
    expect(isDamageGuarded(target, "NORMAL_ATTACK", () => 0.69)).toBe(false);
    expect(isDamageGuarded(target, "ARROW_ATTACK", () => 0.69)).toBe(true);
    const gunner = useTechnique(soldier("gunner"), "TEPPOU_SHOOTING", "TEPPOU");
    target.unitType = "NINJA";
    expect(isDamageGuarded(target, "GUN_ATTACK", () => 0.69, gunner)).toBe(true);
    target.unitType = "ASHIGARU";
    expect(isDamageGuarded(target, "GUN_ATTACK", () => { throw new Error("gun-vs-non-ninja must not roll defense"); }, gunner)).toBe(false);
  });
});

describe("SWF skill gauges", () => {
  it("advances the protagonist 0..100 gauge from kp/30 at SWF 24fps", () => {
    const slow = createSoldier("slow", "player", "player", 100, 100);
    const fast = createSoldier("fast", "player", "player", 100, 100);
    slow.stats.skill = 50;
    fast.stats.skill = 100;
    slow.playerTechniqueGauge = 0;
    fast.playerTechniqueGauge = 0;
    advanceCombatGauge(slow, 0);
    advanceCombatGauge(fast, 0);
    advanceCombatGauge(slow, 1_000);
    advanceCombatGauge(fast, 1_000);
    expect(slow.playerTechniqueGauge).toBe(40);
    expect(fast.playerTechniqueGauge).toBe(80);
    advanceCombatGauge(fast, 2_000);
    expect(fast.playerTechniqueGauge).toBe(100);
  });

  it("updates the protagonist gauge only on completed SWF frames", () => {
    const player = createSoldier("p", "player", "player", 100, 100);
    player.stats.skill = 60;
    player.playerTechniqueGauge = 0;
    advanceCombatGauge(player, 0);
    advanceCombatGauge(player, PLAYER_TECHNIQUE_GAUGE_FRAME_MS - 0.001);
    expect(player.playerTechniqueGauge).toBe(0);
    advanceCombatGauge(player, PLAYER_TECHNIQUE_GAUGE_FRAME_MS);
    expect(player.playerTechniqueGauge).toBe(2);
  });

  it("requires a full protagonist gauge and resets ordinary activations", () => {
    const player = createSoldier("p", "player", "player", 100, 100);
    player.playerTechniqueGauge = 99;
    expect(beginTechniqueAction(player, 0, () => 1, true)).toBe(false);
    player.playerTechniqueGauge = 100;
    expect(beginTechniqueAction(player, 0, () => 1, true)).toBe(true);
    expect(player.playerTechniqueGauge).toBe(0);
  });

  it("keeps the protagonist gauge only for confirmed DOUBLE_SPECIAL success", () => {
    const player = createSoldier("p", "player", "player", 100, 100);
    player.specialAbilities = ["DOUBLE_SPECIAL"];
    player.playerTechniqueGauge = 100;
    expect(beginTechniqueAction(player, 0, () => 0.399, true)).toBe(true);
    expect(player.playerTechniqueGauge).toBe(100);
  });

  it("requires ranged gauge to be strictly greater than 200", () => {
    const archer = useTechnique(soldier("archer"), "ARCHER_ARROW", "ARCHER");
    advanceCombatGauge(archer, 0);
    advanceCombatGauge(archer, COMBAT_GAUGE_UPDATE_INTERVAL_MS * 2 + 0.01);
    expect(archer.combatGauge).toBe(200);
    expect(hasTechniqueGauge(archer)).toBe(false);
    advanceCombatGauge(archer, COMBAT_GAUGE_UPDATE_INTERVAL_MS * 3 + 0.01);
    expect(archer.combatGauge).toBe(300);
    expect(hasTechniqueGauge(archer)).toBe(true);
  });

  it("requires non-ranged special gauge to be strictly greater than 400", () => {
    const ninja = useTechnique(soldier("ninja"), "NINJA_NINJUTSU", "NINJA");
    advanceCombatGauge(ninja, 0);
    advanceCombatGauge(ninja, COMBAT_GAUGE_UPDATE_INTERVAL_MS * 4 + 0.01);
    expect(ninja.combatGauge).toBe(400);
    expect(hasTechniqueGauge(ninja)).toBe(false);
    advanceCombatGauge(ninja, COMBAT_GAUGE_UPDATE_INTERVAL_MS * 5 + 0.01);
    expect(hasTechniqueGauge(ninja)).toBe(true);
  });

  it("uses 40% DOUBLE_SPECIAL gauge retention with the overflow guard", () => {
    const gunner = useTechnique(soldier("gunner"), "TEPPOU_SHOOTING", "TEPPOU");
    gunner.specialAbilities = ["DOUBLE_SPECIAL"];
    gunner.combatGauge = 300;
    expect(beginTechniqueAction(gunner, 0, () => 0.399, true)).toBe(true);
    expect(gunner.combatGauge).toBe(300);
    gunner.activeSpecialTechnique = null; gunner.specialLockUntil = 0; gunner.combatGauge = 500;
    expect(beginTechniqueAction(gunner, 1, () => 0, true)).toBe(true);
    expect(gunner.combatGauge).toBe(300);
  });
});

describe("SWF foot conversion", () => {
  it("keeps foot speed linear and foot6 exactly twice foot3", () => {
    expect(calculateMoveSpeedFromFoot(6)).toBe(2 * calculateMoveSpeedFromFoot(3));
    expect(calculateMoveSpeedFromFoot(1)).toBe(swfUnitsToWorldX(24));
  });

  it("uses foot*3+2 for arrival tolerance", () => {
    expect(getArrivalToleranceWorld(1)).toBe(swfUnitsToWorldX(5));
    expect(getArrivalToleranceWorld(6)).toBe(swfUnitsToWorldX(20));
  });
});

describe("SWF technique profiles", () => {
  it.each([
    ["ARCHER_ARROW", 3], ["ARCHER_LONG_SHOT", 5], ["ARCHER_FIRE_ARROW", 3], ["ARCHER_HOROKU", 3],
    ["TEPPOU_SHOOTING", 7], ["TEPPOU_SNIPING", 11], ["TEPPOU_BOMBARDMENT", 9],
  ] as const)("maps %s to %i cells", (technique, cells) => {
    expect(getTechniqueProfile(technique).rangeCells).toBe(cells);
    expect(getTechniqueRangeWorld(technique)).toBe(swfCellsToWorldX(cells));
  });

  it.each([
    ["ARCHER_HOROKU", 3], ["TEPPOU_BOMBARDMENT", 3], ["STRATEGIST_FIRE_ATTACK", 3],
    ["STRATEGIST_FIRE_PLAN", 5], ["STRATEGIST_HELLFIRE", 7], ["STRATEGIST_FLAME_ART", 9],
    ["MOSA_KIJIN", 5], ["CAVALRY_CHARGE", 5], ["NINJA_NINJUTSU", 3],
  ] as const)("maps %s to a %ix%i rectangle", (technique, cells) => {
    expect(getTechniqueAreaWorld(technique)).toEqual({ width: swfCellsToWorldX(cells), height: swfCellsToWorldY(cells) });
  });

  it.each([
    ["ASHIGARU_SPEAR_STRIKE", 10], ["ASHIGARU_SPEAR_TECHNIQUE", 10], ["MOSA_KIJIN", 10],
    ["NINJA_NINJUTSU", 16], ["STRATEGIST_FIRE_PLAY", 3], ["STRATEGIST_FLAME_ART", 3],
  ] as const)("maps %s to %i processing waves", (technique, waves) => {
    expect(getTechniqueProfile(technique).waveCount).toBe(waves);
  });

  it("converts the basic and iron-wall knockbacks from SWF units", () => {
    expect(REACTION_CONFIG.knockbackDistance).toBe(swfUnitsToWorldX(10));
    expect(REACTION_CONFIG.ironWallGuardKnockbackDistance).toBe(swfUnitsToWorldX(5));
  });

  it("keeps the recovered fire offsets, tk=60 and horizontal Y correction in SWF units", () => {
    const caster = useTechnique(soldier("fire"), "STRATEGIST_FIRE_ATTACK", "STRATEGIST");
    caster.facingX = 1;
    caster.facingY = 0;
    expect(getTechniqueProfile(caster.technique)).toMatchObject({
      forwardOffsetSwfUnits: 80,
      horizontalYOffsetSwfUnits: -16,
      activationRangeSwfUnits: 60,
    });
    expect(getTechniqueAreaCenter(caster.technique, caster)).toEqual({
      x: caster.x + swfUnitsToWorldX(80),
      y: caster.y + swfCellsToWorldY(-16 / 36),
    });
  });

  it("retains the confirmed movement values for barrier and furious", () => {
    expect(getTechniqueProfile("NINJA_BARRIER").selfAdvanceSwfUnits).toBe(16);
    expect(getTechniqueProfile("GENERAL_FURIOUS")).toMatchObject({
      actionLockTicks: 16,
      selfAdvanceSwfUnits: 30,
      edgeSelfAdvanceSwfUnits: 10,
    });
  });

  it("rescans a spear technique once per wave instead of applying ten damage at activation", () => {
    const attacker = useTechnique(soldier("spear"), "ASHIGARU_SPEAR_STRIKE", "ASHIGARU");
    const target = soldier("target", "enemy"); target.x = attacker.x + 60;
    attacker.combatGauge = 500;
    updateSpecialAttacks([attacker, target], [], [], 0, false, () => 1);
    expect(target.maxHp - target.hp).toBe(1);
    expect(attacker.specialWavesRemaining).toBe(9);
    updateSpecialAttacks([attacker, target], [], [], 9 * (1000 / 24), false, () => 1);
    expect(target.maxHp - target.hp).toBe(10);
    expect(attacker.specialWavesRemaining).toBe(0);
  });
});

describe("SWF strategist damage distinctions", () => {
  it("does not let a fire wave reduce HP below one", () => {
    const caster = useTechnique(soldier("caster"), "STRATEGIST_FIRE_ATTACK", "STRATEGIST");
    const target = soldier("target", "enemy"); target.x = caster.x + swfCellsToWorldX(2); target.hp = 1;
    executeStrategistAttack(caster, [caster, target], [], [], 0, () => 1, false);
    expect(target.hp).toBe(1);
  });

  it("allows sorcery damage to reach zero while false report remains non-damaging", () => {
    const caster = useTechnique(soldier("caster"), "STRATEGIST_SORCERY", "STRATEGIST");
    const target = soldier("target", "enemy"); target.hp = 1;
    executeStrategistAttack(caster, [caster, target], [], [], 0, () => 1, false);
    expect(target.hp).toBe(0);
    const falseReporter = useTechnique(soldier("false"), "STRATEGIST_FALSE_REPORT", "STRATEGIST");
    const other = soldier("other", "enemy");
    executeStrategistAttack(falseReporter, [falseReporter, other], [], [], 0, () => 1, false);
    expect(other.hp).toBe(other.maxHp);
    expect(other.isConfused).toBe(true);
  });
});
