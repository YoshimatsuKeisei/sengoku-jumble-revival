import { describe, expect, it } from "vitest";
import { createSoldier } from "../entities/Soldier";
import { applyDamage } from "./combatSystem";
import { shouldEmergencyRetreat, updateRecoveryStates } from "./recoverySystem";
import { calculateRetreatMoveSpeed } from "./specialAbilitySystem";
import {
  BATTLE_OUT_EXIT_X_WORLD,
  BATTLE_END_EXIT_X_WORLD,
  BATTLE_OUT_SPEED_WORLD_PER_SECOND,
  areBattleOutTransitionsComplete,
  startBattleEndWithdrawal,
  updateBattleOutMovement,
  releaseBattleOutTargets,
} from "./battleOutSystem";
import { getSoldierMoveSpeed } from "../stats/soldierStats";

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
    normal.stats.foot = 3;
    expect(calculateRetreatMoveSpeed(30, normal)).toBe(30);
    normal.specialAbilities.push("FLEET_FOOT");
    expect(calculateRetreatMoveSpeed(30, normal)).toBe(50);
    normal.stats.foot = 7;
    expect(calculateRetreatMoveSpeed(70, normal)).toBe(80);
  });

  it("never routes HP-zero soldiers into the recoverable retreat state", () => {
    const soldier = createSoldier("p", "player", "ai", 0, 0);
    soldier.hp = 0;
    expect(shouldEmergencyRetreat(soldier)).toBe(false);
    updateRecoveryStates([soldier], 0);
    expect(soldier.state).toBe("NORMAL");
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
    expect([player.facingX, player.facingY]).toEqual([-1, 0]);
    expect([enemy.facingX, enemy.facingY]).toEqual([1, 0]);
  });

  it("reasserts team-facing during battle-out without consulting foot or FLEET_FOOT", () => {
    const player = createSoldier("p", "player", "ai", 500, 321);
    player.stats.foot = 1;
    player.specialAbilities.push("FLEET_FOOT");
    applyDamage(player, player.hp);
    player.facingX = 0;
    player.facingY = 1;
    updateBattleOutMovement([player], 1 / 24);
    expect(player.x).toBeCloseTo(500 - BATTLE_OUT_SPEED_WORLD_PER_SECOND / 24);
    expect([player.facingX, player.facingY]).toEqual([-1, 0]);
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

  it("withdraws surviving armies toward their own side at each soldier's foot speed", () => {
    const slow = createSoldier("slow", "player", "ai", 500, 200);
    const fast = createSoldier("fast", "enemy", "ai", 1_900, 700);
    slow.stats.foot = 2;
    fast.stats.foot = 6;
    startBattleEndWithdrawal([slow, fast]);
    expect([slow.battleOutState, fast.battleOutState]).toEqual(["ENDING", "ENDING"]);
    updateBattleOutMovement([slow, fast], 0.5);
    expect(slow.x).toBeCloseTo(500 - getSoldierMoveSpeed(slow) * 0.5);
    expect(fast.x).toBeCloseTo(1_900 + getSoldierMoveSpeed(fast) * 0.5);
    expect(slow.y).toBe(200);
    expect(fast.y).toBe(700);
    expect(areBattleOutTransitionsComplete([slow, fast])).toBe(false);
  });

  it("ends battle-result withdrawal at the transformed SWF p=201 thresholds", () => {
    const player = createSoldier(
      "player",
      "player",
      "ai",
      BATTLE_END_EXIT_X_WORLD.player + 1,
      200,
    );
    const enemy = createSoldier(
      "enemy",
      "enemy",
      "ai",
      BATTLE_END_EXIT_X_WORLD.enemy - 1,
      700,
    );
    player.stats.foot = 6;
    enemy.stats.foot = 6;
    startBattleEndWithdrawal([player, enemy]);
    expect(updateBattleOutMovement([player, enemy], 1)).toEqual([
      "player",
      "enemy",
    ]);
    expect([player.battleOutState, enemy.battleOutState]).toEqual([
      "DONE",
      "DONE",
    ]);
  });
});
