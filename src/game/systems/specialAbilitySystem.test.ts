import { describe, expect, it } from "vitest";
import { createSoldier } from "../entities/Soldier";
import { createArmy } from "../factories/createArmy";
import {
  COMMON_SPECIAL_ABILITY_POOL, calculateBaseAttackDamage, calculateNormalAttackDamage,
  createRandomCommonSpecialAbilities, getEffectiveDefenseForAttack, hasSpecialAbility,
} from "./specialAbilitySystem";

describe("Phase 3I common special abilities", () => {
  it("assigns zero to two unique common abilities deterministically", () => {
    const sequence = [0.99, 0, 0]; let index = 0;
    const first = createRandomCommonSpecialAbilities(() => sequence[index++] ?? 0);
    index = 0;
    expect(first).toEqual(createRandomCommonSpecialAbilities(() => sequence[index++] ?? 0));
    expect(first).toHaveLength(2);
    expect(new Set(first).size).toBe(first.length);
    expect(first.every((id) => COMMON_SPECIAL_ABILITY_POOL.includes(id))).toBe(true);
  });
  it("assigns abilities to the player through injected army RNG", () => {
    const player = createArmy("player", () => 0, { playerAllCommonAbilities: false })[0];
    expect(player.specialAbilities).toEqual([]);
  });
  it("stacks might and finisher only at target HP five or less", () => {
    const attacker = createSoldier("a", "player", "ai", 0, 0);
    const target = createSoldier("b", "enemy", "ai", 0, 0);
    attacker.specialAbilities = ["MIGHT", "FINISHER"];
    target.hp = 6; expect(calculateNormalAttackDamage(attacker, target)).toBe(3);
    target.hp = 5; expect(calculateNormalAttackDamage(attacker, target)).toBe(3);
  });
  it("limits siege to base damage and leaves defense unchanged", () => {
    const soldier = createSoldier("a", "player", "ai", 0, 0);
    soldier.specialAbilities = ["SIEGE", "HORO"];
    expect(calculateBaseAttackDamage(soldier)).toBe(2);
    expect(getEffectiveDefenseForAttack(soldier, "NORMAL_ATTACK")).toBe(soldier.stats.defense);
    expect(getEffectiveDefenseForAttack(soldier, "ARROW_ATTACK")).toBe(soldier.stats.defense);
    expect(hasSpecialAbility(soldier, "SIEGE")).toBe(true);
  });
});
