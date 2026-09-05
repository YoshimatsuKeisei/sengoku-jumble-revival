import { describe, expect, it } from "vitest";
import { createSoldier } from "../entities/Soldier";
import type { SoldierLoadout } from "../types";
import { updateAttackStates } from "./attackSystem";
import { createBattleBases } from "./baseSystem";
import { clearConfusion, applyConfusion } from "./confusionSystem";
import { updateNormalCombatContests } from "./normalCombatSystem";
import { startHitReaction, updateReactions } from "./reactionSystem";
import { shouldEmergencyRetreat, updateRecoveryStates } from "./recoverySystem";
import { canUseSpecial, updateSpecialAttacks } from "./specialAttackSystem";

const loadout = (unitType: SoldierLoadout["unitType"], technique: SoldierLoadout["technique"]): SoldierLoadout => ({
  unitType, technique, stats: { maxHp: 90, skill: 90, foot: 4, combat: 110, defense: 90 }, specialAbilities: [],
});

describe("Phase 4F.1 confusion", () => {
  it("keeps combat capability and resolves a normal contact contest without pursuit state", () => {
    const confused = createSoldier("c", "player", "ai", 100, 100);
    const enemy = createSoldier("e", "enemy", "ai", 108, 100);
    applyConfusion(confused);

    updateNormalCombatContests([confused, enemy], 0, () => 0);

    expect(confused.combatActionState).toBe("ATTACK_WINDUP");
    expect(confused.targetId).toBeNull();
    updateAttackStates([confused, enemy], createBattleBases(), 1_000, false, () => 1);
    expect(enemy.hp).toBeLessThan(enemy.maxHp);
    expect(confused.isConfused).toBe(true);
  });

  it("allows confused prototype, gun, archer and ninja specials against in-range enemies", () => {
    for (const [unitType, technique] of [
      ["PROTOTYPE", "PROTOTYPE_AREA"], ["TEPPOU", "TEPPOU_SHOOTING"],
      ["ARCHER", "ARCHER_ARROW"], ["NINJA", "NINJA_NINJUTSU"],
    ] as const) {
      const attacker = createSoldier(`a-${unitType}`, "player", "ai", 100, 100, "charge", undefined, loadout(unitType, technique));
      const enemy = createSoldier(`e-${unitType}`, "enemy", "ai", 140, 100);
      applyConfusion(attacker);
      expect(canUseSpecial(attacker, 100)).toBe(true);
      const events = updateSpecialAttacks([attacker, enemy], [], [], 100, false, () => 1);
      expect(events.some((event) => event.kind === "ARROW"
        ? event.projectile.shooterId === attacker.id : event.attackerId === attacker.id), unitType).toBe(true);
      expect(attacker.isConfused).toBe(true);
    }
  });

  it("does not clear on hit or guard-like no-damage events, but clears at emergency transition after stun", () => {
    const soldier = createSoldier("c", "player", "ai", 500, 400);
    const attacker = createSoldier("a", "enemy", "ai", 510, 400);
    applyConfusion(soldier);
    soldier.hp = soldier.maxHp * 0.1;
    startHitReaction(soldier, attacker, 0, 0);
    expect(shouldEmergencyRetreat(soldier)).toBe(false);
    updateRecoveryStates([soldier], 0, createBattleBases());
    expect(soldier.isConfused).toBe(true);

    updateReactions([soldier], [], 10_000, 10_000);
    updateRecoveryStates([soldier], 0, createBattleBases());
    expect(soldier.state).toBe("EMERGENCY_RETREAT");
    expect(soldier.isConfused).toBe(false);
  });

  it("supports every explicit clear hook and never stacks confusion", () => {
    const soldier = createSoldier("c", "player", "ai", 0, 0);
    for (const reason of ["PLAYER_COMMAND", "JINTO_ORDER", "BARRIER_COMMAND", "BARRIER_CHARGE_ORDER", "GENERAL_COMMAND", "EMERGENCY_RETREAT"] as const) {
      applyConfusion(soldier); applyConfusion(soldier);
      expect(soldier.isConfused).toBe(true);
      clearConfusion(soldier, reason);
      expect(soldier.isConfused).toBe(false);
    }
  });
});
