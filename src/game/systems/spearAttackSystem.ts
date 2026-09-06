import { ASHIGARU_CONFIG, BATTLEFIELD_CONFIG, DEFENSE_CONFIG, SOLDIER_RADIUS, SPECIAL_ATTACK_CONFIG } from "../config";
import type { RandomSource } from "../stats/soldierStats";
import type { BattleBase, BattleObstacle, Soldier, Team, UnitTechnique } from "../types";
import { getBaseRect } from "./battlefieldGeometry";
import { applyDamage } from "./combatSystem";
import { isValidCombatTarget } from "./combatTargetSystem";
import { isDamageGuarded } from "./defenseSystem";
import { startHitReaction } from "./reactionSystem";
import { calculateSuccessfulAttackDamage } from "./specialAbilitySystem";
import { beginTechniqueAction } from "./combatGaugeSystem";
import { getTechniqueAreaCenter, getTechniqueAreaWorld, getTechniqueSelfAdvanceWorld, isPointInTechniqueRectangle } from "./techniqueCombatProfiles";

export const SPEAR_STRIKE_REACH = ASHIGARU_CONFIG.spearStrikeReach;
export const SPEAR_STRIKE_HALF_WIDTH = ASHIGARU_CONFIG.spearStrikeHalfWidth;
export const SPEAR_STRIKE_KNOCKBACK = SPECIAL_ATTACK_CONFIG.knockbackDistance * ASHIGARU_CONFIG.spearStrikeKnockbackRatio;
export const SPEAR_TECHNIQUE_RADIUS = getTechniqueAreaWorld("ASHIGARU_SPEAR_TECHNIQUE").width / 2;
export const SPEAR_TECHNIQUE_KNOCKBACK = SPECIAL_ATTACK_CONFIG.knockbackDistance;
export interface SpearAttackEvent { kind: "SPEAR"; attackerId: string; team: Team; x: number; y: number;
  technique: "ASHIGARU_SPEAR_STRIKE" | "ASHIGARU_SPEAR_TECHNIQUE"; facingX: number; facingY: number; targetIds: string[] }

export function isSpearTechnique(technique: UnitTechnique): technique is SpearAttackEvent["technique"] {
  return technique === "ASHIGARU_SPEAR_STRIKE" || technique === "ASHIGARU_SPEAR_TECHNIQUE";
}
function normalizedFacing(attacker: Soldier): { x: number; y: number } {
  const length = Math.hypot(attacker.facingX, attacker.facingY);
  return length > 0 ? { x: attacker.facingX / length, y: attacker.facingY / length }
    : { x: attacker.team === "player" ? 1 : -1, y: 0 };
}
export function isInsideSpearStrike(attacker: Soldier, target: Soldier): boolean {
  return isPointInTechniqueRectangle("ASHIGARU_SPEAR_STRIKE", getTechniqueAreaCenter("ASHIGARU_SPEAR_STRIKE", attacker), target);
}
export function findSpearStrikeTargets(attacker: Soldier, soldiers: readonly Soldier[]): Soldier[] {
  return soldiers.filter((target) => isValidCombatTarget(attacker, target) && target.state !== "REJOINING" && isInsideSpearStrike(attacker, target));
}
export function findSpearTechniqueTargets(attacker: Soldier, soldiers: readonly Soldier[]): Soldier[] {
  return soldiers.filter((target) => isValidCombatTarget(attacker, target) && target.state !== "REJOINING"
    && isPointInTechniqueRectangle("ASHIGARU_SPEAR_TECHNIQUE", getTechniqueAreaCenter("ASHIGARU_SPEAR_TECHNIQUE", attacker), target));
}
function positionClear(target: Soldier, x: number, y: number, soldiers: readonly Soldier[], obstacles: readonly BattleObstacle[], bases: readonly BattleBase[]): boolean {
  if (x < SOLDIER_RADIUS || x > BATTLEFIELD_CONFIG.width - SOLDIER_RADIUS || y < SOLDIER_RADIUS || y > BATTLEFIELD_CONFIG.height - SOLDIER_RADIUS) return false;
  if (obstacles.some((o) => { const nx = Math.max(o.x, Math.min(x, o.x + o.width)); const ny = Math.max(o.y, Math.min(y, o.y + o.height)); return Math.hypot(x - nx, y - ny) < SOLDIER_RADIUS; })) return false;
  if (bases.some((base) => { const r = getBaseRect(base); return x >= r.x - SOLDIER_RADIUS && x <= r.x + r.width + SOLDIER_RADIUS && y >= r.y - SOLDIER_RADIUS && y <= r.y + r.height + SOLDIER_RADIUS; })) return false;
  return soldiers.every((other) => other === target || other.isDead || Math.hypot(x - other.x, y - other.y) >= SOLDIER_RADIUS * 2);
}
export function calculateSafeSpearKnockbackDistance(target: Soldier, directionX: number, directionY: number, requested: number,
  soldiers: readonly Soldier[], obstacles: readonly BattleObstacle[] = [], bases: readonly BattleBase[] = []): number {
  let safe = 0; for (let distance = 1; distance <= requested; distance += 1) {
    if (!positionClear(target, target.x + directionX * distance, target.y + directionY * distance, soldiers, obstacles, bases)) break;
    safe = distance;
  } return safe;
}
function aimAtPreferredTarget(attacker: Soldier, soldiers: readonly Soldier[], radius: number): void {
  const candidates = soldiers.filter((target) => isValidCombatTarget(attacker, target) && target.state !== "REJOINING"
    && Math.hypot(target.x - attacker.x, target.y - attacker.y) <= radius);
  const target = candidates.find((candidate) => candidate.id === attacker.targetId)
    ?? candidates.sort((a, b) => Math.hypot(a.x - attacker.x, a.y - attacker.y) - Math.hypot(b.x - attacker.x, b.y - attacker.y))[0];
  if (!target) return; const dx = target.x - attacker.x; const dy = target.y - attacker.y; const length = Math.hypot(dx, dy) || 1;
  attacker.facingX = dx / length; attacker.facingY = dy / length; attacker.aimX = attacker.facingX; attacker.aimY = attacker.facingY;
}
export function executeSpearAttack(attacker: Soldier, soldiers: Soldier[], obstacles: readonly BattleObstacle[], bases: readonly BattleBase[],
  currentTime: number, random: RandomSource = Math.random, consumeCooldown = true, isWave = false): SpearAttackEvent | null {
  if (!isSpearTechnique(attacker.technique)) return null;
  if (consumeCooldown && !beginTechniqueAction(attacker, currentTime, random, true)) return null;
  if (!isWave) {
    aimAtPreferredTarget(attacker, soldiers, Number.POSITIVE_INFINITY);
    const facing = normalizedFacing(attacker);
    const requested = getTechniqueSelfAdvanceWorld(attacker.technique);
    const safe = calculateSafeSpearKnockbackDistance(attacker, facing.x, facing.y, requested, soldiers, obstacles, bases);
    attacker.x += facing.x * safe; attacker.y += facing.y * safe;
  }
  const targets = attacker.technique === "ASHIGARU_SPEAR_STRIKE" ? findSpearStrikeTargets(attacker, soldiers) : findSpearTechniqueTargets(attacker, soldiers);
  const facing = normalizedFacing(attacker); const hitIds: string[] = [];
  for (const target of targets) {
    if (isDamageGuarded(target, "SPECIAL_ATTACK", random)) {
      target.combatFeedbackMarker = "S"; target.combatFeedbackUntil = currentTime + DEFENSE_CONFIG.guardMarkerDurationMs; continue;
    }
    const damage = calculateSuccessfulAttackDamage(attacker, target); applyDamage(target, damage);
    target.combatFeedbackMarker = "H"; target.combatFeedbackUntil = currentTime + DEFENSE_CONFIG.guardMarkerDurationMs; hitIds.push(target.id);
    if (target.isDead) continue;
    let dx = facing.x; let dy = facing.y;
    if (attacker.technique === "ASHIGARU_SPEAR_TECHNIQUE") {
      dx = target.x - attacker.x; dy = target.y - attacker.y; const length = Math.hypot(dx, dy) || 1; dx /= length; dy /= length;
    }
    const requested = attacker.technique === "ASHIGARU_SPEAR_STRIKE" ? SPEAR_STRIKE_KNOCKBACK : SPEAR_TECHNIQUE_KNOCKBACK;
    const safe = calculateSafeSpearKnockbackDistance(target, dx, dy, requested, soldiers, obstacles, bases);
    startHitReaction(target, attacker, currentTime, safe, random, "SPECIAL_ATTACK"); target.knockbackDirectionX = dx; target.knockbackDirectionY = dy;
  }
  return { kind: "SPEAR", attackerId: attacker.id, team: attacker.team, x: attacker.x, y: attacker.y,
    technique: attacker.technique, facingX: facing.x, facingY: facing.y, targetIds: hitIds };
}
