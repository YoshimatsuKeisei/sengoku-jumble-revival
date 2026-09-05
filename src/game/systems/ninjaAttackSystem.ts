import { BATTLEFIELD_CONFIG, DEFENSE_CONFIG, NINJA_CONFIG, SOLDIER_RADIUS, SPECIAL_ABILITY_CONFIG } from "../config";
import type { RandomSource } from "../stats/soldierStats";
import { randomIntInclusive } from "../stats/soldierStats";
import type { BattleBase, BattleObstacle, Soldier, Team, UnitTechnique } from "../types";
import { getBaseRect } from "./battlefieldGeometry";
import { applyDamage } from "./combatSystem";
import { isValidCombatTarget } from "./combatTargetSystem";
import { applyConfusion } from "./confusionSystem";
import { clearConfusion } from "./confusionSystem";
import { issueNinjaBarrierCharge } from "./commandSystem";
import { isDamageGuarded } from "./defenseSystem";
import { startHitReaction } from "./reactionSystem";
import { calculateSpecialCooldownMs } from "./skillCooldownSystem";
import { hasSpecialAbility } from "./specialAbilitySystem";
import { queueMoutaiOnDamage } from "./cavalryChargeSystem";

export type NinjaActivationSource = "NORMAL" | "DOUBLE_SPECIAL" | "BARRIER_FORCED" | "GENERAL_FORCED";
export interface NinjaAttackEvent { kind: "NINJA"; attackerId: string; team: Team;
  technique: "NINJA_NINJUTSU" | "NINJA_SHADOW_RUN" | "NINJA_GENJUTSU" | "NINJA_BARRIER";
  fromX: number; fromY: number; x: number; y: number; facingX: number; facingY: number;
  victimIds: string[]; source: NinjaActivationSource; barrierActivated: boolean; forcedEvents: NinjaAttackEvent[]; healResults: Array<{ targetId: string; amount: number }> }

export function isNinjaTechnique(technique: UnitTechnique): technique is NinjaAttackEvent["technique"] {
  return technique === "NINJA_NINJUTSU" || technique === "NINJA_SHADOW_RUN"
    || technique === "NINJA_GENJUTSU" || technique === "NINJA_BARRIER";
}
export function getNinjaDashDistance(technique: UnitTechnique): number {
  return technique === "NINJA_SHADOW_RUN" ? NINJA_CONFIG.shadowRunDashDistance : NINJA_CONFIG.ninjutsuDashDistance;
}
export function getNinjaKnockback(technique: UnitTechnique): number {
  return technique === "NINJA_SHADOW_RUN" ? NINJA_CONFIG.shadowRunKnockback : NINJA_CONFIG.ninjutsuKnockback;
}
function activeTarget(attacker: Soldier, target: Soldier): boolean {
  return isValidCombatTarget(attacker, target) && target.state !== "REJOINING";
}
export function isInsideNinjaForwardSector(attacker: Soldier, target: Soldier): boolean {
  const dx = target.x - attacker.x; const dy = target.y - attacker.y; const distance = Math.hypot(dx, dy);
  if (distance === 0 || distance > NINJA_CONFIG.attackRange) return false;
  const length = Math.hypot(attacker.facingX, attacker.facingY) || 1;
  const dot = (dx / distance) * attacker.facingX / length + (dy / distance) * attacker.facingY / length;
  return dot >= Math.cos(NINJA_CONFIG.forwardHalfAngleDegrees * Math.PI / 180);
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
  const candidates = soldiers.filter((target) => activeTarget(attacker, target)
    && Math.hypot(target.x - attacker.x, target.y - attacker.y) <= NINJA_CONFIG.attackRange);
  return candidates.find((target) => target.id === attacker.targetId)
    ?? candidates.sort((a, b) => Math.hypot(a.x - attacker.x, a.y - attacker.y) - Math.hypot(b.x - attacker.x, b.y - attacker.y))[0] ?? null;
}
function applyBarrierSupport(attacker: Soldier, soldiers: Soldier[], obstacles: readonly BattleObstacle[], bases: readonly BattleBase[],
  currentTime: number, random: RandomSource, centerX: number, centerY: number): { forcedEvents: NinjaAttackEvent[]; healResults: Array<{ targetId: string; amount: number }> } {
  const forcedEvents: NinjaAttackEvent[] = []; const healResults: Array<{ targetId: string; amount: number }> = [];
  const allies = soldiers.filter((target) => target !== attacker && target.team === attacker.team && target.unitType === "NINJA"
    && !target.isDead && target.hp > 0 && target.state !== "HEALING"
    && Math.hypot(target.x - centerX, target.y - centerY) <= NINJA_CONFIG.barrierSupportRadius);
  for (const ally of allies) {
    if (ally.technique !== "NINJA_BARRIER" && random() < NINJA_CONFIG.barrierAllyHealProc) {
      const amount = randomIntInclusive(NINJA_CONFIG.barrierHealMin, NINJA_CONFIG.barrierHealMax, random);
      const healed = Math.min(amount, ally.maxHp - ally.hp); ally.hp += healed; if (healed > 0) healResults.push({ targetId: ally.id, amount: healed });
    }
    if (random() < NINJA_CONFIG.barrierForceSpecialProc) {
      clearConfusion(ally, "BARRIER_COMMAND");
      const event = executeNinjaAttack(ally, soldiers, obstacles, bases, currentTime, random, "BARRIER_FORCED"); if (event) forcedEvents.push(event);
    }
    if (random() < NINJA_CONFIG.barrierChargeProc) issueNinjaBarrierCharge(ally, attacker, currentTime);
  }
  if (random() < NINJA_CONFIG.barrierSelfHealProc) {
    const amount = randomIntInclusive(NINJA_CONFIG.barrierHealMin, NINJA_CONFIG.barrierHealMax, random);
    const healed = Math.min(amount, attacker.maxHp - attacker.hp); attacker.hp += healed; if (healed > 0) healResults.push({ targetId: attacker.id, amount: healed });
  }
  return { forcedEvents, healResults };
}
export function executeNinjaAttack(attacker: Soldier, soldiers: Soldier[], obstacles: readonly BattleObstacle[], bases: readonly BattleBase[],
  currentTime: number, random: RandomSource = Math.random, source: NinjaActivationSource = "NORMAL"): NinjaAttackEvent | null {
  if (!isNinjaTechnique(attacker.technique)) return null;
  const primary = primaryTarget(attacker, soldiers); if (!primary) return null;
  if (source === "NORMAL") {
    if (currentTime < attacker.specialReadyAt || attacker.reactionState !== "NONE" || attacker.combatActionState !== "IDLE") return null;
    attacker.specialReadyAt = currentTime + calculateSpecialCooldownMs(attacker.stats.skill);
    if (hasSpecialAbility(attacker, "DOUBLE_SPECIAL") && random() < SPECIAL_ABILITY_CONFIG.doubleSpecialChance)
      attacker.pendingSecondSpecialAt = currentTime + SPECIAL_ABILITY_CONFIG.doubleSpecialDelayMs;
  }
  const dx = primary.x - attacker.x; const dy = primary.y - attacker.y; const length = Math.hypot(dx, dy) || 1;
  const facingX = dx / length; const facingY = dy / length; attacker.facingX = facingX; attacker.facingY = facingY; attacker.aimX = facingX; attacker.aimY = facingY;
  const targets = findNinjaTargets(attacker, soldiers); const victimIds: string[] = [];
  const bypass = attacker.technique === "NINJA_GENJUTSU" || attacker.technique === "NINJA_BARRIER";
  for (const target of targets) {
    if (!bypass && isDamageGuarded(target, "SPECIAL_ATTACK", random)) {
      target.combatFeedbackMarker = "S"; target.combatFeedbackUntil = currentTime + DEFENSE_CONFIG.guardMarkerDurationMs; continue;
    }
    const might = !bypass && hasSpecialAbility(attacker, "MIGHT"); const damage = 1 + Number(might);
    applyDamage(target, damage); queueMoutaiOnDamage(target, damage); victimIds.push(target.id);
    target.combatFeedbackMarker = "H"; target.combatFeedbackUntil = currentTime + DEFENSE_CONFIG.guardMarkerDurationMs;
    if (bypass && !target.isDead) applyConfusion(target);
    if (!target.isDead) {
      let kx = target.x - attacker.x; let ky = target.y - attacker.y; const kl = Math.hypot(kx, ky) || 1; kx /= kl; ky /= kl;
      const safe = calculateSafeNinjaMovement(target, kx, ky, getNinjaKnockback(attacker.technique), soldiers, obstacles, bases);
      startHitReaction(target, attacker, currentTime, safe); target.knockbackDirectionX = kx; target.knockbackDirectionY = ky;
    }
  }
  const fromX = attacker.x; const fromY = attacker.y;
  const safeDash = calculateSafeNinjaMovement(attacker, facingX, facingY, getNinjaDashDistance(attacker.technique), soldiers, obstacles, bases);
  attacker.ninjaDashStartedAt = currentTime; attacker.ninjaDashStartX = attacker.x; attacker.ninjaDashStartY = attacker.y;
  attacker.ninjaDashTargetX = attacker.x + facingX * safeDash; attacker.ninjaDashTargetY = attacker.y + facingY * safeDash;
  attacker.ninjaDashUntil = currentTime + NINJA_CONFIG.dashDurationMs;
  const support = attacker.technique === "NINJA_BARRIER" && source !== "BARRIER_FORCED"
    ? applyBarrierSupport(attacker, soldiers, obstacles, bases, currentTime, random, attacker.ninjaDashTargetX, attacker.ninjaDashTargetY)
    : { forcedEvents: [], healResults: [] };
  return { kind: "NINJA", attackerId: attacker.id, team: attacker.team, technique: attacker.technique,
    fromX, fromY, x: attacker.ninjaDashTargetX, y: attacker.ninjaDashTargetY, facingX, facingY, victimIds, source,
    barrierActivated: attacker.technique === "NINJA_BARRIER", ...support };
}
