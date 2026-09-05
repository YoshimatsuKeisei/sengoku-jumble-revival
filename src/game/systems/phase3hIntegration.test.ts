import { describe, expect, it } from "vitest";
import {
  COMBAT_TIMING_CONFIG,
  PROTOTYPE_COMBAT_MAX,
  PROTOTYPE_DEFENSE_MAX,
  RECOVERY_CONFIG,
  SPECIAL_ATTACK_CONFIG,
} from "../config";
import { createSoldier } from "../entities/Soldier";
import { createArmy } from "../factories/createArmy";
import type { SoldierBaseStats } from "../types";
import { startSoldierAttack, updateAttackStates } from "./attackSystem";
import { createBattleBases, getBaseForTeam } from "./baseSystem";
import { getBaseGatePoint } from "./battlefieldGeometry";
import { getNormalGuardProbability, isDamageGuarded } from "./defenseSystem";
import { updateHealing } from "./recoverySystem";
import {
  calculateSpecialCooldownMs,
  executeSpecialAttack,
  findSpecialTargets,
  updateSpecialAttacks,
} from "./specialAttackSystem";

function stats(skill = 50, defense = 50): SoldierBaseStats {
  return { maxHp: 60, skill, foot: 3, combat: 50, defense };
}

describe("Phase 3H healing", () => {
  it("uses 1 HP/sec with delta time", () => {
    const soldier = createSoldier("h", "player", "ai", 0, 0);
    soldier.state = "HEALING";
    soldier.hp -= 10;
    updateHealing(soldier, 0.5);
    expect(RECOVERY_CONFIG.healingHpPerSecond).toBe(1);
    expect(soldier.hp).toBe(soldier.maxHp - 9.5);
    updateHealing(soldier, 5);
    expect(soldier.hp).toBe(soldier.maxHp - 4.5);
  });

  it.each(["TOP", "BOTTOM"] as const)("snaps through the stored %s gate and returns directly to NORMAL", (gate) => {
    const bases = createBattleBases();
    const base = getBaseForTeam(bases, "player");
    const soldier = createSoldier(`h-${gate}`, "player", "ai", base.x, base.y);
    soldier.state = "HEALING";
    soldier.recoveryGate = gate;
    soldier.recoveryGateEntered = true;
    soldier.hp = soldier.maxHp - 0.5;
    updateHealing(soldier, 0.5, bases);
    expect({ x: soldier.x, y: soldier.y }).toEqual(getBaseGatePoint(base, gate, false));
    expect(soldier.state).toBe("NORMAL");
    expect(soldier.moveTargetX).toBeNull();
    expect(soldier.recoveryGate).toBeNull();
  });
});

describe("Phase 3H guard", () => {
  it.each([[0, 0], [25, 0.1875], [50, 0.375], [75, 0.5625], [100, 0.75]])(
    "maps defense %i to guard probability %f", (defense, expected) => {
      expect(getNormalGuardProbability(defense)).toBe(expected);
    },
  );

  it("bypasses guard for special damage", () => {
    const defender = createSoldier("d", "enemy", "ai", 0, 0, "melee", stats(50, 100));
    expect(isDamageGuarded(defender, "SPECIAL_ATTACK", () => 0)).toBe(false);
  });

  it("marks S without damage/stun on guard and H with damage/stun on failure", () => {
    for (const [random, marker, damage] of [[0, "S", 0], [1, "H", 1]] as const) {
      const attacker = createSoldier(`a-${marker}`, "player", "ai", 100, 100);
      const target = createSoldier(`t-${marker}`, "enemy", "ai", 120, 100, "melee", stats(50, 100));
      startSoldierAttack(attacker, target, 0);
      updateAttackStates([attacker, target], createBattleBases(), COMBAT_TIMING_CONFIG.attackWindupMs, false, () => random);
      expect(target.combatFeedbackMarker).toBe(marker);
      expect(target.hp).toBe(target.maxHp - damage);
      expect(target.reactionState).toBe(damage ? "HIT_STUN" : "NONE");
      expect(target.knockbackRemainingDistance).toBe(damage ? 8 : 0);
    }
  });

  it("also guards a normal hit while retreating", () => {
    const attacker = createSoldier("a", "player", "ai", 100, 100);
    const target = createSoldier("r", "enemy", "ai", 120, 100, "melee", stats(50, 100));
    target.state = "EMERGENCY_RETREAT";
    startSoldierAttack(attacker, target, 0);
    updateAttackStates([attacker, target], createBattleBases(), COMBAT_TIMING_CONFIG.attackWindupMs, false, () => 0);
    expect(target.combatFeedbackMarker).toBe("S");
    expect(target.state).toBe("EMERGENCY_RETREAT");
    expect(target.reactionState).toBe("NONE");
  });
});

describe("Phase 3H skill special attack", () => {
  it("maps skill 0/50/100 to 8000/5750/3500ms", () => {
    expect(calculateSpecialCooldownMs(0)).toBe(8000);
    expect(calculateSpecialCooldownMs(50)).toBe(5750);
    expect(calculateSpecialCooldownMs(100)).toBe(3500);
  });

  it("does not fire or consume cooldown without an enemy", () => {
    const attacker = createSoldier("a", "player", "ai", 500, 100);
    expect(updateSpecialAttacks([attacker], [], [], 100, false)).toEqual([]);
    expect(attacker.specialReadyAt).toBe(0);
  });

  it("hits every in-range enemy through maximum defense and excludes out-of-range enemies", () => {
    const attacker = createSoldier("a", "player", "ai", 500, 100, "melee", stats(50));
    const first = createSoldier("e1", "enemy", "ai", 520, 100, "melee", stats(50, 100));
    const second = createSoldier("e2", "enemy", "ai", 500, 130, "melee", stats(50, 100));
    const far = createSoldier("far", "enemy", "ai", 500 + SPECIAL_ATTACK_CONFIG.radius + 1, 100);
    const soldiers = [attacker, first, second, far];
    const targets = findSpecialTargets(attacker, soldiers);
    const event = executeSpecialAttack(attacker, targets, soldiers, [], [], 0);
    expect(event?.team).toBe("player");
    expect(first.hp).toBe(first.maxHp - 1);
    expect(second.hp).toBe(second.maxHp - 1);
    expect(first.reactionState).toBe("HIT_STUN");
    expect(far.hp).toBe(far.maxHp);
    expect(attacker.specialReadyAt).toBe(5750);
  });

  it("cancels knockback when another soldier blocks the path without moving the blocker", () => {
    const attacker = createSoldier("a", "player", "ai", 500, 100);
    const target = createSoldier("t", "enemy", "ai", 520, 100);
    const blocker = createSoldier("b", "enemy", "ai", 548, 100);
    const before = { targetX: target.x, blockerX: blocker.x };
    executeSpecialAttack(attacker, [target], [attacker, target, blocker], [], [], 0);
    expect(target.x).toBe(before.targetX);
    expect(blocker.x).toBe(before.blockerX);
    expect(target.hp).toBe(target.maxHp - 1);
    expect(target.reactionState).toBe("HIT_STUN");
  });

  it("retreat special targets only the forward half and preserves retreat state", () => {
    const attacker = createSoldier("r", "player", "ai", 500, 100);
    attacker.state = "EMERGENCY_RETREAT";
    attacker.moveTargetX = 600;
    attacker.moveTargetY = 100;
    const front = createSoldier("front", "enemy", "ai", 530, 100);
    const back = createSoldier("back", "enemy", "ai", 470, 100);
    front.specialReadyAt = 1;
    back.specialReadyAt = 1;
    const events = updateSpecialAttacks([attacker, front, back], [], [], 0);
    expect(events).toHaveLength(1);
    expect(front.hp).toBe(front.maxHp - 1);
    expect(back.hp).toBe(back.maxHp);
    expect(attacker.state).toBe("EMERGENCY_RETREAT");
  });
});

describe("Phase 3H player debug stats", () => {
  it("fixes only foot/combat/defense while retaining prototype skill", () => {
    const player = createArmy("player", () => 0)[0];
    expect(player.stats.foot).toBe(6);
    expect(player.stats.combat).toBe(PROTOTYPE_COMBAT_MAX);
    expect(player.stats.defense).toBe(PROTOTYPE_DEFENSE_MAX);
    expect(player.stats.skill).toBe(50);
  });
});
