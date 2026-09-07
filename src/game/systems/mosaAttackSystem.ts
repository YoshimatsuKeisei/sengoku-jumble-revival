import { DEFENSE_CONFIG, MOSA_CONFIG } from "../config";
import type { RandomSource } from "../stats/soldierStats";
import type { BattleBase, BattleObstacle, Soldier, Team, UnitTechnique } from "../types";
import { applyDamage } from "./combatSystem";
import { isValidCombatTarget } from "./combatTargetSystem";
import { isDamageGuarded } from "./defenseSystem";
import { startHitReaction } from "./reactionSystem";
import { calculateSafeSpearKnockbackDistance } from "./spearAttackSystem";
import { calculateSuccessfulAttackDamage } from "./specialAbilitySystem";
import { beginTechniqueAction } from "./combatGaugeSystem";
import { getTechniqueAreaCenter, getTechniqueAreaWorld, getTechniqueSelfAdvanceWorld, isPointInTechniqueRectangle } from "./techniqueCombatProfiles";

export type MosaTechnique = "MOSA_SENPUU" | "MOSA_MUSOU" | "MOSA_KIJIN";
export interface MosaAttackEvent { kind: "MOSA"; attackerId: string; team: Team; technique: MosaTechnique;
  x: number; y: number; facingX: number; facingY: number; radius: number; hitIds: string[]; defendedIds: string[]; isWave: boolean }
export function isMosaTechnique(technique: UnitTechnique): technique is MosaTechnique {
  return technique === "MOSA_SENPUU" || technique === "MOSA_MUSOU" || technique === "MOSA_KIJIN";
}
export function getMosaRadius(technique: MosaTechnique): number {
  return getTechniqueAreaWorld(technique).width / 2;
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
  return isPointInTechniqueRectangle("MOSA_SENPUU", getTechniqueAreaCenter("MOSA_SENPUU", attacker), target);
}
export function findMosaTargets(attacker: Soldier, soldiers: readonly Soldier[]): Soldier[] {
  if (!isMosaTechnique(attacker.technique)) return [];
  return soldiers.filter((target) => isValidCombatTarget(attacker, target) && target.state !== "REJOINING"
    && isPointInTechniqueRectangle(attacker.technique, getTechniqueAreaCenter(attacker.technique, attacker), target));
}
export function executeMosaAttack(attacker: Soldier, soldiers: Soldier[], obstacles: readonly BattleObstacle[], bases: readonly BattleBase[],
  currentTime: number, random: RandomSource = Math.random, consumeCooldown = true, isWave = false): MosaAttackEvent | null {
  if (!isMosaTechnique(attacker.technique)) return null;
  if (consumeCooldown && !beginTechniqueAction(attacker, currentTime, random, true)) return null;
  if (!isWave) {
    const enemies = soldiers.filter((target) => isValidCombatTarget(attacker, target));
    const primary = enemies.find((target) => target.id === attacker.targetId) ?? enemies[0];
    if (primary) {
      const pdx = primary.x - attacker.x; const pdy = primary.y - attacker.y; const pl = Math.hypot(pdx, pdy) || 1;
      attacker.facingX = pdx / pl; attacker.facingY = pdy / pl; attacker.aimX = attacker.facingX; attacker.aimY = attacker.facingY;
    }
    const facing = normalizedFacing(attacker);
    const safe = calculateSafeSpearKnockbackDistance(attacker, facing.x, facing.y,
      getTechniqueSelfAdvanceWorld(attacker.technique), soldiers, obstacles, bases);
    attacker.x += facing.x * safe; attacker.y += facing.y * safe;
  }
  const targets = findMosaTargets(attacker, soldiers);
  const event: MosaAttackEvent = { kind: "MOSA", attackerId: attacker.id, team: attacker.team, technique: attacker.technique,
    x: attacker.x, y: attacker.y, facingX: attacker.facingX, facingY: attacker.facingY, radius: getMosaRadius(attacker.technique), hitIds: [], defendedIds: [], isWave };
  for (const target of targets) {
    if (isDamageGuarded(target, "SPECIAL_ATTACK", random)) {
      target.combatFeedbackMarker = "S"; target.combatFeedbackUntil = currentTime + DEFENSE_CONFIG.guardMarkerDurationMs;
      event.defendedIds.push(target.id); continue;
    }
    const damage = calculateSuccessfulAttackDamage(attacker, target); applyDamage(target, damage, attacker);
    target.combatFeedbackMarker = "H"; target.combatFeedbackUntil = currentTime + DEFENSE_CONFIG.guardMarkerDurationMs; event.hitIds.push(target.id);
    if (target.isDead) continue;
    let dx = target.x - attacker.x; let dy = target.y - attacker.y; const length = Math.hypot(dx, dy) || 1; dx /= length; dy /= length;
    const safe = calculateSafeSpearKnockbackDistance(target, dx, dy, getMosaKnockback(attacker.technique), soldiers, obstacles, bases);
    startHitReaction(target, attacker, currentTime, safe, random, "SPECIAL_ATTACK"); target.knockbackDirectionX = dx; target.knockbackDirectionY = dy;
  }
  return event;
}
