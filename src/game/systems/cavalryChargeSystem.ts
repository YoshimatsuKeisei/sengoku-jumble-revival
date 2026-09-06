import { BATTLEFIELD_CONFIG, CAVALRY_CONFIG, DEFENSE_CONFIG, SOLDIER_RADIUS, SPECIAL_ATTACK_CONFIG } from "../config";
import type { RandomSource } from "../stats/soldierStats";
import type { BattleBase, BattleObstacle, Soldier, Team } from "../types";
import { applyDamage } from "./combatSystem";
import { isDamageGuarded } from "./defenseSystem";
import { getBaseRect } from "./battlefieldGeometry";
import { startHitReaction } from "./reactionSystem";
import { isValidCombatTarget } from "./combatTargetSystem";
import { calculateSuccessfulAttackDamage } from "./specialAbilitySystem";
import { beginTechniqueAction } from "./combatGaugeSystem";
import { getTechniqueAreaCenter, getTechniqueAreaWorld, getTechniqueSelfAdvanceWorld, isPointInTechniqueRectangle } from "./techniqueCombatProfiles";

export const CAVALRY_CHARGE_RADIUS = getTechniqueAreaWorld("CAVALRY_CHARGE").width / 2;
export const CAVALRY_CHARGE_KNOCKBACK = SPECIAL_ATTACK_CONFIG.knockbackDistance * CAVALRY_CONFIG.chargeKnockbackMultiplier;
export interface CavalryChargeEvent { kind: "CAVALRY"; attackerId: string; team: Team; x: number; y: number; targetIds: string[]; reactive: boolean }
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
function calculateSafeCavalryAdvance(attacker: Soldier, directionX: number, directionY: number, requested: number,
  soldiers: readonly Soldier[], obstacles: readonly BattleObstacle[], bases: readonly BattleBase[]): number {
  let safe = 0;
  for (let distance = 1; distance <= requested; distance += 1) {
    if (!positionClear(attacker, attacker.x + directionX * distance, attacker.y + directionY * distance, soldiers, obstacles, bases)) break;
    safe = distance;
  }
  return safe;
}
export function executeCavalryCharge(attacker: Soldier, soldiers: Soldier[], obstacles: readonly BattleObstacle[], bases: readonly BattleBase[],
  currentTime: number, random: RandomSource = Math.random,
  options: { reactive?: boolean; consumeCooldown?: boolean; isWave?: boolean } = {}): CavalryChargeEvent | null {
  const reactive = options.reactive ?? false; const consumeCooldown = options.consumeCooldown ?? !reactive; const isWave = options.isWave ?? false;
  if (consumeCooldown && !beginTechniqueAction(attacker, currentTime, random, true)) return null;
  if (!reactive && !isWave) {
    const primary = soldiers.filter((target) => isValidCombatTarget(attacker, target))
      .sort((a, b) => Math.hypot(a.x - attacker.x, a.y - attacker.y) - Math.hypot(b.x - attacker.x, b.y - attacker.y))[0];
    let dx = primary ? primary.x - attacker.x : attacker.facingX; let dy = primary ? primary.y - attacker.y : attacker.facingY;
    const length = Math.hypot(dx, dy) || 1; dx /= length; dy /= length;
    attacker.facingX = dx; attacker.facingY = dy;
    const full = getTechniqueSelfAdvanceWorld("CAVALRY_CHARGE");
    const edgeLimited = attacker.x + dx * full < SOLDIER_RADIUS || attacker.x + dx * full > BATTLEFIELD_CONFIG.width - SOLDIER_RADIUS
      || attacker.y + dy * full < SOLDIER_RADIUS || attacker.y + dy * full > BATTLEFIELD_CONFIG.height - SOLDIER_RADIUS;
    const requested = edgeLimited ? getTechniqueSelfAdvanceWorld("CAVALRY_CHARGE", true) : full;
    const safe = calculateSafeCavalryAdvance(attacker, dx, dy, requested, soldiers, obstacles, bases);
    attacker.x += dx * safe; attacker.y += dy * safe;
  }
  const center = getTechniqueAreaCenter("CAVALRY_CHARGE", attacker);
  const targets = soldiers.filter((target) => isValidCombatTarget(attacker, target)
    && target.state !== "REJOINING" && isPointInTechniqueRectangle("CAVALRY_CHARGE", center, target));
  const hitIds: string[] = [];
  for (const target of targets) {
    if (isDamageGuarded(target, "SPECIAL_ATTACK", random)) {
      target.combatFeedbackMarker = "S"; target.combatFeedbackUntil = currentTime + DEFENSE_CONFIG.guardMarkerDurationMs; continue;
    }
    const damage = calculateSuccessfulAttackDamage(attacker, target); applyDamage(target, damage);
    target.combatFeedbackMarker = "H"; target.combatFeedbackUntil = currentTime + DEFENSE_CONFIG.guardMarkerDurationMs; hitIds.push(target.id);
    if (target.isDead) continue;
    const directionY = getVerticalChargeDirection(attacker, target);
    const safe = calculateSafeCavalryKnockbackDistance(target, directionY, CAVALRY_CHARGE_KNOCKBACK, soldiers, obstacles, bases);
    startHitReaction(target, attacker, currentTime, safe, random, "SPECIAL_ATTACK"); target.knockbackDirectionX = 0; target.knockbackDirectionY = directionY;
  }
  return { kind: "CAVALRY", attackerId: attacker.id, team: attacker.team, x: attacker.x, y: attacker.y, targetIds: hitIds, reactive };
}
