import {
  BATTLEFIELD_CONFIG,
  DEFENSE_CONFIG,
  SOLDIER_RADIUS,
  SPECIAL_ATTACK_CONFIG,
  SPECIAL_ABILITY_CONFIG,
} from "../config";
import type { BattleBase, BattleObstacle, Soldier, Team } from "../types";
import { applyDamage } from "./combatSystem";
import { getBaseRect } from "./battlefieldGeometry";
import { circleIntersectsObstacle } from "./movementSystem";
import { startHitReaction } from "./reactionSystem";
import type { RandomSource } from "../stats/soldierStats";
import { hasSpecialAbility } from "./specialAbilitySystem";
import { isDamageGuarded } from "./defenseSystem";
import { calculateSpecialCooldownMs } from "./skillCooldownSystem";
import { executeGunAttack, findGunTarget, getGunMovementDecision, isGunTechnique, type GunAttackEvent } from "./gunAttackSystem";
import { executeCavalryCharge, queueMoutaiOnDamage, type CavalryChargeEvent } from "./cavalryChargeSystem";
import { isValidCombatTarget } from "./combatTargetSystem";
import { executeArrowAttack, findArrowTarget, getArrowMovementDecision, isArrowTechnique, type ArrowLaunchEvent } from "./arrowAttackSystem";
import { executeSpearAttack, isSpearTechnique, type SpearAttackEvent } from "./spearAttackSystem";
import { executeNinjaAttack, isNinjaTechnique, type NinjaAttackEvent } from "./ninjaAttackSystem";
import { executeGeneralAttack, isGeneralTechnique, type GeneralAttackEvent } from "./generalAttackSystem";
import { executeStrategistAttack, isStrategistTechnique, type StrategistAttackEvent } from "./strategistAttackSystem";
import { executeMosaAttack, isMosaTechnique, type MosaAttackEvent } from "./mosaAttackSystem";

export interface AreaSpecialAttackEvent { kind: "AREA"; attackerId: string; team: Team; x: number; y: number }
export type SpecialAttackEvent = AreaSpecialAttackEvent | GunAttackEvent | CavalryChargeEvent | ArrowLaunchEvent | SpearAttackEvent | NinjaAttackEvent | GeneralAttackEvent | StrategistAttackEvent | MosaAttackEvent;
export { calculateSpecialCooldownMs } from "./skillCooldownSystem";

export function isSpecialReady(soldier: Soldier, currentTime: number): boolean {
  return currentTime >= soldier.specialReadyAt;
}

function activeEnemy(attacker: Soldier, candidate: Soldier): boolean {
  return isValidCombatTarget(attacker, candidate) && candidate.state !== "REJOINING";
}

function retreatForward(soldier: Soldier): { x: number; y: number } | null {
  if (soldier.moveTargetX === null || soldier.moveTargetY === null) return null;
  const dx = soldier.moveTargetX - soldier.x;
  const dy = soldier.moveTargetY - soldier.y;
  const length = Math.hypot(dx, dy);
  return length === 0 ? null : { x: dx / length, y: dy / length };
}

export function findSpecialTargets(attacker: Soldier, soldiers: readonly Soldier[], retreatOnly = false): Soldier[] {
  const forward = retreatOnly ? retreatForward(attacker) : null;
  if (retreatOnly && !forward) return [];
  return soldiers.filter((target) => {
    if (!activeEnemy(attacker, target)) return false;
    const dx = target.x - attacker.x;
    const dy = target.y - attacker.y;
    const distance = Math.hypot(dx, dy);
    if (distance > SPECIAL_ATTACK_CONFIG.radius) return false;
    if (!retreatOnly || distance === 0) return true;
    return forward!.x * dx / distance + forward!.y * dy / distance >= SPECIAL_ATTACK_CONFIG.retreatForwardDotMinimum;
  });
}

export function canUseSpecial(soldier: Soldier, currentTime: number): boolean {
  if (soldier.isDead || soldier.hp <= 0 || !isSpecialReady(soldier, currentTime)) return false;
  if (soldier.reactionState !== "NONE" || soldier.combatActionState !== "IDLE") return false;
  return soldier.state === "NORMAL" || (!soldier.isConfused && soldier.state === "EMERGENCY_RETREAT");
}

function pointInsideInflatedBase(x: number, y: number, base: BattleBase): boolean {
  const rect = getBaseRect(base);
  return x >= rect.x - SOLDIER_RADIUS && x <= rect.x + rect.width + SOLDIER_RADIUS
    && y >= rect.y - SOLDIER_RADIUS && y <= rect.y + rect.height + SOLDIER_RADIUS;
}

function specialKnockbackDestinationIsClear(
  target: Soldier,
  attacker: Soldier,
  dx: number,
  dy: number,
  soldiers: readonly Soldier[],
  obstacles: readonly BattleObstacle[],
  bases: readonly BattleBase[],
): boolean {
  const distance = SPECIAL_ATTACK_CONFIG.knockbackDistance;
  const steps = Math.max(1, Math.ceil(distance / (SOLDIER_RADIUS / 2)));
  for (let step = 1; step <= steps; step += 1) {
    const x = target.x + dx * distance * step / steps;
    const y = target.y + dy * distance * step / steps;
    if (x < SOLDIER_RADIUS || x > BATTLEFIELD_CONFIG.width - SOLDIER_RADIUS
      || y < SOLDIER_RADIUS || y > BATTLEFIELD_CONFIG.height - SOLDIER_RADIUS) return false;
    if (obstacles.some((obstacle) => circleIntersectsObstacle(x, y, SOLDIER_RADIUS, obstacle))) return false;
    if (bases.some((base) => pointInsideInflatedBase(x, y, base))) return false;
    if (soldiers.some((other) => other !== target && other !== attacker && !other.isDead
      && Math.hypot(x - other.x, y - other.y) < SOLDIER_RADIUS * 2)) return false;
  }
  return true;
}

function knockbackDirection(attacker: Soldier, target: Soldier): { x: number; y: number } {
  let dx = target.x - attacker.x;
  let dy = target.y - attacker.y;
  const length = Math.hypot(dx, dy);
  if (length > 0) return { x: dx / length, y: dy / length };
  let hash = 0;
  for (const character of `${attacker.id}:${target.id}`) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return { x: hash % 2 === 0 ? 1 : -1, y: 0 };
}

export function executeSpecialAttack(
  attacker: Soldier,
  targets: readonly Soldier[],
  soldiers: readonly Soldier[],
  obstacles: readonly BattleObstacle[],
  bases: readonly BattleBase[],
  currentTime: number,
  consumeCooldown = true,
  random: RandomSource = Math.random,
): AreaSpecialAttackEvent | null {
  if (targets.length === 0 || (consumeCooldown && !canUseSpecial(attacker, currentTime))) return null;
  if (consumeCooldown) {
    attacker.specialReadyAt = currentTime + calculateSpecialCooldownMs(attacker.stats.skill);
    if (hasSpecialAbility(attacker, "DOUBLE_SPECIAL") && random() < SPECIAL_ABILITY_CONFIG.doubleSpecialChance)
      attacker.pendingSecondSpecialAt = currentTime + SPECIAL_ABILITY_CONFIG.doubleSpecialDelayMs;
  }
  for (const target of targets) {
    const direction = knockbackDirection(attacker, target);
    const canMove = specialKnockbackDestinationIsClear(target, attacker, direction.x, direction.y, soldiers, obstacles, bases);
    const guarded = isDamageGuarded(target, "SPECIAL_ATTACK", random);
    if (!guarded) { applyDamage(target, SPECIAL_ATTACK_CONFIG.damage); queueMoutaiOnDamage(target, SPECIAL_ATTACK_CONFIG.damage); }
    target.combatFeedbackMarker = guarded ? "S" : "H";
    target.combatFeedbackUntil = currentTime + DEFENSE_CONFIG.guardMarkerDurationMs;
    if (target.isDead) continue;
    if (canMove) {
      target.x += direction.x * SPECIAL_ATTACK_CONFIG.knockbackDistance;
      target.y += direction.y * SPECIAL_ATTACK_CONFIG.knockbackDistance;
    }
    if (!guarded) startHitReaction(target, attacker, currentTime, 0);
  }
  return { kind: "AREA", attackerId: attacker.id, team: attacker.team, x: attacker.x, y: attacker.y };
}

export function updateSpecialAttacks(
  soldiers: Soldier[],
  obstacles: readonly BattleObstacle[],
  bases: readonly BattleBase[],
  currentTime: number,
  playerRequested = false,
  random: RandomSource = Math.random,
): SpecialAttackEvent[] {
  const events: SpecialAttackEvent[] = [];
  const forceGeneralRecipient = (recipient: Soldier): boolean => {
    const event = isGunTechnique(recipient.technique)
      ? (() => { const target = findGunTarget(recipient, soldiers); return target ? executeGunAttack(recipient, target, currentTime, random, false, soldiers) : null; })()
      : isArrowTechnique(recipient.technique)
      ? (() => { const target = findArrowTarget(recipient, soldiers); return target ? executeArrowAttack(recipient, target, currentTime, random, false) : null; })()
      : recipient.technique === "CAVALRY_CHARGE" ? executeCavalryCharge(recipient, soldiers, obstacles, bases, currentTime, random, { consumeCooldown: false })
      : isSpearTechnique(recipient.technique) ? executeSpearAttack(recipient, soldiers, obstacles, bases, currentTime, random, false)
      : isNinjaTechnique(recipient.technique) ? executeNinjaAttack(recipient, soldiers, obstacles, bases, currentTime, random, "GENERAL_FORCED")
      : isStrategistTechnique(recipient.technique) ? executeStrategistAttack(recipient, soldiers, obstacles, bases, currentTime, random, false)
      : isMosaTechnique(recipient.technique) ? executeMosaAttack(recipient, soldiers, obstacles, bases, currentTime, random, false)
      : recipient.technique === "PROTOTYPE_AREA" ? executeSpecialAttack(recipient, findSpecialTargets(recipient, soldiers), soldiers, obstacles, bases, currentTime, false, random)
      : null;
    if (event) events.push(event);
    return event !== null;
  };
  for (const attacker of soldiers) {
    while (attacker.pendingMoutaiCharges > 0) {
      attacker.pendingMoutaiCharges -= 1;
      const reactive = executeCavalryCharge(attacker, soldiers, obstacles, bases, currentTime, random, { reactive: true, consumeCooldown: false });
      if (reactive) events.push(reactive);
    }
    if (attacker.pendingSecondSpecialAt !== null && currentTime >= attacker.pendingSecondSpecialAt) {
      attacker.pendingSecondSpecialAt = null;
      const second = attacker.technique === "CAVALRY_CHARGE"
        ? executeCavalryCharge(attacker, soldiers, obstacles, bases, currentTime, random, { consumeCooldown: false })
        : isGunTechnique(attacker.technique)
        ? (() => { const target = findGunTarget(attacker, soldiers); return target && getGunMovementDecision(attacker, target) !== "NORMAL_COMBAT" ? executeGunAttack(attacker, target, currentTime, random, false, soldiers) : null; })()
        : isArrowTechnique(attacker.technique)
        ? (() => { const target = findArrowTarget(attacker, soldiers); return target && getArrowMovementDecision(attacker, target) !== "NORMAL_COMBAT" ? executeArrowAttack(attacker, target, currentTime, random, false) : null; })()
        : isSpearTechnique(attacker.technique)
        ? executeSpearAttack(attacker, soldiers, obstacles, bases, currentTime, random, false)
        : isNinjaTechnique(attacker.technique)
        ? executeNinjaAttack(attacker, soldiers, obstacles, bases, currentTime, random, "DOUBLE_SPECIAL")
        : isGeneralTechnique(attacker.technique)
        ? executeGeneralAttack(attacker, soldiers, obstacles, bases, currentTime, random, false, forceGeneralRecipient)
        : isStrategistTechnique(attacker.technique)
        ? executeStrategistAttack(attacker, soldiers, obstacles, bases, currentTime, random, false)
        : isMosaTechnique(attacker.technique)
        ? executeMosaAttack(attacker, soldiers, obstacles, bases, currentTime, random, false)
        : executeSpecialAttack(attacker, findSpecialTargets(attacker, soldiers, attacker.state === "EMERGENCY_RETREAT"),
          soldiers, obstacles, bases, currentTime, false, random);
      if (second) events.push(second);
    }
    if (!canUseSpecial(attacker, currentTime)) continue;
    const retreating = attacker.state === "EMERGENCY_RETREAT";
    if (attacker.controller === "player" && !playerRequested) continue;
    const event = attacker.technique === "CAVALRY_CHARGE"
      ? executeCavalryCharge(attacker, soldiers, obstacles, bases, currentTime, random)
      : isGunTechnique(attacker.technique)
      ? (() => { const target = findGunTarget(attacker, soldiers); return target && getGunMovementDecision(attacker, target) !== "NORMAL_COMBAT" ? executeGunAttack(attacker, target, currentTime, random, true, soldiers) : null; })()
      : isArrowTechnique(attacker.technique)
      ? (() => { const target = findArrowTarget(attacker, soldiers); return target && getArrowMovementDecision(attacker, target) !== "NORMAL_COMBAT" ? executeArrowAttack(attacker, target, currentTime, random, true) : null; })()
      : isSpearTechnique(attacker.technique)
      ? executeSpearAttack(attacker, soldiers, obstacles, bases, currentTime, random, true)
      : isNinjaTechnique(attacker.technique)
      ? executeNinjaAttack(attacker, soldiers, obstacles, bases, currentTime, random, "NORMAL")
      : isGeneralTechnique(attacker.technique)
      ? executeGeneralAttack(attacker, soldiers, obstacles, bases, currentTime, random, true, forceGeneralRecipient)
      : isStrategistTechnique(attacker.technique)
      ? executeStrategistAttack(attacker, soldiers, obstacles, bases, currentTime, random, true)
      : isMosaTechnique(attacker.technique)
      ? executeMosaAttack(attacker, soldiers, obstacles, bases, currentTime, random, true)
      : executeSpecialAttack(attacker, findSpecialTargets(attacker, soldiers, retreating && attacker.controller !== "player"),
        soldiers, obstacles, bases, currentTime, true, random);
    if (event) events.push(event);
  }
  return events;
}
