import { ASHIGARU_CONFIG, BATTLEFIELD_CONFIG, SOLDIER_RADIUS, SPECIAL_ATTACK_CONFIG } from "../config";
import type { RandomSource } from "../stats/soldierStats";
import type { BattleBase, BattleObstacle, Soldier, Team, UnitTechnique } from "../types";
import { getBaseRect } from "./battlefieldGeometry";
import { isValidCombatTarget } from "./combatTargetSystem";
import { beginTechniqueAction } from "./combatGaugeSystem";
import { getTechniqueAreaCenter, getTechniqueAreaWorld, getTechniqueSelfAdvanceWorld, isPointInTechniqueRectangle } from "./techniqueCombatProfiles";
import {
  findRawSpearStrikeTargets,
  findRawSpecialGridTargets,
  resolveRawSpecialAtck,
  startRawSpecialSelfMotion,
} from "./rawSpecialTechniqueSystem";

export const SPEAR_STRIKE_REACH = ASHIGARU_CONFIG.spearStrikeReach;
export const SPEAR_STRIKE_HALF_WIDTH = ASHIGARU_CONFIG.spearStrikeHalfWidth;
/** @deprecated Raw sgk()/atck(ss=1) uses the common 10-unit response. */
export const SPEAR_STRIKE_KNOCKBACK = SPECIAL_ATTACK_CONFIG.knockbackDistance * ASHIGARU_CONFIG.spearStrikeKnockbackRatio;
export const SPEAR_TECHNIQUE_RADIUS = getTechniqueAreaWorld("ASHIGARU_SPEAR_TECHNIQUE").width / 2;
/** @deprecated Raw bsl()/atck(ss=1) uses the common 10-unit response. */
export const SPEAR_TECHNIQUE_KNOCKBACK = SPECIAL_ATTACK_CONFIG.knockbackDistance;
export interface SpearAttackEvent { kind: "SPEAR"; attackerId: string; team: Team; x: number; y: number;
  technique: "ASHIGARU_SPEAR_STRIKE" | "ASHIGARU_SPEAR_TECHNIQUE"; facingX: number; facingY: number; targetIds: string[]; isWave: boolean }

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
/** Legacy geometry helper retained for UI/debug callers; gameplay uses raw sgk f[][] selection. */
export function findSpearStrikeTargets(attacker: Soldier, soldiers: readonly Soldier[]): Soldier[] {
  return soldiers.filter((target) => isValidCombatTarget(attacker, target) && target.state !== "REJOINING" && isInsideSpearStrike(attacker, target));
}
/** Legacy area helper retained for compatibility; gameplay uses raw predicted 3x3 bsl scan. */
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
function aimAtPreferredTarget(attacker: Soldier, soldiers: readonly Soldier[]): void {
  const candidates = soldiers.filter((target) => isValidCombatTarget(attacker, target) && target.state !== "REJOINING");
  const target = candidates.find((candidate) => candidate.id === attacker.targetId)
    ?? candidates.sort((a, b) => Math.hypot(a.x - attacker.x, a.y - attacker.y) - Math.hypot(b.x - attacker.x, b.y - attacker.y))[0];
  if (!target) return; const dx = target.x - attacker.x; const dy = target.y - attacker.y; const length = Math.hypot(dx, dy) || 1;
  attacker.facingX = dx / length; attacker.facingY = dy / length; attacker.aimX = attacker.facingX; attacker.aimY = attacker.facingY;
}
export function executeSpearAttack(attacker: Soldier, soldiers: Soldier[], _obstacles: readonly BattleObstacle[], _bases: readonly BattleBase[],
  currentTime: number, random: RandomSource = Math.random, consumeCooldown = true, isWave = false): SpearAttackEvent | null {
  if (!isSpearTechnique(attacker.technique)) return null;
  if (consumeCooldown && !beginTechniqueAction(attacker, currentTime, random, true)) return null;

  if (!isWave) {
    aimAtPreferredTarget(attacker, soldiers);
    const initialUnits = attacker.technique === "ASHIGARU_SPEAR_STRIKE" ? 14 : 20;
    const kTicks = attacker.technique === "ASHIGARU_SPEAR_STRIKE" ? 10 : 16;
    startRawSpecialSelfMotion(attacker, currentTime, initialUnits, kTicks);
    const facing = normalizedFacing(attacker);
    return { kind: "SPEAR", attackerId: attacker.id, team: attacker.team, x: attacker.x, y: attacker.y,
      technique: attacker.technique, facingX: facing.x, facingY: facing.y, targetIds: [], isWave: false };
  }

  const targets = attacker.technique === "ASHIGARU_SPEAR_STRIKE"
    ? findRawSpearStrikeTargets(attacker, soldiers)
    : findRawSpecialGridTargets(attacker, soldiers, 3, 95);
  const hitIds: string[] = [];
  for (const target of targets) {
    const result = resolveRawSpecialAtck(attacker, target, currentTime, random);
    if (!result.defended) hitIds.push(target.id);
  }
  const facing = normalizedFacing(attacker);
  return { kind: "SPEAR", attackerId: attacker.id, team: attacker.team, x: attacker.x, y: attacker.y,
    technique: attacker.technique, facingX: facing.x, facingY: facing.y, targetIds: hitIds, isWave: true };
}
