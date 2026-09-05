import { BATTLEFIELD_CONFIG, CAVALRY_CONFIG, DEFENSE_CONFIG, SOLDIER_RADIUS, SPECIAL_ABILITY_CONFIG, SPECIAL_ATTACK_CONFIG } from "../config";
import type { RandomSource } from "../stats/soldierStats";
import type { BattleBase, BattleObstacle, Soldier, Team } from "../types";
import { applyDamage } from "./combatSystem";
import { isDamageGuarded } from "./defenseSystem";
import { getBaseRect } from "./battlefieldGeometry";
import { startHitReaction } from "./reactionSystem";
import { calculateSpecialCooldownMs } from "./skillCooldownSystem";
import { hasSpecialAbility } from "./specialAbilitySystem";
import { isValidCombatTarget } from "./combatTargetSystem";

export const CAVALRY_CHARGE_RADIUS = SPECIAL_ATTACK_CONFIG.radius * CAVALRY_CONFIG.chargeRadiusMultiplier;
export const CAVALRY_CHARGE_KNOCKBACK = SPECIAL_ATTACK_CONFIG.knockbackDistance * CAVALRY_CONFIG.chargeKnockbackMultiplier;
export interface CavalryChargeEvent { kind: "CAVALRY"; attackerId: string; team: Team; x: number; y: number; targetIds: string[]; reactive: boolean }
export function queueMoutaiOnDamage(target: Soldier, damage: number): void {
  if (damage > 0 && !target.isDead && target.unitType === "CAVALRY" && target.state === "EMERGENCY_RETREAT"
    && target.rareSpecialAbilities.includes("MOUTAI")) target.pendingMoutaiCharges += 1;
}
export function getVerticalChargeDirection(attacker: Soldier, target: Soldier): number {
  if (target.y !== attacker.y) return target.y < attacker.y ? -1 : 1;
  let hash = 0; for (const character of target.id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % 2 === 0 ? -1 : 1;
}
function positionClear(target: Soldier, x: number, y: number, soldiers: readonly Soldier[], obstacles: readonly BattleObstacle[], bases: readonly BattleBase[]): boolean {
  if (x < SOLDIER_RADIUS || x > BATTLEFIELD_CONFIG.width - SOLDIER_RADIUS || y < SOLDIER_RADIUS || y > BATTLEFIELD_CONFIG.height - SOLDIER_RADIUS) return false;
  if (obstacles.some((obstacle) => { const nearX = Math.max(obstacle.x, Math.min(x, obstacle.x + obstacle.width)); const nearY = Math.max(obstacle.y, Math.min(y, obstacle.y + obstacle.height)); return (x - nearX) ** 2 + (y - nearY) ** 2 < SOLDIER_RADIUS ** 2; })) return false;
  if (bases.some((base) => { const r = getBaseRect(base); return x >= r.x - SOLDIER_RADIUS && x <= r.x + r.width + SOLDIER_RADIUS && y >= r.y - SOLDIER_RADIUS && y <= r.y + r.height + SOLDIER_RADIUS; })) return false;
  return soldiers.every((other) => other === target || other.isDead || Math.hypot(x - other.x, y - other.y) >= SOLDIER_RADIUS * 2);
}
export function calculateSafeCavalryKnockbackDistance(target: Soldier, directionY: number, requested: number,
  soldiers: readonly Soldier[], obstacles: readonly BattleObstacle[] = [], bases: readonly BattleBase[] = []): number {
  let safe = 0; const increment = 1;
  for (let distance = increment; distance <= requested; distance += increment) {
    if (!positionClear(target, target.x, target.y + directionY * distance, soldiers, obstacles, bases)) break;
    safe = distance;
  }
  return safe;
}
export function executeCavalryCharge(attacker: Soldier, soldiers: Soldier[], obstacles: readonly BattleObstacle[], bases: readonly BattleBase[],
  currentTime: number, random: RandomSource = Math.random, options: { reactive?: boolean; consumeCooldown?: boolean } = {}): CavalryChargeEvent | null {
  const reactive = options.reactive ?? false; const consumeCooldown = options.consumeCooldown ?? !reactive;
  const targets = soldiers.filter((target) => isValidCombatTarget(attacker, target)
    && target.state !== "REJOINING" && Math.hypot(target.x - attacker.x, target.y - attacker.y) <= CAVALRY_CHARGE_RADIUS);
  if (!reactive && targets.length === 0) return null;
  if (consumeCooldown) {
    attacker.specialReadyAt = currentTime + calculateSpecialCooldownMs(attacker.stats.skill);
    if (hasSpecialAbility(attacker, "DOUBLE_SPECIAL") && random() < SPECIAL_ABILITY_CONFIG.doubleSpecialChance)
      attacker.pendingSecondSpecialAt = currentTime + SPECIAL_ABILITY_CONFIG.doubleSpecialDelayMs;
  }
  const hitIds: string[] = [];
  for (const target of targets) {
    if (isDamageGuarded(target, "SPECIAL_ATTACK", random)) {
      target.combatFeedbackMarker = "S"; target.combatFeedbackUntil = currentTime + DEFENSE_CONFIG.guardMarkerDurationMs; continue;
    }
    const damage = 1 + Number(hasSpecialAbility(attacker, "MIGHT")); applyDamage(target, damage); queueMoutaiOnDamage(target, damage);
    target.combatFeedbackMarker = "H"; target.combatFeedbackUntil = currentTime + DEFENSE_CONFIG.guardMarkerDurationMs; hitIds.push(target.id);
    if (target.isDead) continue;
    const directionY = getVerticalChargeDirection(attacker, target);
    const safe = calculateSafeCavalryKnockbackDistance(target, directionY, CAVALRY_CHARGE_KNOCKBACK, soldiers, obstacles, bases);
    startHitReaction(target, attacker, currentTime, safe); target.knockbackDirectionX = 0; target.knockbackDirectionY = directionY;
  }
  return { kind: "CAVALRY", attackerId: attacker.id, team: attacker.team, x: attacker.x, y: attacker.y, targetIds: hitIds, reactive };
}
