import { DEFENSE_CONFIG, GUN_CONFIG } from "../config";
import type { RandomSource } from "../stats/soldierStats";
import type { DamageComponentKind, Soldier, Team, UnitTechnique } from "../types";
import { applyDamage } from "./combatSystem";
import { isDamageGuarded } from "./defenseSystem";
import { calculateSuccessfulAttackDamage, hasSpecialAbility } from "./specialAbilitySystem";
import { isValidCombatTarget } from "./combatTargetSystem";
import { hasRareAbility } from "./damageComponentSystem";
import { beginTechniqueAction } from "./combatGaugeSystem";
import { getRangedHoldMarginWorld, getTechniqueRangeWorld, isWithinNormalContact } from "./techniqueCombatProfiles";
import {
  findRawAiRangedTarget,
  getRawExplosionGridVictims,
  startRawRangedTargetResponse,
} from "./rawRangedAttackSystem";

export interface GunAttackEvent {
  kind: "GUN"; attackerId: string; targetId: string; team: Team;
  x: number; y: number; shooterX: number; shooterY: number; targetX: number; targetY: number;
  smoke: true; shotLine: true; shooterFlash: true;
  bombardmentVictimIds: string[];
  primaryDefended: boolean;
  bombardmentSmokeDurationMs: number;
}
export function isGunTechnique(technique: UnitTechnique): boolean {
  return technique === "TEPPOU_SHOOTING" || technique === "TEPPOU_SNIPING" || technique === "TEPPOU_BOMBARDMENT";
}
export function getGunRange(technique: UnitTechnique): number | null {
  return isGunTechnique(technique) ? getTechniqueRangeWorld(technique) : null;
}
// Raw ac17: one pre-defense explosion on the primary, one 3x3-cell explosion
// pass (normally including the primary cell), then the ordinary direct shot.
export const BOMBARDMENT_DAMAGE_COMPONENTS: Readonly<Partial<Record<DamageComponentKind, number>>> = {
  DIRECT_SPECIAL: 1, EXPLOSION: 2,
};
export function calculateGunDirectDamage(attacker: Soldier): number {
  return GUN_CONFIG.damage + Number(hasSpecialAbility(attacker, "MIGHT"));
}
export function calculateBombardmentPrimaryDamage(attacker: Soldier): number {
  return 3 + Number(hasSpecialAbility(attacker, "MIGHT"));
}
export type GunMovementDecision = "ADVANCE_TO_RANGE" | "HOLD_IN_RANGE" | "NORMAL_COMBAT";
export function getGunMovementDecision(soldier: Soldier, target: Soldier): GunMovementDecision {
  const range = getGunRange(soldier.technique);
  if (range === null) return "NORMAL_COMBAT";
  const distance = Math.hypot(target.x - soldier.x, target.y - soldier.y);
  if (isWithinNormalContact(soldier, target)) return "NORMAL_COMBAT";
  return distance < range - getRangedHoldMarginWorld() ? "HOLD_IN_RANGE" : "ADVANCE_TO_RANGE";
}
export function aimGunAtTarget(attacker: Soldier, target: Soldier): { x: number; y: number } {
  const dx = target.x - attacker.x; const dy = target.y - attacker.y; const length = Math.hypot(dx, dy);
  const aim = length > 0 ? { x: dx / length, y: dy / length } : { x: attacker.facingX, y: attacker.facingY };
  attacker.aimX = aim.x; attacker.aimY = aim.y; attacker.facingX = aim.x; attacker.facingY = aim.y;
  return aim;
}
function activeEnemy(attacker: Soldier, target: Soldier): boolean {
  return isValidCombatTarget(attacker, target) && target.state !== "REJOINING";
}
export function findGunTarget(attacker: Soldier, soldiers: readonly Soldier[], allowUnlatchedScan = true): Soldier | null {
  const range = getGunRange(attacker.technique); if (range === null) return null;
  if (attacker.controller === "ai") return findRawAiRangedTarget(attacker, soldiers, range, allowUnlatchedScan);
  const candidates = soldiers.filter((target) => activeEnemy(attacker, target)
    && Math.hypot(target.x - attacker.x, target.y - attacker.y) < range);
  const sticky = candidates.find((target) => target.id === attacker.targetId);
  return sticky ?? candidates.sort((a, b) => Math.hypot(a.x - attacker.x, a.y - attacker.y)
    - Math.hypot(b.x - attacker.x, b.y - attacker.y) || a.id.localeCompare(b.id))[0] ?? null;
}
export function executeGunAttack(attacker: Soldier, target: Soldier, currentTime: number,
  random: RandomSource = Math.random, consumeCooldown = true, soldiers: readonly Soldier[] = [target]): GunAttackEvent | null {
  const range = getGunRange(attacker.technique);
  if (range === null || !activeEnemy(attacker, target) || Math.hypot(target.x - attacker.x, target.y - attacker.y) >= range) return null;
  if (consumeCooldown && !beginTechniqueAction(attacker, currentTime, random, true)) return null;

  const aim = aimGunAtTarget(attacker, target);
  const bombardment = attacker.technique === "TEPPOU_BOMBARDMENT";
  const explosionVictims = new Set<string>();

  // Direct AVM1 atck(): ac17 explosion damage happens before the ordinary
  // random*200 defense decision. The s33/KATON test is on the PRIMARY target
  // and skips this whole block; splash units do not receive their own s33 or
  // defense test inside the 3x3 loop.
  if (bombardment && !hasRareAbility(target, "KATON")) {
    if (applyDamage(target, 1, attacker).appliedDamage > 0) explosionVictims.add(target.id);
    for (const victim of getRawExplosionGridVictims(attacker, target, soldiers)) {
      if (applyDamage(victim, 1, attacker).appliedDamage > 0) explosionVictims.add(victim.id);
    }
  }

  const guarded = isDamageGuarded(target, "GUN_ATTACK", random, attacker);
  if (!guarded) {
    applyDamage(target, calculateSuccessfulAttackDamage(attacker, target, GUN_CONFIG.damage), attacker);
  }
  target.combatFeedbackMarker = guarded ? "S" : "H";
  target.combatFeedbackUntil = currentTime + DEFENSE_CONFIG.guardMarkerDurationMs;
  startRawRangedTargetResponse(target, attacker, currentTime, random, "GUN_ATTACK");

  const barrelLength = attacker.technique === "TEPPOU_SNIPING" ? 24 : attacker.technique === "TEPPOU_BOMBARDMENT" ? 19 : 16;
  return { kind: "GUN", attackerId: attacker.id, targetId: target.id, team: attacker.team,
    x: attacker.x + aim.x * barrelLength, y: attacker.y + aim.y * barrelLength,
    shooterX: attacker.x, shooterY: attacker.y, targetX: target.x, targetY: target.y,
    smoke: true, shotLine: true, shooterFlash: true,
    bombardmentVictimIds: bombardment ? [...explosionVictims] : [], primaryDefended: bombardment && guarded,
    bombardmentSmokeDurationMs: GUN_CONFIG.bombardmentVictimSmokeDurationMs };
}
