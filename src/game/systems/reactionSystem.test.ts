import { describe, expect, it } from "vitest";
import { COMBAT_TIMING_CONFIG, NORMAL_ATTACK_DAMAGE, REACTION_CONFIG, RECOVERY_CONFIG } from "../config";
import { createSoldier } from "../entities/Soldier";
import type { BattleObstacle } from "../types";
import { createBattleBases, getBaseForTeam } from "./baseSystem";
import { applyDamage } from "./combatSystem";
import { moveAiSoldiers, movePlayer } from "./movementSystem";
import { updateRecoveryStates } from "./recoverySystem";
import { clearReaction, startHitReaction, updateReactions } from "./reactionSystem";
import { startSoldierAttack, updateAttackStates } from "./attackSystem";
import { issueAdvanceCommand, updateTemporaryOrders } from "./commandSystem";

function pair() {
  const attacker = createSoldier("attacker", "enemy", "ai", 100, 100);
  const target = createSoldier("target", "player", "ai", 120, 100, "defend");
  target.stats.defense = 0;
  return { attacker, target };
}

describe("hit reaction layer", () => {
  it("enters HIT_STUN after a valid Soldier hit", () => {
    const { attacker, target } = pair();
    attacker.targetId = target.id;
    const soldiers = [attacker, target];
    const bases = createBattleBases();
    startSoldierAttack(attacker, target, 0);
    updateAttackStates(soldiers, bases, 0);
    updateAttackStates(soldiers, bases, COMBAT_TIMING_CONFIG.attackWindupMs);
    expect(target.reactionState).toBe("HIT_STUN");
    expect(target.hp).toBe(target.maxHp - NORMAL_ATTACK_DAMAGE);
  });

  it("does not create a Reaction on MISS", () => {
    const { attacker, target } = pair();
    attacker.targetId = target.id;
    const soldiers = [attacker, target];
    const bases = createBattleBases();
    startSoldierAttack(attacker, target, 0);
    updateAttackStates(soldiers, bases, 0);
    target.x = 500;
    updateAttackStates(soldiers, bases, COMBAT_TIMING_CONFIG.attackWindupMs);
    expect(target.reactionState).toBe("NONE");
  });

  it("does not add Reaction state to a BattleBase hit", () => {
    const bases = createBattleBases();
    const base = getBaseForTeam(bases, "enemy");
    const attacker = createSoldier("p", "player", "ai", base.x - base.width / 2 - 28, base.y);
    updateAttackStates([attacker], bases, 0);
    updateAttackStates([attacker], bases, COMBAT_TIMING_CONFIG.attackWindupMs);
    expect("reactionState" in base).toBe(false);
  });

  it("blocks Strategy and TemporaryOrder movement during HIT_STUN", () => {
    const { attacker, target } = pair();
    target.moveTargetX = 400;
    target.moveTargetY = 100;
    target.temporaryOrder = { type: "ADVANCE", issuedAt: 0, expiresAt: 1_000, sourceX: 0, sourceY: 0 };
    startHitReaction(target, attacker, 0);
    moveAiSoldiers([target], 0.1);
    expect(target.x).toBe(120);
  });

  it("blocks emergency-retreat movement and resumes it after stun", () => {
    const { attacker, target } = pair();
    target.state = "EMERGENCY_RETREAT";
    target.moveTargetX = 400;
    target.moveTargetY = 100;
    startHitReaction(target, attacker, 0);
    moveAiSoldiers([target], 0.1);
    expect(target.x).toBe(120);
    updateReactions([target], [], REACTION_CONFIG.hitStunMs, REACTION_CONFIG.hitStunMs);
    moveAiSoldiers([target], 0.1);
    expect(target.x).toBeGreaterThan(120);
    expect(target.state).toBe("EMERGENCY_RETREAT");
  });

  it("delays emergency retreat until dangerous-HP hit stun ends", () => {
    const { attacker, target } = pair();
    target.hp = target.maxHp * RECOVERY_CONFIG.dangerHpRatio + NORMAL_ATTACK_DAMAGE;
    attacker.targetId = target.id;
    const soldiers = [attacker, target];
    const bases = createBattleBases();
    startSoldierAttack(attacker, target, 0);
    updateAttackStates(soldiers, bases, 0);
    updateAttackStates(soldiers, bases, COMBAT_TIMING_CONFIG.attackWindupMs);
    updateRecoveryStates(soldiers, 0);
    expect(target.reactionState).toBe("HIT_STUN");
    expect(target.state).toBe("NORMAL");
    updateReactions(soldiers, [], COMBAT_TIMING_CONFIG.attackWindupMs + REACTION_CONFIG.hitStunMs, REACTION_CONFIG.hitStunMs);
    updateRecoveryStates(soldiers, 0);
    expect(target.reactionState).toBe("NONE");
    expect(target.state).toBe("EMERGENCY_RETREAT");
  });

  it("pauses HEALING and returns to the same state afterward", () => {
    const { attacker, target } = pair();
    target.state = "HEALING";
    target.hp = target.maxHp - 31;
    const hpBefore = target.hp;
    startHitReaction(target, attacker, 0);
    updateRecoveryStates([target], 1);
    expect(target.hp).toBe(hpBefore);
    updateReactions([target], [], REACTION_CONFIG.hitStunMs, REACTION_CONFIG.hitStunMs);
    updateRecoveryStates([target], 1);
    expect(target.hp).toBeGreaterThan(hpBefore);
    expect(target.state).toBe("HEALING");
  });

  it("pauses REJOINING without changing that SoldierState", () => {
    const { attacker, target } = pair();
    target.state = "REJOINING";
    startHitReaction(target, attacker, 0);
    updateRecoveryStates([target], 1);
    expect(target.state).toBe("REJOINING");
  });

  it("cancels ATTACK_WINDUP and prevents its reserved hit", () => {
    const { attacker, target } = pair();
    const victim = createSoldier("victim", "enemy", "ai", 140, 100);
    target.targetId = victim.id;
    expect(startSoldierAttack(target, victim, 0)).toBe(true);
    startHitReaction(target, attacker, 50);
    expect(target.combatActionState).toBe("IDLE");
    updateAttackStates([target, victim], createBattleBases(), COMBAT_TIMING_CONFIG.attackWindupMs);
    expect(victim.hp).toBe(victim.maxHp);
  });

  it("also interrupts ATTACK_RECOVERY", () => {
    const { attacker, target } = pair();
    target.combatActionState = "ATTACK_RECOVERY";
    target.attackRecoveryEndsAt = 500;
    startHitReaction(target, attacker, 100);
    expect(target.combatActionState).toBe("IDLE");
    expect(target.reactionState).toBe("HIT_STUN");
  });

  it("preserves Strategy, Combat Target, Engagement, and active order", () => {
    const { attacker, target } = pair();
    target.targetId = attacker.id;
    target.engagementStartedAt = 10;
    target.temporaryOrder = { type: "ADVANCE", issuedAt: 0, expiresAt: 1_000, sourceX: 0, sourceY: 0 };
    startHitReaction(target, attacker, 100);
    expect(target.strategy).toBe("defend");
    expect(target.targetId).toBe(attacker.id);
    expect(target.engagementStartedAt).toBe(10);
    expect(target.temporaryOrder?.type).toBe("ADVANCE");
  });

  it("resumes an unexpired TemporaryOrder after stun", () => {
    const player = createSoldier("player", "player", "player", 100, 100);
    const target = createSoldier("target", "player", "ai", 120, 100);
    const attacker = createSoldier("enemy", "enemy", "ai", 110, 100);
    issueAdvanceCommand(player, [player, target, attacker], 0);
    startHitReaction(target, attacker, 10);
    updateReactions([target], [], 190, 180);
    updateTemporaryOrders([target], player, 190);
    expect(target.temporaryOrder?.type).toBe("ADVANCE");
  });

  it("clears an order whose deadline expires during stun", () => {
    const player = createSoldier("player", "player", "player", 100, 100);
    const { attacker, target } = pair();
    target.temporaryOrder = { type: "ADVANCE", issuedAt: 0, expiresAt: 100, sourceX: 0, sourceY: 0 };
    startHitReaction(target, attacker, 0);
    updateTemporaryOrders([target], player, 150);
    expect(target.temporaryOrder).toBeNull();
  });

  it("knocks the target away from the attacker by a fixed total distance", () => {
    const { attacker, target } = pair();
    const startX = target.x;
    startHitReaction(target, attacker, 0);
    updateReactions([target], [], REACTION_CONFIG.hitStunMs, REACTION_CONFIG.hitStunMs);
    expect(target.x).toBeCloseTo(startX + REACTION_CONFIG.knockbackDistance);
    expect(target.y).toBe(100);
  });

  it("does not knock a soldier through a fence", () => {
    const attacker = createSoldier("a", "enemy", "ai", 100, 100);
    const target = createSoldier("t", "player", "ai", 110, 100);
    const fence: BattleObstacle = { id: "f", type: "FENCE", x: 120, y: 80, width: 20, height: 40 };
    startHitReaction(target, attacker, 0);
    updateReactions([target], [fence], REACTION_CONFIG.hitStunMs, REACTION_CONFIG.hitStunMs);
    expect(target.x).toBeLessThanOrEqual(fence.x - 8);
  });

  it("clamps knockback at world bounds", () => {
    const attacker = createSoldier("a", "enemy", "ai", 20, 100);
    const target = createSoldier("t", "player", "ai", 8, 100);
    startHitReaction(target, attacker, 0);
    updateReactions([target], [], REACTION_CONFIG.hitStunMs, REACTION_CONFIG.hitStunMs);
    expect(target.x).toBe(8);
  });

  it("refreshes stun and replaces knockback deterministically on repeated hits", () => {
    const { attacker, target } = pair();
    startHitReaction(target, attacker, 0);
    const firstEnd = target.reactionEndsAt;
    const other = createSoldier("other", "enemy", "ai", 140, 100);
    startHitReaction(target, other, 100);
    expect(target.reactionEndsAt).toBe(100 + REACTION_CONFIG.hitStunMs);
    expect(target.reactionEndsAt).toBeGreaterThan(firstEnd ?? 0);
    expect(target.knockbackDirectionX).toBeLessThan(0);
    expect(target.knockbackRemainingDistance).toBe(REACTION_CONFIG.knockbackDistance);
  });

  it("takes repeated damage during stun and dies immediately with cleared runtime", () => {
    const { attacker, target } = pair();
    target.hp = 10;
    startHitReaction(target, attacker, 0);
    applyDamage(target, 10);
    expect(target.isDead).toBe(true);
    expect(target.reactionState).toBe("NONE");
    expect(target.reactionEndsAt).toBeNull();
  });

  it("blocks player input during stun and resumes afterward when healthy", () => {
    const attacker = createSoldier("a", "enemy", "ai", 100, 100);
    const player = createSoldier("p", "player", "player", 120, 100);
    startHitReaction(player, attacker, 0);
    movePlayer(player, 1, 0, 0.1);
    expect(player.x).toBe(120);
    updateReactions([player], [], REACTION_CONFIG.hitStunMs, REACTION_CONFIG.hitStunMs);
    movePlayer(player, 1, 0, 0.1);
    expect(player.x).toBeGreaterThan(120);
  });

  it("does not update knockback after battle end", () => {
    const { attacker, target } = pair();
    startHitReaction(target, attacker, 0);
    const before = target.x;
    updateReactions([target], [], 100, 100, true);
    expect(target.x).toBe(before);
    expect(target.reactionState).toBe("HIT_STUN");
    clearReaction(target);
  });
});
