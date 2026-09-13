import { describe, expect, it } from "vitest";
import {
  battlefieldSourcePointToWorld,
  battlefieldWorldPointToSource,
} from "../../src/game/battlefieldLayout";
import { createSoldier } from "../../src/game/entities/Soldier";
import {
  startSoldierAttack,
  SWF_IRON_WALL_GUARD_IMPULSE_UNITS,
  SWF_NORMAL_CONTACT_IMPULSE_UNITS,
  SWF_NORMAL_CONTACT_K_TICKS,
  updateAttackStates,
} from "../../src/game/systems/attackSystem";
import { updateReactions } from "../../src/game/systems/reactionSystem";
import { swfLogicTicksToMs } from "../../src/game/systems/techniqueCombatProfiles";

const STATS = { maxHp: 60, skill: 50, foot: 3, combat: 50, defense: 0 } as const;

function unit(id: string, team: "player" | "enemy", sourceX: number) {
  const point = battlefieldSourcePointToWorld({ x: sourceX, y: 500 });
  return createSoldier(id, team, "ai", point.x, point.y, "melee", STATS);
}

function resolveAtHit(attacker: ReturnType<typeof unit>, defender: ReturnType<typeof unit>, random: () => number) {
  expect(startSoldierAttack(attacker, defender, 1_000)).toBe(true);
  expect(attacker.attackHitAt).not.toBeNull();
  const hitAt = attacker.attackHitAt!;
  updateAttackStates([attacker, defender], [], hitAt, false, random);
  return hitAt;
}

function sourceX(soldier: ReturnType<typeof unit>): number {
  return battlefieldWorldPointToSource(soldier).x;
}

describe("raw mode-0 normal-contact k lock and impulse", () => {
  it("faces the defender toward the attacker but moves the defender away on a hit", () => {
    const defender = unit("defender", "player", 500);
    const attacker = unit("attacker", "enemy", 510);
    const hitAt = resolveAtHit(attacker, defender, () => 0.99);

    expect(defender.combatFeedbackMarker).toBe("H");
    expect(defender.facingX).toBeGreaterThan(0);
    expect(attacker.facingX).toBeLessThan(0);
    expect(defender.knockbackRemainingDistance).toBe(0);
    expect(defender.reactionState).toBe("HIT_STUN");
    expect(defender.abilityActionLockUntil).toBeCloseTo(hitAt + swfLogicTicksToMs(SWF_NORMAL_CONTACT_K_TICKS + 1));
    expect(attacker.abilityActionLockUntil).toBeCloseTo(hitAt + swfLogicTicksToMs(SWF_NORMAL_CONTACT_K_TICKS + 1));

    const before = sourceX(defender);
    const tick = swfLogicTicksToMs(1);
    updateReactions([attacker, defender], [], hitAt + tick, tick);
    expect(before - sourceX(defender)).toBeCloseTo(SWF_NORMAL_CONTACT_IMPULSE_UNITS, 6);
  });

  it("uses the same 10-unit outward impulse for an ordinary successful guard", () => {
    const defender = unit("defender", "player", 500);
    const attacker = unit("attacker", "enemy", 510);
    defender.stats.defense = 100;
    const hitAt = resolveAtHit(attacker, defender, () => 0);

    expect(defender.combatFeedbackMarker).toBe("S");
    expect(defender.reactionState).toBe("NONE");
    const defenderBefore = sourceX(defender);
    const attackerBefore = sourceX(attacker);
    const tick = swfLogicTicksToMs(1);
    updateReactions([attacker, defender], [], hitAt + tick, tick);
    expect(defenderBefore - sourceX(defender)).toBeCloseTo(SWF_NORMAL_CONTACT_IMPULSE_UNITS, 6);
    expect(sourceX(attacker)).toBeCloseTo(attackerBefore, 6);
  });

  it("applies the IRON_WALL 5-unit defender impulse plus 10-unit attacker recoil", () => {
    const defender = unit("defender", "player", 500);
    const attacker = unit("attacker", "enemy", 510);
    defender.stats.defense = 100;
    defender.specialAbilities.push("IRON_WALL");
    const hitAt = resolveAtHit(attacker, defender, () => 0);

    const defenderBefore = sourceX(defender);
    const attackerBefore = sourceX(attacker);
    const tick = swfLogicTicksToMs(1);
    updateReactions([attacker, defender], [], hitAt + tick, tick);

    expect(defenderBefore - sourceX(defender)).toBeCloseTo(SWF_IRON_WALL_GUARD_IMPULSE_UNITS, 6);
    expect(sourceX(attacker) - attackerBefore).toBeCloseTo(SWF_NORMAL_CONTACT_IMPULSE_UNITS, 6);
    expect(defender.facingX).toBeGreaterThan(0);
    expect(attacker.facingX).toBeLessThan(0);
  });
});
