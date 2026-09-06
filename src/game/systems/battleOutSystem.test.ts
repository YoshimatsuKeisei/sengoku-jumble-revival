import { describe, expect, it } from "vitest";
import { createSoldier } from "../entities/Soldier";
import { applyDamage } from "./combatSystem";
import { updateRecoveryStates } from "./recoverySystem";
import { calculateRetreatMoveSpeed } from "./specialAbilitySystem";
import {
  BATTLE_OUT_EXIT_X_WORLD,
  BATTLE_OUT_SPEED_WORLD_PER_SECOND,
  areBattleOutTransitionsComplete,
  updateBattleOutMovement,
  releaseBattleOutTargets,
} from "./battleOutSystem";

describe("temporary retreat and HP-0 battle-out", () => {
  it("waits for hit stun to end before starting a recoverable retreat", () => {
    const soldier = createSoldier("p", "player", "ai", 500, 450);
    soldier.hp = 1;
    soldier.reactionState = "HIT_STUN";
    updateRecoveryStates([soldier], 0, undefined, () => 0, 100);
    expect(soldier.state).toBe("NORMAL");
    soldier.reactionState = "NONE";
    updateRecoveryStates([soldier], 0, undefined, () => 0, 101);
    expect(soldier.state).toBe("EMERGENCY_RETREAT");
    expect(soldier.isDead).toBe(false);
  });

  it("applies the +2 capped foot rule only to FLEET_FOOT retreat", () => {
    const normal = createSoldier("normal", "player", "ai", 0, 0);
    normal.stats.foot = 6;
    expect(calculateRetreatMoveSpeed(60, normal)).toBe(60);
    normal.specialAbilities.push("FLEET_FOOT");
    expect(calculateRetreatMoveSpeed(60, normal)).toBe(80);
  });

  it("moves both teams directly at one shared delta-time speed without changing Y", () => {
    const player = createSoldier("p", "player", "ai", 500, 321);
    const enemy = createSoldier("e", "enemy", "ai", 1900, 654);
    player.stats.foot = 1;
    enemy.stats.foot = 6;
    enemy.specialAbilities.push("FLEET_FOOT");
    applyDamage(player, player.hp);
    applyDamage(enemy, enemy.hp);
    updateBattleOutMovement([player, enemy], 0.25);
    expect(player.x).toBeCloseTo(500 - BATTLE_OUT_SPEED_WORLD_PER_SECOND * 0.25);
    expect(enemy.x).toBeCloseTo(1900 + BATTLE_OUT_SPEED_WORLD_PER_SECOND * 0.25);
    expect(player.y).toBe(321);
    expect(enemy.y).toBe(654);
  });

  it("finishes only beyond the transformed SWF exit thresholds and is idempotent", () => {
    const player = createSoldier("p", "player", "ai", BATTLE_OUT_EXIT_X_WORLD.player + 1, 100);
    applyDamage(player, player.hp);
    applyDamage(player, 99);
    expect(player.battleOutState).toBe("EXITING");
    expect(areBattleOutTransitionsComplete([player])).toBe(false);
    expect(updateBattleOutMovement([player], 1)).toEqual([player.id]);
    expect(player.battleOutState).toBe("DONE");
    expect(areBattleOutTransitionsComplete([player])).toBe(true);
    expect(updateBattleOutMovement([player], 1)).toEqual([]);
  });

  it("releases tracking and attack state without reapplying damage", () => {
    const target = createSoldier("target", "enemy", "ai", 100, 100);
    const pursuer = createSoldier("pursuer", "player", "ai", 120, 100);
    pursuer.targetId = target.id;
    pursuer.attackTargetId = target.id;
    pursuer.combatActionState = "ATTACK_WINDUP";
    applyDamage(target, target.hp);
    releaseBattleOutTargets([pursuer, target]);
    expect(pursuer.targetId).toBeNull();
    expect(pursuer.attackTargetId).toBeNull();
    expect(pursuer.combatActionState).toBe("IDLE");
  });
});
