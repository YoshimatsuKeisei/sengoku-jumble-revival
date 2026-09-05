import { DEFENSE_CONFIG, GENERAL_CONFIG, SPECIAL_ABILITY_CONFIG, SPECIAL_ATTACK_CONFIG } from "../config";
import type { RandomSource } from "../stats/soldierStats";
import type { BattleBase, BattleObstacle, Soldier, Team, UnitTechnique } from "../types";
import { applyDamage } from "./combatSystem";
import { clearConfusion } from "./confusionSystem";
import { isDamageGuarded } from "./defenseSystem";
import { calculateSafeNinjaMovement } from "./ninjaAttackSystem";
import { startHitReaction } from "./reactionSystem";
import { calculateSpecialCooldownMs } from "./skillCooldownSystem";
import { hasSpecialAbility } from "./specialAbilitySystem";
import { isValidCombatTarget } from "./combatTargetSystem";
import { queueMoutaiOnDamage } from "./cavalryChargeSystem";
import { clearEngagement } from "./aiSystem";

export type GeneralTechnique = "GENERAL_COMMAND" | "GENERAL_HEROIC" | "GENERAL_HEAL";
export interface GeneralAttackEvent {
  kind: "GENERAL"; attackerId: string; team: Team; technique: GeneralTechnique; x: number; y: number;
  commandRadius: number; recipientIds: string[]; forcedAttackerIds: string[]; playerReadyIds: string[];
  hitIds: string[]; defendedIds: string[]; healed: Array<{ targetId: string; amount: number }>;
}

export function isGeneralTechnique(technique: UnitTechnique): technique is GeneralTechnique {
  return technique === "GENERAL_COMMAND" || technique === "GENERAL_HEROIC" || technique === "GENERAL_HEAL";
}

export function findGeneralCommandRecipients(general: Soldier, soldiers: readonly Soldier[]): Soldier[] {
  return soldiers.filter((soldier) => soldier !== general && soldier.team === general.team && soldier.unitType !== "GENERAL"
    && !soldier.isDead && soldier.hp > 0 && soldier.state !== "HEALING"
    && Math.hypot(soldier.x - general.x, soldier.y - general.y) <= GENERAL_CONFIG.commandRadius);
}

export function findGeneralHealTargets(general: Soldier, soldiers: readonly Soldier[]): Soldier[] {
  return soldiers.filter((soldier) => soldier.team === general.team && !soldier.isDead && soldier.hp > 0
    && soldier.state !== "HEALING" && soldier.hp < soldier.maxHp
    && Math.hypot(soldier.x - general.x, soldier.y - general.y) <= GENERAL_CONFIG.healRadius);
}

export function canActivateGeneral(general: Soldier, soldiers: readonly Soldier[]): boolean {
  if (general.technique === "GENERAL_HEAL") return findGeneralHealTargets(general, soldiers).length > 0;
  if (general.technique === "GENERAL_COMMAND") return findGeneralCommandRecipients(general, soldiers).length > 0;
  return general.technique === "GENERAL_HEROIC" && (findGeneralCommandRecipients(general, soldiers).length > 0
    || soldiers.some((enemy) => isValidCombatTarget(general, enemy)
      && Math.hypot(enemy.x - general.x, enemy.y - general.y) <= GENERAL_CONFIG.heroicRadius));
}

export function executeGeneralAttack(
  general: Soldier, soldiers: Soldier[], obstacles: readonly BattleObstacle[], bases: readonly BattleBase[], currentTime: number,
  random: RandomSource, consumeCooldown: boolean, forceSpecial: (recipient: Soldier) => boolean,
): GeneralAttackEvent | null {
  if (!isGeneralTechnique(general.technique) || !canActivateGeneral(general, soldiers)) return null;
  if (consumeCooldown) {
    general.specialReadyAt = currentTime + calculateSpecialCooldownMs(general.stats.skill);
    if (hasSpecialAbility(general, "DOUBLE_SPECIAL") && random() < SPECIAL_ABILITY_CONFIG.doubleSpecialChance)
      general.pendingSecondSpecialAt = currentTime + SPECIAL_ABILITY_CONFIG.doubleSpecialDelayMs;
  }
  const event: GeneralAttackEvent = { kind: "GENERAL", attackerId: general.id, team: general.team, technique: general.technique,
    x: general.x, y: general.y, commandRadius: GENERAL_CONFIG.commandRadius, recipientIds: [], forcedAttackerIds: [],
    playerReadyIds: [], hitIds: [], defendedIds: [], healed: [] };
  if (general.technique === "GENERAL_HEAL") {
    for (const target of findGeneralHealTargets(general, soldiers)) {
      const amount = Math.min(GENERAL_CONFIG.healAmount, target.maxHp - target.hp); target.hp += amount;
      if (amount > 0) event.healed.push({ targetId: target.id, amount });
    }
    return event;
  }
  if (general.technique === "GENERAL_HEROIC") {
    const enemy = soldiers.filter((target) => isValidCombatTarget(general, target))
      .sort((a, b) => Math.hypot(a.x - general.x, a.y - general.y) - Math.hypot(b.x - general.x, b.y - general.y))[0];
    let dx = enemy ? enemy.x - general.x : general.facingX; let dy = enemy ? enemy.y - general.y : general.facingY;
    const length = Math.hypot(dx, dy) || 1; dx /= length; dy /= length;
    const safe = calculateSafeNinjaMovement(general, dx, dy, GENERAL_CONFIG.heroicStepDistance, soldiers, obstacles, bases);
    general.x += dx * safe; general.y += dy * safe; event.x = general.x; event.y = general.y;
    for (const target of soldiers.filter((candidate) => isValidCombatTarget(general, candidate)
      && Math.hypot(candidate.x - general.x, candidate.y - general.y) <= GENERAL_CONFIG.heroicRadius)) {
      if (isDamageGuarded(target, "SPECIAL_ATTACK", random)) {
        target.combatFeedbackMarker = "S"; target.combatFeedbackUntil = currentTime + DEFENSE_CONFIG.guardMarkerDurationMs;
        event.defendedIds.push(target.id); continue;
      }
      const damage = SPECIAL_ATTACK_CONFIG.damage + Number(hasSpecialAbility(general, "MIGHT"));
      applyDamage(target, damage); queueMoutaiOnDamage(target, damage); event.hitIds.push(target.id);
      target.combatFeedbackMarker = "H"; target.combatFeedbackUntil = currentTime + DEFENSE_CONFIG.guardMarkerDurationMs;
      if (!target.isDead) startHitReaction(target, general, currentTime, SPECIAL_ATTACK_CONFIG.knockbackDistance);
    }
  }
  for (const recipient of findGeneralCommandRecipients(general, soldiers)) {
    event.recipientIds.push(recipient.id);
    clearConfusion(recipient, "GENERAL_COMMAND");
    clearEngagement(recipient);
    if (recipient.controller === "player") {
      recipient.specialReadyAt = Math.min(recipient.specialReadyAt, currentTime); event.playerReadyIds.push(recipient.id);
    } else if (forceSpecial(recipient)) event.forcedAttackerIds.push(recipient.id);
  }
  return event;
}
