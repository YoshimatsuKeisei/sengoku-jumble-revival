import { ARCHER_CONFIG, DEFENSE_CONFIG } from "../config";
import type { RandomSource } from "../stats/soldierStats";
import type { Soldier, Team, UnitTechnique } from "../types";
import { applyDamage } from "./combatSystem";
import { isValidCombatTarget } from "./combatTargetSystem";
import { isDamageGuarded } from "./defenseSystem";
import { calculateSuccessfulAttackDamage, hasSpecialAbility } from "./specialAbilitySystem";
import { hasRareAbility, totalDamageComponents, type DamageComponents } from "./damageComponentSystem";
import { beginTechniqueAction } from "./combatGaugeSystem";
import { getRangedHoldMarginWorld, getTechniqueRangeWorld, isWithinNormalContact } from "./techniqueCombatProfiles";
import {
  findRawAiRangedTarget,
  getRawExplosionGridVictims,
  startRawRangedTargetResponse,
} from "./rawRangedAttackSystem";

export interface ArrowProjectileRuntime {
  shooterId: string; targetId: string; team: Team;
  technique: "ARCHER_ARROW" | "ARCHER_LONG_SHOT" | "ARCHER_FIRE_ARROW" | "ARCHER_HOROKU";
  startX: number; startY: number; x: number; y: number;
  impactX: number; impactY: number;
  elapsedMs: number; durationMs: number;
  defended: boolean;
  flameVictimIds: string[];
  brownSmokeVictimIds: string[];
}
export interface ArrowLaunchEvent { kind: "ARROW"; projectile: ArrowProjectileRuntime }
export interface ArrowImpactEvent { kind: "ARROW_IMPACT"; x: number; y: number; defended: boolean; targetId: string;
  flameVictimIds: string[]; brownSmokeVictimIds: string[] }
export const ARROW_DAMAGE_COMPONENTS = { DIRECT_ARROW: ARCHER_CONFIG.damage } as const;
export const FIRE_ARROW_PRIMARY_COMPONENTS = { DIRECT_ARROW: 1, FIRE: 1 } as const;
/** @deprecated Raw ac15 has no splash loop. */
export const FIRE_ARROW_SPLASH_COMPONENTS = { FIRE: 1 } as const;
// Raw ac16 applies one primary explosion, then a 3x3 explosion pass that normally
// includes the primary cell, before the ordinary direct arrow defense check.
export const HOROKU_PRIMARY_COMPONENTS = { DIRECT_ARROW: 1, EXPLOSION: 2 } as const;
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
export function findArrowTarget(attacker: Soldier, soldiers: readonly Soldier[], allowUnlatchedScan = true): Soldier | null {
  const range = getArrowRange(attacker.technique); if (range === null) return null;
  if (attacker.controller === "ai") return findRawAiRangedTarget(attacker, soldiers, range, allowUnlatchedScan);
  const candidates = soldiers.filter((target) => isValidCombatTarget(attacker, target) && target.state !== "REJOINING"
    && Math.hypot(target.x - attacker.x, target.y - attacker.y) < range);
  return candidates.find((target) => target.id === attacker.targetId)
    ?? candidates.sort((a, b) => Math.hypot(a.x - attacker.x, a.y - attacker.y)
      - Math.hypot(b.x - attacker.x, b.y - attacker.y) || a.id.localeCompare(b.id))[0] ?? null;
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

export function executeArrowAttack(attacker: Soldier, target: Soldier, currentTime: number,
  random: RandomSource = Math.random, consumeCooldown = true, soldiers: readonly Soldier[] = [target]): ArrowLaunchEvent | null {
  const range = getArrowRange(attacker.technique);
  if (!isArrowTechnique(attacker.technique) || range === null || !isValidCombatTarget(attacker, target)
    || target.state === "REJOINING" || Math.hypot(target.x - attacker.x, target.y - attacker.y) >= range) return null;
  if (consumeCooldown && !beginTechniqueAction(attacker, currentTime, random, true)) return null;

  const dx = target.x - attacker.x; const dy = target.y - attacker.y; const distance = Math.hypot(dx, dy);
  const length = distance || 1; attacker.aimX = dx / length; attacker.aimY = dy / length;
  attacker.facingX = attacker.aimX; attacker.facingY = attacker.aimY;
  const startX = attacker.x + attacker.facingX * 13; const startY = attacker.y + attacker.facingY * 13;
  const impactX = target.x; const impactY = target.y;
  const flameVictimIds: string[] = [];
  const brownSmokeVictims = new Set<string>();

  // Direct atck() resolves gameplay synchronously. The child projectile is only
  // visual; it does not defer defense/damage and does not home into future target positions.
  if (attacker.technique === "ARCHER_FIRE_ARROW" && !hasRareAbility(target, "KATON")) {
    if (applyDamage(target, 1, attacker).appliedDamage > 0) flameVictimIds.push(target.id);
  } else if (attacker.technique === "ARCHER_HOROKU" && !hasRareAbility(target, "KATON")) {
    if (applyDamage(target, 1, attacker).appliedDamage > 0) brownSmokeVictims.add(target.id);
    for (const victim of getRawExplosionGridVictims(attacker, target, soldiers)) {
      if (applyDamage(victim, 1, attacker).appliedDamage > 0) brownSmokeVictims.add(victim.id);
    }
  }

  const defended = isDamageGuarded(target, "ARROW_ATTACK", random, attacker);
  if (!defended) {
    applyDamage(target, calculateSuccessfulAttackDamage(attacker, target, ARCHER_CONFIG.damage), attacker);
  }
  target.combatFeedbackMarker = defended ? "S" : "H";
  target.combatFeedbackUntil = currentTime + DEFENSE_CONFIG.guardMarkerDurationMs;
  startRawRangedTargetResponse(target, attacker, currentTime, random, "ARROW_ATTACK");

  return { kind: "ARROW", projectile: { shooterId: attacker.id, targetId: target.id, team: attacker.team,
    technique: attacker.technique, startX, startY, x: startX, y: startY, impactX, impactY,
    elapsedMs: 0, durationMs: Math.max(1, distance / ARCHER_CONFIG.projectileSpeedPxPerSecond * 1000),
    defended, flameVictimIds, brownSmokeVictimIds: [...brownSmokeVictims] } };
}

/** Visual-only projectile update. Gameplay was already committed by executeArrowAttack(). */
export function updateArrowProjectile(projectile: ArrowProjectileRuntime, _soldiers: Soldier[], deltaMs: number,
  _currentTime: number, _random: RandomSource = Math.random): { active: boolean; impact: ArrowImpactEvent | null } {
  projectile.elapsedMs += Math.max(0, deltaMs);
  const progress = Math.min(1, projectile.elapsedMs / projectile.durationMs);
  projectile.x = projectile.startX + (projectile.impactX - projectile.startX) * progress;
  projectile.y = projectile.startY + (projectile.impactY - projectile.startY) * progress;
  if (progress < 1) return { active: true, impact: null };
  return { active: false, impact: { kind: "ARROW_IMPACT", x: projectile.impactX, y: projectile.impactY,
    defended: projectile.defended, targetId: projectile.targetId,
    flameVictimIds: [...projectile.flameVictimIds], brownSmokeVictimIds: [...projectile.brownSmokeVictimIds] } };
}

// Keep this export exercised by older callers/tests that summarize component totals.
export function totalArrowPrimaryDamage(attacker: Pick<Soldier, "technique" | "specialAbilities">): number {
  return totalDamageComponents(getArrowPrimaryComponents(attacker));
}
