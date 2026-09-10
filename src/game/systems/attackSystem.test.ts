import { describe, expect, it } from "vitest";
import { COMBAT_TIMING_CONFIG, NORMAL_ATTACK_DAMAGE } from "../config";
import { createSoldier } from "../entities/Soldier";
import { createBattleBases } from "./baseSystem";
import {
  canStartSoldierAttack,
  startSoldierAttack,
  updateAttackStates,
} from "./attackSystem";
import { moveAiSoldiers, movePlayer } from "./movementSystem";
import { updateRecoveryStates } from "./recoverySystem";
import { issueAdvanceCommand } from "./commandSystem";
import { SWF_HIT_REACTION_MS, updateReactions } from "./reactionSystem";

function duel(controller: "ai" | "player" = "ai") {
  const attacker = createSoldier("attacker", "player", controller, 100, 100, "charge");
  const target = createSoldier("target", "enemy", "ai", 120, 100);
  const bases = createBattleBases();
  attacker.targetId = target.id;
  target.stats.defense = 0;
  startSoldierAttack(attacker, target, 0);
  return { attacker, target, soldiers: [attacker, target], bases };
}

describe("attack state machine", () => {
  it("starts an attack against an enemy in range without immediate damage", () => {
    const { attacker, target, soldiers, bases } = duel();
    expect(canStartSoldierAttack(attacker, target, 0)).toBe(false);
    updateAttackStates(soldiers, bases, 0);
    expect(attacker.combatActionState).toBe("ATTACK_WINDUP");
    expect(target.hp).toBe(target.maxHp);
  });

  it("applies exactly one hit when windup finishes", () => {
    const { attacker, target, soldiers, bases } = duel();
    updateAttackStates(soldiers, bases, 0);
    updateAttackStates(soldiers, bases, COMBAT_TIMING_CONFIG.attackWindupMs);
    expect(target.hp).toBe(target.maxHp - NORMAL_ATTACK_DAMAGE);
    updateAttackStates(soldiers, bases, COMBAT_TIMING_CONFIG.attackWindupMs + 1);
    expect(target.hp).toBe(target.maxHp - NORMAL_ATTACK_DAMAGE);
    expect(attacker.attackHitApplied).toBe(true);
  });

  it("misses if the target leaves attack range during windup", () => {
    const { attacker, target, soldiers, bases } = duel();
    updateAttackStates(soldiers, bases, 0);
    target.x = 300;
    updateAttackStates(soldiers, bases, COMBAT_TIMING_CONFIG.attackWindupMs);
    expect(target.hp).toBe(target.maxHp);
    expect(attacker.combatActionState).toBe("ATTACK_RECOVERY");
  });

  it("misses if another soldier kills the attack target during windup", () => {
    const { attacker, target, soldiers, bases } = duel();
    updateAttackStates(soldiers, bases, 0);
    target.hp = 0;
    target.isDead = true;
    updateAttackStates(soldiers, bases, COMBAT_TIMING_CONFIG.attackWindupMs);
    expect(target.hp).toBe(0);
    expect(attacker.combatActionState).toBe("ATTACK_RECOVERY");
  });

  it("does not restart an attack during recovery", () => {
    const { attacker, soldiers, bases } = duel();
    updateAttackStates(soldiers, bases, 0);
    updateAttackStates(soldiers, bases, COMBAT_TIMING_CONFIG.attackWindupMs);
    updateAttackStates(soldiers, bases, COMBAT_TIMING_CONFIG.attackWindupMs + 100);
    expect(attacker.combatActionState).toBe("ATTACK_RECOVERY");
    expect(attacker.attackStartedAt).toBe(0);
  });

  it("returns to IDLE after recovery while preserving Combat Target and Strategy", () => {
    const { attacker, target, soldiers, bases } = duel();
    const cycleEnd = COMBAT_TIMING_CONFIG.attackWindupMs + COMBAT_TIMING_CONFIG.attackRecoveryMs;
    updateAttackStates(soldiers, bases, 0);
    updateAttackStates(soldiers, bases, cycleEnd);
    expect(attacker.combatActionState).toBe("IDLE");
    expect(attacker.targetId).toBe(target.id);
    expect(attacker.strategy).toBe("charge");
  });

  it("keeps the attack target fixed when a closer enemy appears", () => {
    const { attacker, target, soldiers, bases } = duel();
    updateAttackStates(soldiers, bases, 0);
    const closer = createSoldier("closer", "enemy", "ai", 101, 100);
    soldiers.push(closer);
    attacker.targetId = closer.id;
    updateAttackStates(soldiers, bases, COMBAT_TIMING_CONFIG.attackWindupMs);
    expect(attacker.attackTargetId).toBe(target.id);
    expect(target.hp).toBe(target.maxHp - NORMAL_ATTACK_DAMAGE);
    expect(closer.hp).toBe(closer.maxHp);
  });

  it("stops AI movement during windup and recovery, then resumes movement", () => {
    const { attacker, soldiers, bases } = duel();
    attacker.moveTargetX = 300;
    attacker.moveTargetY = 100;
    updateAttackStates(soldiers, bases, 0);
    const before = attacker.x;
    moveAiSoldiers(soldiers, 0.1);
    expect(attacker.x).toBe(before);
    updateAttackStates(soldiers, bases, COMBAT_TIMING_CONFIG.attackWindupMs);
    moveAiSoldiers(soldiers, 0.1);
    expect(attacker.x).toBe(before);
    updateAttackStates(soldiers, bases, COMBAT_TIMING_CONFIG.attackWindupMs + COMBAT_TIMING_CONFIG.attackRecoveryMs);
    attacker.targetId = null;
    moveAiSoldiers(soldiers, 0.1);
    expect(attacker.x).toBeGreaterThan(before);
  });

  it("blocks player movement during the same attack states", () => {
    const { attacker, soldiers, bases } = duel("player");
    updateAttackStates(soldiers, bases, 0);
    movePlayer(attacker, 1, 0, 0.1);
    expect(attacker.x).toBe(100);
  });

  it("cancels an attack when dangerous HP starts emergency retreat", () => {
    const { attacker, soldiers, bases } = duel();
    updateAttackStates(soldiers, bases, 0);
    attacker.hp = 5;
    updateRecoveryStates(soldiers, 0);
    expect(attacker.state).toBe("EMERGENCY_RETREAT");
    expect(attacker.combatActionState).toBe("IDLE");
    expect(attacker.attackTargetId).toBeNull();
  });

  it("cancels only command recipients' current attacks", () => {
    const player = createSoldier("player", "player", "player", 100, 100);
    const near = createSoldier("near", "player", "ai", 110, 100, "defend");
    const far = createSoldier("far", "player", "ai", 400, 100, "wait");
    const enemy = createSoldier("enemy", "enemy", "ai", 120, 100);
    const farEnemy = createSoldier("far-enemy", "enemy", "ai", 420, 100);
    near.targetId = enemy.id;
    far.targetId = farEnemy.id;
    startSoldierAttack(near, enemy, 0);
    startSoldierAttack(far, farEnemy, 0);
    issueAdvanceCommand(player, [player, near, far, enemy, farEnemy], 10);
    expect(near.combatActionState).toBe("IDLE");
    expect(far.combatActionState).toBe("ATTACK_WINDUP");
    expect(near.strategy).toBe("defend");
  });

  it("cancels an attack without changing Strategy", () => {
    const { attacker, soldiers, bases } = duel();
    attacker.strategy = "wait";
    updateAttackStates(soldiers, bases, 0);
    attacker.hp = 1;
    updateRecoveryStates(soldiers, 0);
    expect(attacker.strategy).toBe("wait");
  });

  it("does not treat a nearby enemy base as a normal attack target", () => {
    const bases = createBattleBases();
    const enemyBase = bases.find((base) => base.team === "enemy")!;
    const attacker = createSoldier("attacker", "player", "ai", enemyBase.x - enemyBase.width / 2, enemyBase.y, "charge");
    updateAttackStates([attacker], bases, 0);
    expect(attacker.combatActionState).toBe("IDLE");
    expect(attacker.attackTargetKind).toBeNull();
    expect(enemyBase.hp).toBe(enemyBase.maxHp);
  });

  it("does not resolve a reserved hit after battle end", () => {
    const { attacker, target, soldiers, bases } = duel();
    updateAttackStates(soldiers, bases, 0);
    updateAttackStates(soldiers, bases, COMBAT_TIMING_CONFIG.attackWindupMs, true);
    expect(target.hp).toBe(target.maxHp);
    expect(attacker.combatActionState).toBe("ATTACK_WINDUP");
  });

  it("does not hit if the attacker dies during windup", () => {
    const { attacker, target, soldiers, bases } = duel();
    updateAttackStates(soldiers, bases, 0);
    attacker.isDead = true;
    attacker.hp = 0;
    updateAttackStates(soldiers, bases, COMBAT_TIMING_CONFIG.attackWindupMs);
    expect(target.hp).toBe(target.maxHp);
    expect(attacker.combatActionState).toBe("IDLE");
  });

  it("allows simultaneous legacy windups but keeps fatal cleanup delayed through the confirmed hit reaction", () => {
    const target = createSoldier("target", "enemy", "ai", 120, 100);
    target.hp = 1;
    target.stats.defense = 0;
    const first = createSoldier("first", "player", "ai", 100, 100);
    const second = createSoldier("second", "player", "ai", 101, 100);
    first.targetId = target.id;
    second.targetId = target.id;
    const soldiers = [first, second, target];
    const bases = createBattleBases();
    startSoldierAttack(first, target, 0);
    startSoldierAttack(second, target, 0);
    updateAttackStates(soldiers, bases, 0);
    expect(first.combatActionState).toBe("ATTACK_WINDUP");
    expect(second.combatActionState).toBe("ATTACK_WINDUP");
    updateAttackStates(soldiers, bases, COMBAT_TIMING_CONFIG.attackWindupMs);
    expect(target.hp).toBe(0);
    expect(target.isDead).toBe(false);
    expect(first.attackHitApplied).toBe(true);
    expect(second.attackHitApplied).toBe(true);
    const reactionEnd = COMBAT_TIMING_CONFIG.attackWindupMs + SWF_HIT_REACTION_MS;
    updateReactions(soldiers, [], reactionEnd, SWF_HIT_REACTION_MS);
    expect(target.isDead).toBe(true);
  });

  it("uses the same state machine for a player-controlled attacker", () => {
    const { attacker, target, soldiers, bases } = duel("player");
    updateAttackStates(soldiers, bases, 0);
    expect(attacker.combatActionState).toBe("ATTACK_WINDUP");
    expect(target.hp).toBe(target.maxHp);
    updateAttackStates(soldiers, bases, COMBAT_TIMING_CONFIG.attackWindupMs);
    expect(target.hp).toBe(target.maxHp - NORMAL_ATTACK_DAMAGE);
  });
});
