import { DEFENSE_CONFIG, MOSA_CONFIG, SPECIAL_ABILITY_CONFIG } from "../config";
import type { RandomSource } from "../stats/soldierStats";
import type { BattleBase, BattleObstacle, Soldier, Team, UnitTechnique } from "../types";
import { applyDamage } from "./combatSystem";
import { isValidCombatTarget } from "./combatTargetSystem";
import { isDamageGuarded } from "./defenseSystem";
import { startHitReaction } from "./reactionSystem";
import { calculateSafeSpearKnockbackDistance } from "./spearAttackSystem";
import { calculateSpecialCooldownMs } from "./skillCooldownSystem";
import { hasSpecialAbility } from "./specialAbilitySystem";
import { queueMoutaiOnDamage } from "./cavalryChargeSystem";

export type MosaTechnique = "MOSA_SENPUU" | "MOSA_MUSOU" | "MOSA_KIJIN";
export interface MosaAttackEvent { kind: "MOSA"; attackerId: string; team: Team; technique: MosaTechnique;
  x: number; y: number; facingX: number; facingY: number; radius: number; hitIds: string[]; defendedIds: string[] }
export function isMosaTechnique(technique: UnitTechnique): technique is MosaTechnique {
  return technique === "MOSA_SENPUU" || technique === "MOSA_MUSOU" || technique === "MOSA_KIJIN";
}
export function getMosaRadius(technique: MosaTechnique): number {
  return technique === "MOSA_KIJIN" ? MOSA_CONFIG.kijinRadius
    : technique === "MOSA_SENPUU" ? MOSA_CONFIG.senpuuRadius : MOSA_CONFIG.musouRadius;
}
export function getMosaKnockback(technique: MosaTechnique): number {
  return technique === "MOSA_KIJIN" ? MOSA_CONFIG.kijinKnockback
    : technique === "MOSA_SENPUU" ? MOSA_CONFIG.senpuuKnockback : MOSA_CONFIG.musouKnockback;
}
function normalizedFacing(attacker: Soldier): { x: number; y: number } {
  const length = Math.hypot(attacker.facingX, attacker.facingY) || 1;
  return { x: attacker.facingX / length, y: attacker.facingY / length };
}
export function isInsideSenpuu(attacker: Soldier, target: Soldier): boolean {
  const dx = target.x - attacker.x; const dy = target.y - attacker.y; const distance = Math.hypot(dx, dy);
  if (distance === 0 || distance > MOSA_CONFIG.senpuuRadius) return false;
  const facing = normalizedFacing(attacker);
  return (dx / distance) * facing.x + (dy / distance) * facing.y >= Math.cos(MOSA_CONFIG.senpuuHalfAngleDegrees * Math.PI / 180);
}
export function findMosaTargets(attacker: Soldier, soldiers: readonly Soldier[]): Soldier[] {
  if (!isMosaTechnique(attacker.technique)) return [];
  const radius = getMosaRadius(attacker.technique);
  return soldiers.filter((target) => isValidCombatTarget(attacker, target) && target.state !== "REJOINING"
    && Math.hypot(target.x - attacker.x, target.y - attacker.y) <= radius
    && (attacker.technique !== "MOSA_SENPUU" || isInsideSenpuu(attacker, target)));
}
export function executeMosaAttack(attacker: Soldier, soldiers: Soldier[], obstacles: readonly BattleObstacle[], bases: readonly BattleBase[],
  currentTime: number, random: RandomSource = Math.random, consumeCooldown = true): MosaAttackEvent | null {
  if (!isMosaTechnique(attacker.technique)) return null;
  const targets = findMosaTargets(attacker, soldiers); if (!targets.length) return null;
  const primary = targets.find((target) => target.id === attacker.targetId) ?? targets[0];
  const pdx = primary.x - attacker.x; const pdy = primary.y - attacker.y; const pl = Math.hypot(pdx, pdy) || 1;
  attacker.facingX = pdx / pl; attacker.facingY = pdy / pl; attacker.aimX = attacker.facingX; attacker.aimY = attacker.facingY;
  if (consumeCooldown) {
    attacker.specialReadyAt = currentTime + calculateSpecialCooldownMs(attacker.stats.skill);
    if (hasSpecialAbility(attacker, "DOUBLE_SPECIAL") && random() < SPECIAL_ABILITY_CONFIG.doubleSpecialChance)
      attacker.pendingSecondSpecialAt = currentTime + SPECIAL_ABILITY_CONFIG.doubleSpecialDelayMs;
  }
  const event: MosaAttackEvent = { kind: "MOSA", attackerId: attacker.id, team: attacker.team, technique: attacker.technique,
    x: attacker.x, y: attacker.y, facingX: attacker.facingX, facingY: attacker.facingY, radius: getMosaRadius(attacker.technique), hitIds: [], defendedIds: [] };
  for (const target of targets) {
    if (isDamageGuarded(target, "SPECIAL_ATTACK", random)) {
      target.combatFeedbackMarker = "S"; target.combatFeedbackUntil = currentTime + DEFENSE_CONFIG.guardMarkerDurationMs;
      event.defendedIds.push(target.id); continue;
    }
    const damage = 1 + Number(hasSpecialAbility(attacker, "MIGHT")); applyDamage(target, damage); queueMoutaiOnDamage(target, damage);
    target.combatFeedbackMarker = "H"; target.combatFeedbackUntil = currentTime + DEFENSE_CONFIG.guardMarkerDurationMs; event.hitIds.push(target.id);
    if (target.isDead) continue;
    let dx = target.x - attacker.x; let dy = target.y - attacker.y; const length = Math.hypot(dx, dy) || 1; dx /= length; dy /= length;
    const safe = calculateSafeSpearKnockbackDistance(target, dx, dy, getMosaKnockback(attacker.technique), soldiers, obstacles, bases);
    startHitReaction(target, attacker, currentTime, safe); target.knockbackDirectionX = dx; target.knockbackDirectionY = dy;
  }
  return event;
}
