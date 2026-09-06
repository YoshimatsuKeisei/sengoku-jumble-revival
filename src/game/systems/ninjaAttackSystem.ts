import { BATTLEFIELD_CONFIG, DEFENSE_CONFIG, NINJA_CONFIG, SOLDIER_RADIUS } from "../config";
import type { RandomSource } from "../stats/soldierStats";
import type { BattleBase, BattleObstacle, Soldier, Team, UnitTechnique } from "../types";
import { getBaseRect } from "./battlefieldGeometry";
import { applyDamage } from "./combatSystem";
import { isValidCombatTarget } from "./combatTargetSystem";
import { applyConfusion } from "./confusionSystem";
import { clearConfusion } from "./confusionSystem";
import { issueNinjaBarrierCharge } from "./commandSystem";
import { isDamageGuarded } from "./defenseSystem";
import { startHitReaction } from "./reactionSystem";
import { calculateSuccessfulAttackDamage, hasSpecialAbility } from "./specialAbilitySystem";
import { beginTechniqueAction } from "./combatGaugeSystem";
import { getTechniqueAreaCenter, getTechniqueSelfAdvanceWorld, isPointInTechniqueRectangle } from "./techniqueCombatProfiles";

export type NinjaActivationSource = "NORMAL" | "WAVE" | "BARRIER_FORCED" | "GENERAL_FORCED";
export interface NinjaAttackEvent { kind: "NINJA"; attackerId: string; team: Team;
  technique: "NINJA_NINJUTSU" | "NINJA_SHADOW_RUN" | "NINJA_GENJUTSU" | "NINJA_BARRIER";
  fromX: number; fromY: number; x: number; y: number; facingX: number; facingY: number;
  victimIds: string[]; source: NinjaActivationSource; barrierActivated: boolean; forcedEvents: NinjaAttackEvent[]; healResults: Array<{ targetId: string; amount: number }> }

export function isNinjaTechnique(technique: UnitTechnique): technique is NinjaAttackEvent["technique"] {
  return technique === "NINJA_NINJUTSU" || technique === "NINJA_SHADOW_RUN"
    || technique === "NINJA_GENJUTSU" || technique === "NINJA_BARRIER";
}
export function getNinjaDashDistance(technique: UnitTechnique): number {
  return isNinjaTechnique(technique) ? getTechniqueSelfAdvanceWorld(technique) : 0;
}
export function getNinjaKnockback(technique: UnitTechnique): number {
  return technique === "NINJA_SHADOW_RUN" ? NINJA_CONFIG.shadowRunKnockback : NINJA_CONFIG.ninjutsuKnockback;
}
function activeTarget(attacker: Soldier, target: Soldier): boolean {
  return isValidCombatTarget(attacker, target) && target.state !== "REJOINING";
}
export function isInsideNinjaForwardSector(attacker: Soldier, target: Soldier): boolean {
  return isNinjaTechnique(attacker.technique)
    && isPointInTechniqueRectangle(attacker.technique, getTechniqueAreaCenter(attacker.technique, attacker), target);
}
export function findNinjaTargets(attacker: Soldier, soldiers: readonly Soldier[]): Soldier[] {
  return soldiers.filter((target) => activeTarget(attacker, target) && isInsideNinjaForwardSector(attacker, target));
}
function positionClear(subject: Soldier, x: number, y: number, soldiers: readonly Soldier[], obstacles: readonly BattleObstacle[], bases: readonly BattleBase[]): boolean {
  if (x < SOLDIER_RADIUS || x > BATTLEFIELD_CONFIG.width - SOLDIER_RADIUS || y < SOLDIER_RADIUS || y > BATTLEFIELD_CONFIG.height - SOLDIER_RADIUS) return false;
  if (obstacles.some((o) => { const nx = Math.max(o.x, Math.min(x, o.x + o.width)); const ny = Math.max(o.y, Math.min(y, o.y + o.height)); return Math.hypot(x - nx, y - ny) < SOLDIER_RADIUS; })) return false;
  if (bases.some((base) => { const r = getBaseRect(base); return x >= r.x - SOLDIER_RADIUS && x <= r.x + r.width + SOLDIER_RADIUS && y >= r.y - SOLDIER_RADIUS && y <= r.y + r.height + SOLDIER_RADIUS; })) return false;
  return soldiers.every((other) => other === subject || other.isDead || Math.hypot(x - other.x, y - other.y) >= SOLDIER_RADIUS * 1.5);
}
export function calculateSafeNinjaMovement(subject: Soldier, dx: number, dy: number, requested: number,
  soldiers: readonly Soldier[], obstacles: readonly BattleObstacle[] = [], bases: readonly BattleBase[] = []): number {
  let safe = 0; for (let distance = 1; distance <= requested; distance += 1) {
    if (!positionClear(subject, subject.x + dx * distance, subject.y + dy * distance, soldiers, obstacles, bases)) break; safe = distance;
  } return safe;
}
export function updateNinjaDashes(soldiers: Soldier[], currentTime: number): void {
  for (const soldier of soldiers) {
    if (soldier.ninjaDashStartedAt === null) continue;
    const duration = Math.max(1, soldier.ninjaDashUntil - soldier.ninjaDashStartedAt);
    const progress = Math.max(0, Math.min(1, (currentTime - soldier.ninjaDashStartedAt) / duration));
    soldier.x = soldier.ninjaDashStartX + (soldier.ninjaDashTargetX - soldier.ninjaDashStartX) * progress;
    soldier.y = soldier.ninjaDashStartY + (soldier.ninjaDashTargetY - soldier.ninjaDashStartY) * progress;
    if (progress >= 1) soldier.ninjaDashStartedAt = null;
  }
}
function primaryTarget(attacker: Soldier, soldiers: readonly Soldier[]): Soldier | null {
  const candidates = soldiers.filter((target) => activeTarget(attacker, target));
  return candidates.find((target) => target.id === attacker.targetId)
    ?? candidates.sort((a, b) => Math.hypot(a.x - attacker.x, a.y - attacker.y) - Math.hypot(b.x - attacker.x, b.y - attacker.y))[0] ?? null;
}
function applyBarrierSupport(attacker: Soldier, soldiers: Soldier[], obstacles: readonly BattleObstacle[], bases: readonly BattleBase[],
  currentTime: number, random: RandomSource, centerX: number, centerY: number): { forcedEvents: NinjaAttackEvent[]; healResults: Array<{ targetId: string; amount: number }> } {
  const forcedEvents: NinjaAttackEvent[] = []; const healResults: Array<{ targetId: string; amount: number }> = [];
  const allies = soldiers.filter((target) => target !== attacker && target.team === attacker.team
    && !target.isDead && target.hp > 0 && target.state !== "HEALING"
    && isPointInTechniqueRectangle("GENERAL_COMMAND", { x: centerX, y: centerY }, target));
  if (random() < 0.85) {
    for (const ally of allies) {
      if (ally.hp >= ally.maxHp) continue;
      const requested = 1 + Number(hasSpecialAbility(ally, "RECOVERY_BOOST"));
      const healed = Math.min(requested, ally.maxHp - ally.hp); ally.hp += healed;
      if (healed > 0) healResults.push({ targetId: ally.id, amount: healed });
    }
    if (random() < 0.65 && attacker.hp < attacker.maxHp) {
      const requested = 1 + Number(hasSpecialAbility(attacker, "RECOVERY_BOOST"));
      const healed = Math.min(requested, attacker.maxHp - attacker.hp); attacker.hp += healed;
      if (healed > 0) healResults.push({ targetId: attacker.id, amount: healed });
    }
  } else {
    for (const ally of allies.filter((candidate) => candidate.unitType === "NINJA")) {
      clearConfusion(ally, "BARRIER_COMMAND");
      issueNinjaBarrierCharge(ally, attacker, currentTime);
    }
  }
  return { forcedEvents, healResults };
}
export function executeNinjaAttack(attacker: Soldier, soldiers: Soldier[], obstacles: readonly BattleObstacle[], bases: readonly BattleBase[],
  currentTime: number, random: RandomSource = Math.random, source: NinjaActivationSource = "NORMAL"): NinjaAttackEvent | null {
  if (!isNinjaTechnique(attacker.technique)) return null;
  if (source === "NORMAL" && !beginTechniqueAction(attacker, currentTime, random, true)) return null;
  const primary = primaryTarget(attacker, soldiers);
  const dx = primary ? primary.x - attacker.x : attacker.facingX; const dy = primary ? primary.y - attacker.y : attacker.facingY;
  const length = Math.hypot(dx, dy) || 1;
  const facingX = dx / length; const facingY = dy / length; attacker.facingX = facingX; attacker.facingY = facingY; attacker.aimX = facingX; attacker.aimY = facingY;
  const targets = findNinjaTargets(attacker, soldiers); const victimIds: string[] = [];
  const bypass = attacker.technique === "NINJA_GENJUTSU" || attacker.technique === "NINJA_BARRIER";
  for (const target of targets) {
    if (!bypass && isDamageGuarded(target, "SPECIAL_ATTACK", random)) {
      target.combatFeedbackMarker = "S"; target.combatFeedbackUntil = currentTime + DEFENSE_CONFIG.guardMarkerDurationMs; continue;
    }
    const damage = calculateSuccessfulAttackDamage(attacker, target);
    applyDamage(target, damage); victimIds.push(target.id);
    target.combatFeedbackMarker = "H"; target.combatFeedbackUntil = currentTime + DEFENSE_CONFIG.guardMarkerDurationMs;
    if (bypass && !target.isDead) applyConfusion(target);
    if (!target.isDead) {
      let kx = target.x - attacker.x; let ky = target.y - attacker.y; const kl = Math.hypot(kx, ky) || 1; kx /= kl; ky /= kl;
      const safe = calculateSafeNinjaMovement(target, kx, ky, getNinjaKnockback(attacker.technique), soldiers, obstacles, bases);
      startHitReaction(target, attacker, currentTime, safe, random, "SPECIAL_ATTACK"); target.knockbackDirectionX = kx; target.knockbackDirectionY = ky;
    }
  }
  const fromX = attacker.x; const fromY = attacker.y;
  let safeDash = 0;
  if (source !== "WAVE") {
    const full = getNinjaDashDistance(attacker.technique);
    const edgeLimited = attacker.technique === "NINJA_SHADOW_RUN"
      && (attacker.x + facingX * full < SOLDIER_RADIUS || attacker.x + facingX * full > BATTLEFIELD_CONFIG.width - SOLDIER_RADIUS
        || attacker.y + facingY * full < SOLDIER_RADIUS || attacker.y + facingY * full > BATTLEFIELD_CONFIG.height - SOLDIER_RADIUS);
    const requested = edgeLimited ? getTechniqueSelfAdvanceWorld(attacker.technique, true) : full;
    safeDash = calculateSafeNinjaMovement(attacker, facingX, facingY, requested, soldiers, obstacles, bases);
    attacker.ninjaDashStartedAt = currentTime; attacker.ninjaDashStartX = attacker.x; attacker.ninjaDashStartY = attacker.y;
    attacker.ninjaDashTargetX = attacker.x + facingX * safeDash; attacker.ninjaDashTargetY = attacker.y + facingY * safeDash;
    attacker.ninjaDashUntil = currentTime + NINJA_CONFIG.dashDurationMs;
  }
  const support = attacker.technique === "NINJA_BARRIER" && source !== "BARRIER_FORCED" && source !== "WAVE"
    ? applyBarrierSupport(attacker, soldiers, obstacles, bases, currentTime, random, attacker.ninjaDashTargetX, attacker.ninjaDashTargetY)
    : { forcedEvents: [], healResults: [] };
  return { kind: "NINJA", attackerId: attacker.id, team: attacker.team, technique: attacker.technique,
    fromX, fromY, x: attacker.ninjaDashTargetX, y: attacker.ninjaDashTargetY, facingX, facingY, victimIds, source,
    barrierActivated: attacker.technique === "NINJA_BARRIER", ...support };
}
