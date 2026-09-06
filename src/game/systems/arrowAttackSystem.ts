import { ARCHER_CONFIG, DEFENSE_CONFIG } from "../config";
import type { RandomSource } from "../stats/soldierStats";
import type { Soldier, Team, UnitTechnique } from "../types";
import { applyDamage } from "./combatSystem";
import { isValidCombatTarget } from "./combatTargetSystem";
import { isDamageGuarded } from "./defenseSystem";
import { startHitReaction } from "./reactionSystem";
import { calculateSuccessfulAttackDamage, hasSpecialAbility } from "./specialAbilitySystem";
import { applyRareDamageImmunity, totalDamageComponents, type DamageComponents } from "./damageComponentSystem";
import { beginTechniqueAction } from "./combatGaugeSystem";
import { getRangedHoldMarginWorld, getTechniqueRangeWorld, isPointInTechniqueRectangle, isWithinNormalContact } from "./techniqueCombatProfiles";

export interface ArrowProjectileRuntime {
  shooterId: string; targetId: string; team: Team;
  technique: "ARCHER_ARROW" | "ARCHER_LONG_SHOT" | "ARCHER_FIRE_ARROW" | "ARCHER_HOROKU";
  startX: number; startY: number; x: number; y: number;
  elapsedMs: number; durationMs: number;
}
export interface ArrowLaunchEvent { kind: "ARROW"; projectile: ArrowProjectileRuntime }
export interface ArrowImpactEvent { kind: "ARROW_IMPACT"; x: number; y: number; defended: boolean; targetId: string;
  flameVictimIds: string[]; brownSmokeVictimIds: string[] }
export const ARROW_DAMAGE_COMPONENTS = { DIRECT_ARROW: ARCHER_CONFIG.damage } as const;
export const FIRE_ARROW_PRIMARY_COMPONENTS = { DIRECT_ARROW: 1, FIRE: 1 } as const;
export const FIRE_ARROW_SPLASH_COMPONENTS = { FIRE: 1 } as const;
export const HOROKU_PRIMARY_COMPONENTS = { DIRECT_ARROW: 1, FIRE: 1, EXPLOSION: 1 } as const;
export const HOROKU_SPLASH_COMPONENTS = { EXPLOSION: 1 } as const;

export function isArrowTechnique(technique: UnitTechnique): technique is ArrowProjectileRuntime["technique"] {
  return technique === "ARCHER_ARROW" || technique === "ARCHER_LONG_SHOT"
    || technique === "ARCHER_FIRE_ARROW" || technique === "ARCHER_HOROKU";
}
export function getArrowRange(technique: UnitTechnique): number | null {
  return isArrowTechnique(technique) ? getTechniqueRangeWorld(technique) : null;
}
export function calculateArrowDamage(attacker: Pick<Soldier, "specialAbilities">): number {
  return ARCHER_CONFIG.damage + Number(hasSpecialAbility(attacker, "MIGHT"));
}
export type ArrowMovementDecision = "ADVANCE_TO_RANGE" | "HOLD_IN_RANGE" | "NORMAL_COMBAT";
export function getArrowMovementDecision(attacker: Soldier, target: Soldier): ArrowMovementDecision {
  const range = getArrowRange(attacker.technique);
  if (range === null) return "NORMAL_COMBAT";
  const distance = Math.hypot(target.x - attacker.x, target.y - attacker.y);
  if (isWithinNormalContact(attacker, target)) return "NORMAL_COMBAT";
  return distance < range - getRangedHoldMarginWorld() ? "HOLD_IN_RANGE" : "ADVANCE_TO_RANGE";
}
export function findArrowTarget(attacker: Soldier, soldiers: readonly Soldier[]): Soldier | null {
  const range = getArrowRange(attacker.technique); if (range === null) return null;
  const candidates = soldiers.filter((target) => isValidCombatTarget(attacker, target) && target.state !== "REJOINING"
    && Math.hypot(target.x - attacker.x, target.y - attacker.y) < range);
  return candidates.find((target) => target.id === attacker.targetId)
    ?? candidates.sort((a, b) => Math.hypot(a.x - attacker.x, a.y - attacker.y)
      - Math.hypot(b.x - attacker.x, b.y - attacker.y) || a.id.localeCompare(b.id))[0] ?? null;
}
export function executeArrowAttack(attacker: Soldier, target: Soldier, currentTime: number,
  random: RandomSource = Math.random, consumeCooldown = true): ArrowLaunchEvent | null {
  const range = getArrowRange(attacker.technique);
  if (!isArrowTechnique(attacker.technique) || range === null || !isValidCombatTarget(attacker, target)
    || target.state === "REJOINING" || Math.hypot(target.x - attacker.x, target.y - attacker.y) >= range) return null;
  if (consumeCooldown && !beginTechniqueAction(attacker, currentTime, random, true)) return null;
  const dx = target.x - attacker.x; const dy = target.y - attacker.y; const distance = Math.hypot(dx, dy);
  const length = distance || 1; attacker.aimX = dx / length; attacker.aimY = dy / length;
  attacker.facingX = attacker.aimX; attacker.facingY = attacker.aimY;
  const startX = attacker.x + attacker.facingX * 13; const startY = attacker.y + attacker.facingY * 13;
  return { kind: "ARROW", projectile: { shooterId: attacker.id, targetId: target.id, team: attacker.team,
    technique: attacker.technique, startX, startY, x: startX, y: startY, elapsedMs: 0,
    durationMs: Math.max(1, distance / ARCHER_CONFIG.projectileSpeedPxPerSecond * 1000) } };
}
export function resolveArrowDefense(target: Soldier, random: RandomSource = Math.random): "HIT" | "DEFENDED" {
  return isDamageGuarded(target, "ARROW_ATTACK", random) ? "DEFENDED" : "HIT";
}
export function getArrowPrimaryComponents(attacker: Pick<Soldier, "technique" | "specialAbilities">): DamageComponents {
  const direct = 1 + Number(hasSpecialAbility(attacker, "MIGHT"));
  if (attacker.technique === "ARCHER_FIRE_ARROW") return { ...FIRE_ARROW_PRIMARY_COMPONENTS, DIRECT_ARROW: direct };
  if (attacker.technique === "ARCHER_HOROKU") return { ...HOROKU_PRIMARY_COMPONENTS, DIRECT_ARROW: direct };
  return { DIRECT_ARROW: direct };
}
export function getArrowSplashComponents(technique: UnitTechnique): DamageComponents | null {
  return technique === "ARCHER_HOROKU" ? HOROKU_SPLASH_COMPONENTS : null;
}
function damageVictim(victim: Soldier, attacker: Soldier, components: DamageComponents, currentTime: number,
  showMarker: boolean, random: RandomSource): { damage: number; fire: boolean; explosion: boolean } {
  const adjusted = { ...components };
  if ((adjusted.DIRECT_ARROW ?? 0) > 0) {
    const basicDirect = Math.max(1, adjusted.DIRECT_ARROW! - Number(hasSpecialAbility(attacker, "MIGHT")));
    adjusted.DIRECT_ARROW = calculateSuccessfulAttackDamage(attacker, victim, basicDirect);
  }
  const remaining = applyRareDamageImmunity(victim, adjusted); const damage = totalDamageComponents(remaining);
  if (damage <= 0) return { damage: 0, fire: false, explosion: false };
  applyDamage(victim, damage);
  if (showMarker) { victim.combatFeedbackMarker = "H"; victim.combatFeedbackUntil = currentTime + DEFENSE_CONFIG.guardMarkerDurationMs; }
  if (!victim.isDead) startHitReaction(victim, attacker, currentTime, 0, random, "ARROW_ATTACK");
  return { damage, fire: (remaining.FIRE ?? 0) > 0, explosion: (remaining.EXPLOSION ?? 0) > 0 };
}
export function updateArrowProjectile(projectile: ArrowProjectileRuntime, soldiers: Soldier[], deltaMs: number,
  currentTime: number, random: RandomSource = Math.random): { active: boolean; impact: ArrowImpactEvent | null } {
  const shooter = soldiers.find((soldier) => soldier.id === projectile.shooterId);
  const target = soldiers.find((soldier) => soldier.id === projectile.targetId);
  if (!shooter || !target || !isValidCombatTarget(shooter, target) || target.state === "REJOINING") return { active: false, impact: null };
  projectile.elapsedMs += Math.max(0, deltaMs);
  const progress = Math.min(1, projectile.elapsedMs / projectile.durationMs);
  projectile.x = projectile.startX + (target.x - projectile.startX) * progress;
  projectile.y = projectile.startY + (target.y - projectile.startY) * progress;
  if (progress < 1) return { active: true, impact: null };
  const defended = isDamageGuarded(target, "ARROW_ATTACK", random, shooter);
  const flameVictimIds: string[] = []; const brownSmokeVictimIds: string[] = [];
  if (defended) {
    target.combatFeedbackMarker = "S"; target.combatFeedbackUntil = currentTime + DEFENSE_CONFIG.guardMarkerDurationMs;
  } else {
    const primary = damageVictim(target, shooter, getArrowPrimaryComponents(shooter), currentTime, true, random);
    if (primary.fire && projectile.technique === "ARCHER_FIRE_ARROW") flameVictimIds.push(target.id);
    if ((primary.fire || primary.explosion) && projectile.technique === "ARCHER_HOROKU") brownSmokeVictimIds.push(target.id);
    const splashComponents = getArrowSplashComponents(projectile.technique);
    if (splashComponents) for (const splash of soldiers) {
      if (splash === target || !isValidCombatTarget(shooter, splash) || splash.state === "REJOINING"
        || !isPointInTechniqueRectangle(projectile.technique, target, splash)) continue;
      if (isDamageGuarded(splash, "ARROW_ATTACK", random, shooter)) continue;
      const result = damageVictim(splash, shooter, splashComponents, currentTime, true, random);
      if (result.fire && projectile.technique === "ARCHER_FIRE_ARROW") flameVictimIds.push(splash.id);
      if (result.explosion && projectile.technique === "ARCHER_HOROKU") brownSmokeVictimIds.push(splash.id);
    }
  }
  return { active: false, impact: { kind: "ARROW_IMPACT", x: target.x, y: target.y, defended, targetId: target.id,
    flameVictimIds, brownSmokeVictimIds } };
}
