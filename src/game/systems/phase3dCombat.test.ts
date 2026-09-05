import { describe, expect, it } from "vitest";
import { COMBAT_TIMING_CONFIG, MOVEMENT_SPEED_CONFIG, NORMAL_ATTACK_DAMAGE } from "../config";
import { createSoldier } from "../entities/Soldier";
import {
  calculateMoveSpeedFromFoot,
  createPrototypeStats,
  getEffectiveFoot,
  getSoldierMoveSpeed,
  randomIntInclusive,
} from "../stats/soldierStats";
import type { SoldierBaseStats } from "../types";
import { createBattleBases } from "./baseSystem";
import { startSoldierAttack, updateAttackStates } from "./attackSystem";
import { applyDamage, isOutOfBattle, isWithdrawn } from "./combatSystem";
import { getNormalGuardProbability, isDamageGuarded } from "./defenseSystem";
import { applyForcedMovement, moveAiSoldiers, movePlayer } from "./movementSystem";
import { getCombatWinProbability, resolveCombatContest, updateNormalCombatContests } from "./normalCombatSystem";

function stats(overrides: Partial<SoldierBaseStats> = {}): SoldierBaseStats {
  return { maxHp: 60, skill: 50, foot: 3, combat: 50, defense: 50, ...overrides };
}

describe("Phase 3D normal parameters", () => {
  it("generates both inclusive ends for HP and foot with injected RNG", () => {
    expect(createPrototypeStats(() => 0)).toEqual({ maxHp: 50, skill: 50, foot: 1, combat: 50, defense: 50 });
    expect(createPrototypeStats(() => 0.999999)).toEqual({ maxHp: 70, skill: 50, foot: 6, combat: 50, defense: 50 });
  });

  it("normalizes reversed integer ranges and clamps RNG samples", () => {
    expect(randomIntInclusive(6, 1, () => -1)).toBe(1);
    expect(randomIntInclusive(6, 1, () => 2)).toBe(6);
  });

  it("initializes runtime HP from maxHp without sharing the stats object", () => {
    const source = stats({ maxHp: 67 });
    const soldier = createSoldier("s", "player", "ai", 0, 0, "melee", source);
    source.maxHp = 1;
    expect(soldier.hp).toBe(67);
    expect(soldier.maxHp).toBe(67);
    expect(soldier.stats.maxHp).toBe(67);
  });

  it("uses foot as a linear multiplier while keeping foot 3 at the reference speed", () => {
    expect(calculateMoveSpeedFromFoot(3)).toBe(MOVEMENT_SPEED_CONFIG.referenceSpeed);
    expect(calculateMoveSpeedFromFoot(6)).toBe(6 * MOVEMENT_SPEED_CONFIG.footSpeedUnitPxPerSecond);
    expect(calculateMoveSpeedFromFoot(6) / calculateMoveSpeedFromFoot(1)).toBe(6);
    expect(calculateMoveSpeedFromFoot(1)).toBeLessThan(calculateMoveSpeedFromFoot(2));
  });

  it("applies the player foot-3 minimum without changing stored foot", () => {
    const player = createSoldier("p", "player", "player", 100, 100, "melee", stats({ foot: 1 }));
    const ai = createSoldier("a", "player", "ai", 100, 100, "melee", stats({ foot: 1 }));
    expect(getEffectiveFoot(player)).toBe(3);
    expect(player.stats.foot).toBe(1);
    expect(getSoldierMoveSpeed(player)).toBe(80);
    expect(getSoldierMoveSpeed(ai)).toBe(calculateMoveSpeedFromFoot(1));
  });

  it("uses derived speed for player, AI, and recovery-controlled movement", () => {
    const player = createSoldier("p", "player", "player", 100, 100, "melee", stats({ foot: 6 }));
    movePlayer(player, 1, 0, 1);
    expect(player.x - 100).toBeCloseTo(calculateMoveSpeedFromFoot(6));

    const retreating = createSoldier("r", "player", "ai", 100, 200, "melee", stats({ foot: 1 }));
    retreating.state = "EMERGENCY_RETREAT";
    retreating.moveTargetX = 500;
    retreating.moveTargetY = 200;
    moveAiSoldiers([retreating], 1);
    expect(retreating.x - 100).toBeCloseTo(calculateMoveSpeedFromFoot(1));
  });

  it("keeps forced knockback distance independent of foot", () => {
    const slow = createSoldier("s", "player", "ai", 100, 100, "melee", stats({ foot: 1 }));
    const fast = createSoldier("f", "player", "ai", 100, 200, "melee", stats({ foot: 6 }));
    applyForcedMovement(slow, 1, 0, 8);
    applyForcedMovement(fast, 1, 0, 8);
    expect(slow.x).toBe(108);
    expect(fast.x).toBe(108);
  });
});

describe("Phase 3D combat contest and defense", () => {
  it("calculates official combat weights including zero and negative values", () => {
    expect(getCombatWinProbability(75, 25)).toBe(0.75);
    expect(getCombatWinProbability(0, 0)).toBe(0.5);
    expect(getCombatWinProbability(-10, 30)).toBe(0);
  });

  it("selects the contest winner with injected RNG", () => {
    const a = createSoldier("a", "player", "ai", 100, 100, "melee", stats({ combat: 75 }));
    const b = createSoldier("b", "enemy", "ai", 110, 100, "melee", stats({ combat: 25 }));
    expect(resolveCombatContest(a, b, () => 0.749)).toBe(a);
    expect(resolveCombatContest(a, b, () => 0.75)).toBe(b);
  });

  it("resolves an unordered pair once and starts only the winner", () => {
    const a = createSoldier("a", "player", "ai", 100, 100, "melee", stats({ combat: 50 }));
    const b = createSoldier("b", "enemy", "ai", 110, 100, "melee", stats({ combat: 50 }));
    a.targetId = b.id;
    b.targetId = a.id;
    let calls = 0;
    updateNormalCombatContests([a, b], 0, () => { calls += 1; return 0; });
    expect(calls).toBe(1);
    expect(a.combatActionState).toBe("ATTACK_WINDUP");
    expect(b.combatActionState).toBe("IDLE");
  });

  it("does not require the winner's combat target to be the loser", () => {
    const a = createSoldier("a", "player", "ai", 100, 100, "melee", stats({ combat: 0 }));
    const b = createSoldier("b", "enemy", "ai", 110, 100, "melee", stats({ combat: 100 }));
    const other = createSoldier("other", "player", "ai", 500, 500);
    a.targetId = b.id;
    b.targetId = other.id;
    updateNormalCombatContests([a, b, other], 0, () => 0.9);
    expect(b.targetId).toBe(other.id);
    expect(b.attackTargetId).toBe(a.id);
  });

  it("does not run a soldier contest for base attacks", () => {
    const attacker = createSoldier("a", "player", "ai", 550, 128);
    updateNormalCombatContests([attacker], 0, () => { throw new Error("contest RNG must not run"); });
    expect(attacker.combatActionState).toBe("IDLE");
  });

  it("calculates guard probability and bypasses non-normal damage kinds", () => {
    const defender = createSoldier("d", "enemy", "ai", 0, 0, "melee", stats({ defense: 100 }));
    expect(getNormalGuardProbability(100)).toBe(0.75);
    expect(getNormalGuardProbability(-1)).toBe(0);
    expect(isDamageGuarded(defender, "NORMAL_ATTACK", () => 0.37)).toBe(true);
    expect(isDamageGuarded(defender, "NORMAL_ATTACK", () => 0.75)).toBe(false);
    expect(isDamageGuarded(defender, "SPECIAL_ATTACK", () => 0)).toBe(false);
    expect(isDamageGuarded(defender, "TRAP", () => 0)).toBe(false);
  });

  it("guarded normal hits deal zero damage and create no reaction", () => {
    const attacker = createSoldier("a", "player", "ai", 100, 100);
    const defender = createSoldier("d", "enemy", "ai", 110, 100, "melee", stats({ defense: 100 }));
    startSoldierAttack(attacker, defender, 0);
    updateAttackStates([attacker, defender], createBattleBases(), COMBAT_TIMING_CONFIG.attackWindupMs, false, () => 0);
    expect(defender.hp).toBe(defender.maxHp);
    expect(defender.reactionState).toBe("NONE");
  });

  it("failed normal guards deal exactly 1 damage then create a reaction", () => {
    const attacker = createSoldier("a", "player", "ai", 100, 100, "melee", stats({ combat: 999 }));
    const defender = createSoldier("d", "enemy", "ai", 110, 100, "melee", stats({ defense: 100 }));
    startSoldierAttack(attacker, defender, 0);
    updateAttackStates([attacker, defender], createBattleBases(), COMBAT_TIMING_CONFIG.attackWindupMs, false, () => 1);
    expect(defender.hp).toBe(defender.maxHp - NORMAL_ATTACK_DAMAGE);
    expect(defender.reactionState).toBe("HIT_STUN");
  });

  it("keeps combat and skill out of normal damage calculation", () => {
    const attacker = createSoldier("a", "player", "ai", 100, 100, "melee", stats({ skill: 9999, combat: 9999 }));
    const defender = createSoldier("d", "enemy", "ai", 110, 100, "melee", stats({ defense: 0 }));
    startSoldierAttack(attacker, defender, 0);
    updateAttackStates([attacker, defender], createBattleBases(), COMBAT_TIMING_CONFIG.attackWindupMs, false, () => 1);
    expect(defender.maxHp - defender.hp).toBe(1);
  });

  it("treats HP 0 as battle withdrawal through semantic helpers", () => {
    const soldier = createSoldier("s", "player", "ai", 0, 0, "melee", stats({ maxHp: 50 }));
    applyDamage(soldier, 50);
    expect(isWithdrawn(soldier)).toBe(true);
    expect(isOutOfBattle(soldier)).toBe(true);
    expect(soldier.hp).toBe(0);
  });
});
