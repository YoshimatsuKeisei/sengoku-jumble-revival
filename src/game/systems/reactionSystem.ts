import { REACTION_CONFIG, STRATEGY_AI_CONFIG } from "../config";
import type { RandomSource } from "../stats/soldierStats";
import type { AttackKind, BattleObstacle, Soldier } from "../types";
import { cancelAttack } from "./attackRuntime";
import { applyForcedMovement } from "./movementSystem";
import { startEngagement } from "./aiSystem";
import { hasSpecialAbility } from "./specialAbilitySystem";

function fallbackDirection(attacker: Soldier, target: Soldier): { x: number; y: number } {
  let hash = 0;
  for (const character of `${attacker.id}:${target.id}`) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return { x: hash % 2 === 0 ? 1 : -1, y: 0 };
}

export function clearReaction(soldier: Soldier): void {
  soldier.reactionState = "NONE";
  soldier.reactionStartedAt = null;
  soldier.reactionEndsAt = null;
  soldier.knockbackDirectionX = 0;
  soldier.knockbackDirectionY = 0;
  soldier.knockbackRemainingDistance = 0;
}

export function startHitReaction(
  target: Soldier,
  attacker: Soldier,
  currentTime: number,
  knockbackDistance: number = REACTION_CONFIG.knockbackDistance,
  random: RandomSource = Math.random,
  attackKind: AttackKind = "NORMAL_ATTACK",
): void {
  if (target.isDead) { clearReaction(target); return; }
  const canRetaliate = target.strategy === "wait" || target.strategy === "charge";
  const rushIgnoresRetarget = target.strategy === "charge"
    && hasSpecialAbility(target, "RUSH")
    && attackKind !== "NORMAL_ATTACK"
    && random() < STRATEGY_AI_CONFIG.rushRetargetIgnoreChance;
  if (canRetaliate && !rushIgnoresRetarget) startEngagement(target, attacker, currentTime);
  cancelAttack(target);
  target.activeSpecialTechnique = null;
  target.specialWavesRemaining = 0;
  target.nextSpecialWaveAt = null;
  let dx = target.x - attacker.x;
  let dy = target.y - attacker.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) ({ x: dx, y: dy } = fallbackDirection(attacker, target));
  else { dx /= length; dy /= length; }
  target.reactionState = "HIT_STUN";
  target.reactionStartedAt = currentTime;
  target.reactionEndsAt = currentTime + REACTION_CONFIG.hitStunMs;
  target.knockbackDirectionX = dx;
  target.knockbackDirectionY = dy;
  target.knockbackRemainingDistance = Math.max(0, knockbackDistance);
}

export function updateReaction(
  soldier: Soldier,
  obstacles: readonly BattleObstacle[],
  currentTime: number,
  deltaMs: number,
): void {
  if (soldier.isDead) { clearReaction(soldier); return; }
  if (soldier.reactionState !== "HIT_STUN" || soldier.reactionEndsAt === null) return;
  const proportionalStep = REACTION_CONFIG.knockbackDistance * Math.max(0, deltaMs) / REACTION_CONFIG.hitStunMs;
  const step = currentTime >= soldier.reactionEndsAt
    ? soldier.knockbackRemainingDistance
    : Math.min(soldier.knockbackRemainingDistance, proportionalStep);
  if (step > 0) {
    applyForcedMovement(soldier, soldier.knockbackDirectionX, soldier.knockbackDirectionY, step, obstacles);
    soldier.knockbackRemainingDistance = Math.max(0, soldier.knockbackRemainingDistance - step);
  }
  if (currentTime >= soldier.reactionEndsAt) clearReaction(soldier);
}

export function updateReactions(
  soldiers: Soldier[],
  obstacles: readonly BattleObstacle[],
  currentTime: number,
  deltaMs: number,
  battleEnded = false,
): void {
  if (battleEnded) return;
  for (const soldier of soldiers) updateReaction(soldier, obstacles, currentTime, deltaMs);
}
