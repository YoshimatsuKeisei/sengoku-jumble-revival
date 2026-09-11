import { BATTLEFIELD_CONFIG, DEFENSE_CONFIG, GENERAL_CONFIG, SOLDIER_RADIUS, SPECIAL_ATTACK_CONFIG } from "../config";
import type { RandomSource } from "../stats/soldierStats";
import type { BattleBase, BattleObstacle, Soldier, Team, UnitTechnique } from "../types";
import { applyDamage } from "./combatSystem";
import { recordSmallRecoveryPulse } from "./meritSystem";
import { clearConfusion } from "./confusionSystem";
import { isDamageGuarded } from "./defenseSystem";
import { calculateSafeNinjaMovement } from "./ninjaAttackSystem";
import { startHitReaction } from "./reactionSystem";
import { calculateSuccessfulAttackDamage, hasSpecialAbility } from "./specialAbilitySystem";
import { isValidCombatTarget } from "./combatTargetSystem";
import { clearEngagement } from "./aiSystem";
import { beginTechniqueAction, isRangedGaugeTechnique } from "./combatGaugeSystem";
import { getTechniqueAreaCenter, getTechniqueAreaWorld, getTechniqueSelfAdvanceWorld, isPointInTechniqueRectangle } from "./techniqueCombatProfiles";

export type GeneralTechnique = "GENERAL_COMMAND" | "GENERAL_HEROIC" | "GENERAL_HEAL" | "GENERAL_FURIOUS";
export interface GeneralAttackEvent {
  kind: "GENERAL"; attackerId: string; team: Team; technique: GeneralTechnique; x: number; y: number;
  commandRadius: number; recipientIds: string[]; forcedAttackerIds: string[]; playerReadyIds: string[];
  hitIds: string[]; defendedIds: string[]; healed: Array<{ targetId: string; amount: number }>; isWave: boolean;
}

export function isGeneralTechnique(technique: UnitTechnique): technique is GeneralTechnique {
  return technique === "GENERAL_COMMAND" || technique === "GENERAL_HEROIC"
    || technique === "GENERAL_HEAL" || technique === "GENERAL_FURIOUS";
}

function hasRawCommandSpZero(soldier: Soldier): boolean {
  // Raw ranged spl() keeps sp at zero and uses k for its 10-tick action lock.
  // Non-ranged active specials use the reconstruction's explicit special state.
  return isRangedGaugeTechnique(soldier) || soldier.activeSpecialTechnique === null;
}

export function findGeneralCommandRecipients(general: Soldier, soldiers: readonly Soldier[]): Soldier[] {
  return soldiers.filter((soldier) => soldier !== general && soldier.team === general.team && soldier.unitType !== "GENERAL"
    && !soldier.isDead && soldier.hp > 0 && soldier.state === "NORMAL" && hasRawCommandSpZero(soldier)
    && isPointInTechniqueRectangle("GENERAL_COMMAND", getTechniqueAreaCenter("GENERAL_COMMAND", general), soldier));
}

export function findGeneralHealTargets(general: Soldier, soldiers: readonly Soldier[]): Soldier[] {
  return soldiers.filter((soldier) => soldier.team === general.team && !soldier.isDead && soldier.hp > 0
    && soldier.state !== "HEALING" && soldier.hp < soldier.maxHp
    && isPointInTechniqueRectangle("GENERAL_HEAL", getTechniqueAreaCenter("GENERAL_HEAL", general), soldier));
}

export function canActivateGeneral(general: Soldier, soldiers: readonly Soldier[]): boolean {
  if (general.technique === "GENERAL_HEAL") return findGeneralHealTargets(general, soldiers).length > 0;
  if (general.technique === "GENERAL_COMMAND") return findGeneralCommandRecipients(general, soldiers).length > 0;
  return (general.technique === "GENERAL_HEROIC" || general.technique === "GENERAL_FURIOUS")
    && (findGeneralCommandRecipients(general, soldiers).length > 0
    || soldiers.some((enemy) => isValidCombatTarget(general, enemy)
      && isPointInTechniqueRectangle(general.technique, getTechniqueAreaCenter(general.technique, general), enemy)));
}

export function executeGeneralAttack(
  general: Soldier, soldiers: Soldier[], obstacles: readonly BattleObstacle[], bases: readonly BattleBase[], currentTime: number,
  random: RandomSource, consumeCooldown: boolean, forceSpecial: (recipient: Soldier) => boolean, isWave = false,
): GeneralAttackEvent | null {
  if (!isGeneralTechnique(general.technique)) return null;
  if (consumeCooldown && !beginTechniqueAction(general, currentTime, random, true)) return null;
  const event: GeneralAttackEvent = { kind: "GENERAL", attackerId: general.id, team: general.team, technique: general.technique,
    x: general.x, y: general.y, commandRadius: getTechniqueAreaWorld("GENERAL_COMMAND").width / 2, recipientIds: [], forcedAttackerIds: [],
    playerReadyIds: [], hitIds: [], defendedIds: [], healed: [], isWave };
  if (general.technique === "GENERAL_HEAL") {
    for (const target of findGeneralHealTargets(general, soldiers)) {
      const requested = GENERAL_CONFIG.healAmount + Number(hasSpecialAbility(target, "RECOVERY_BOOST"));
      const amount = Math.min(requested, target.maxHp - target.hp); target.hp += amount;
      recordSmallRecoveryPulse(general, target, amount);
      if (amount > 0) event.healed.push({ targetId: target.id, amount });
    }
    return event;
  }
  if (general.technique === "GENERAL_HEROIC" || general.technique === "GENERAL_FURIOUS") {
    const attackTechnique = general.technique;
    const enemy = soldiers.filter((target) => isValidCombatTarget(general, target))
      .sort((a, b) => Math.hypot(a.x - general.x, a.y - general.y) - Math.hypot(b.x - general.x, b.y - general.y))[0];
    let dx = enemy ? enemy.x - general.x : general.facingX; let dy = enemy ? enemy.y - general.y : general.facingY;
    const length = Math.hypot(dx, dy) || 1; dx /= length; dy /= length;
    if (!isWave) {
      const fullAdvance = getTechniqueSelfAdvanceWorld(attackTechnique);
      const edgeLimited = attackTechnique === "GENERAL_FURIOUS"
        && (general.x + dx * fullAdvance < SOLDIER_RADIUS
          || general.x + dx * fullAdvance > BATTLEFIELD_CONFIG.width - SOLDIER_RADIUS
          || general.y + dy * fullAdvance < SOLDIER_RADIUS
          || general.y + dy * fullAdvance > BATTLEFIELD_CONFIG.height - SOLDIER_RADIUS);
      const requested = getTechniqueSelfAdvanceWorld(attackTechnique, edgeLimited);
      const safe = calculateSafeNinjaMovement(general, dx, dy, requested, soldiers, obstacles, bases);
      general.x += dx * safe; general.y += dy * safe; event.x = general.x; event.y = general.y;
    }
    for (const target of soldiers.filter((candidate) => isValidCombatTarget(general, candidate)
      && isPointInTechniqueRectangle(attackTechnique, getTechniqueAreaCenter(attackTechnique, general), candidate))) {
      if (isDamageGuarded(target, "SPECIAL_ATTACK", random)) {
        target.combatFeedbackMarker = "S"; target.combatFeedbackUntil = currentTime + DEFENSE_CONFIG.guardMarkerDurationMs;
        event.defendedIds.push(target.id); continue;
      }
      const damage = calculateSuccessfulAttackDamage(general, target, SPECIAL_ATTACK_CONFIG.damage);
      applyDamage(target, damage, general); event.hitIds.push(target.id);
      target.combatFeedbackMarker = "H"; target.combatFeedbackUntil = currentTime + DEFENSE_CONFIG.guardMarkerDurationMs;
      if (!target.isDead) startHitReaction(target, general, currentTime, SPECIAL_ATTACK_CONFIG.knockbackDistance, random, "SPECIAL_ATTACK");
    }
  }
  if (isWave) return event;
  for (const recipient of findGeneralCommandRecipients(general, soldiers)) {
    event.recipientIds.push(recipient.id);
    clearConfusion(recipient, "GENERAL_COMMAND");
    // Raw mode 4 only selects fr.gotoAndStop("kb"); the actual spl(recipient)
    // callback occurs later on Sprite 671 frame 13. Ranged spl() uses the
    // recipient's existing l, so preserve that latch until the callback.
    if (!isRangedGaugeTechnique(recipient)) clearEngagement(recipient);
    if (recipient.controller === "player") {
      recipient.specialReadyAt = Math.min(recipient.specialReadyAt, currentTime);
      recipient.playerTechniqueGauge = 100;
      event.playerReadyIds.push(recipient.id);
    } else if (forceSpecial(recipient)) event.forcedAttackerIds.push(recipient.id);
  }
  return event;
}
