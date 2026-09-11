import {
  BATTLEFIELD_CONFIG,
  DEFENSE_CONFIG,
  SOLDIER_RADIUS,
  SPECIAL_ATTACK_CONFIG,
} from "../config";
import type { BattleBase, BattleObstacle, Soldier, Team } from "../types";
import { applyDamage } from "./combatSystem";
import { getBaseRect } from "./battlefieldGeometry";
import { circleIntersectsObstacle } from "./movementSystem";
import { startHitReaction } from "./reactionSystem";
import type { RandomSource } from "../stats/soldierStats";
import { isDamageGuarded } from "./defenseSystem";
import { executeGunAttack, findGunTarget, getGunMovementDecision, isGunTechnique, type GunAttackEvent } from "./gunAttackSystem";
import { executeCavalryCharge, type CavalryChargeEvent } from "./cavalryChargeSystem";
import { isValidCombatTarget } from "./combatTargetSystem";
import { executeArrowAttack, findArrowTarget, getArrowMovementDecision, isArrowTechnique, type ArrowLaunchEvent } from "./arrowAttackSystem";
import { executeSpearAttack, isSpearTechnique, type SpearAttackEvent } from "./spearAttackSystem";
import { executeNinjaAttack, isNinjaTechnique, type NinjaAttackEvent } from "./ninjaAttackSystem";
import { executeGeneralAttack, isGeneralTechnique, type GeneralAttackEvent } from "./generalAttackSystem";
import { executeStrategistAttack, isStrategistTechnique, type StrategistAttackEvent } from "./strategistAttackSystem";
import { executeMosaAttack, isMosaTechnique, type MosaAttackEvent } from "./mosaAttackSystem";
import { advanceCombatGauge, beginTechniqueAction, clearTechniqueActionIfComplete, hasTechniqueGauge } from "./combatGaugeSystem";
import { swfLogicTicksToMs } from "./techniqueCombatProfiles";
import { calculateSuccessfulAttackDamage } from "./specialAbilitySystem";

export interface AreaSpecialAttackEvent { kind: "AREA"; attackerId: string; team: Team; x: number; y: number }
export type SpecialAttackEvent = AreaSpecialAttackEvent | GunAttackEvent | CavalryChargeEvent | ArrowLaunchEvent | SpearAttackEvent | NinjaAttackEvent | GeneralAttackEvent | StrategistAttackEvent | MosaAttackEvent;
export { calculateSpecialCooldownMs } from "./skillCooldownSystem";

export const SWF_GENERAL_COMMAND_CALLBACK_DELAY_TICKS = 12;
const pendingGeneralCommandCallbacks = new WeakMap<Soldier, number>();

export function isSpecialReady(soldier: Soldier, currentTime: number): boolean {
  return currentTime >= soldier.specialReadyAt && hasTechniqueGauge(soldier);
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
  if (soldier.isDead || soldier.hp <= 0 || soldier.state !== "NORMAL") return false;
  if (soldier.reactionState !== "NONE" || soldier.combatActionState !== "IDLE") return false;
  if (soldier.activeSpecialTechnique !== null || currentTime < soldier.specialLockUntil
    || currentTime < soldier.abilityActionLockUntil) return false;
  return soldier.controller === "player" ? isSpecialReady(soldier, currentTime) : hasTechniqueGauge(soldier);
}

function hasBattleActivationContext(attacker: Soldier, soldiers: readonly Soldier[]): boolean {
  if (attacker.technique === "GENERAL_COMMAND")
    return soldiers.some((target) => target !== attacker && target.team === attacker.team && !target.isDead && target.hp > 0);
  if (attacker.technique === "GENERAL_HEAL" || attacker.technique === "STRATEGIST_HEAL")
    return soldiers.some((target) => target.team === attacker.team && !target.isDead && target.hp > 0 && target.hp < target.maxHp);
  if (attacker.technique === "GENERAL_HEROIC" || attacker.technique === "NINJA_BARRIER")
    return soldiers.some((target) => target !== attacker && !target.isDead && target.hp > 0);
  return soldiers.some((target) => activeEnemy(attacker, target));
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
  if (targets.length === 0 || (consumeCooldown && !beginTechniqueAction(attacker, currentTime, random, true))) return null;
  for (const target of targets) {
    const direction = knockbackDirection(attacker, target);
    const canMove = specialKnockbackDestinationIsClear(target, attacker, direction.x, direction.y, soldiers, obstacles, bases);
    const guarded = isDamageGuarded(target, "SPECIAL_ATTACK", random);
    const damage = calculateSuccessfulAttackDamage(attacker, target, SPECIAL_ATTACK_CONFIG.damage);
    if (!guarded) applyDamage(target, damage, attacker);
    target.combatFeedbackMarker = guarded ? "S" : "H";
    target.combatFeedbackUntil = currentTime + DEFENSE_CONFIG.guardMarkerDurationMs;
    if (target.isDead) continue;
    if (canMove) {
      target.x += direction.x * SPECIAL_ATTACK_CONFIG.knockbackDistance;
      target.y += direction.y * SPECIAL_ATTACK_CONFIG.knockbackDistance;
    }
    if (!guarded) startHitReaction(target, attacker, currentTime, 0, random, "SPECIAL_ATTACK");
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
  const generalForcedRecipientsThisUpdate = new Set<string>();
  function dispatchForcedTechnique(recipient: Soldier, establishRangedAction = false): SpecialAttackEvent | null {
    if (isGunTechnique(recipient.technique)) {
      // Raw general-command spl() uses the ranged recipient's existing l and
      // must not opportunistically acquire a new target here.
      const target = findGunTarget(recipient, soldiers, false);
      if (!target) return null;
      if (establishRangedAction && !beginTechniqueAction(recipient, currentTime, random, false)) return null;
      return executeGunAttack(recipient, target, currentTime, random, false, soldiers);
    }
    if (isArrowTechnique(recipient.technique)) {
      const target = findArrowTarget(recipient, soldiers, false);
      if (!target) return null;
      if (establishRangedAction && !beginTechniqueAction(recipient, currentTime, random, false)) return null;
      return executeArrowAttack(recipient, target, currentTime, random, false, soldiers);
    }
    return recipient.technique === "CAVALRY_CHARGE" ? executeCavalryCharge(recipient, soldiers, obstacles, bases, currentTime, random, { consumeCooldown: false })
      : isSpearTechnique(recipient.technique) ? executeSpearAttack(recipient, soldiers, obstacles, bases, currentTime, random, false)
      : isNinjaTechnique(recipient.technique) ? executeNinjaAttack(recipient, soldiers, obstacles, bases, currentTime, random, "GENERAL_FORCED")
      : isGeneralTechnique(recipient.technique) ? executeGeneralAttack(recipient, soldiers, obstacles, bases, currentTime, random, false, scheduleGeneralRecipient)
      : isStrategistTechnique(recipient.technique) ? executeStrategistAttack(recipient, soldiers, obstacles, bases, currentTime, random, false)
      : isMosaTechnique(recipient.technique) ? executeMosaAttack(recipient, soldiers, obstacles, bases, currentTime, random, false)
      : recipient.technique === "PROTOTYPE_AREA" ? executeSpecialAttack(recipient, findSpecialTargets(recipient, soldiers), soldiers, obstacles, bases, currentTime, false, random)
      : null;
  }
  const scheduleGeneralRecipient = (recipient: Soldier): boolean => {
    if (generalForcedRecipientsThisUpdate.has(recipient.id)) return false;
    generalForcedRecipientsThisUpdate.add(recipient.id);
    // Raw mode-4 command selects fr.gotoAndStop("kb"). Sprite 800 frame 3
    // places Sprite 671, whose frame-13 action calls root.spl(recipient). The
    // child starts on frame 1 immediately, so the callback occurs after 12
    // subsequent 24-fps timeline advances rather than on the command tick.
    pendingGeneralCommandCallbacks.set(
      recipient,
      currentTime + swfLogicTicksToMs(SWF_GENERAL_COMMAND_CALLBACK_DELAY_TICKS),
    );
    return true;
  };

  for (const recipient of soldiers) {
    const dueAt = pendingGeneralCommandCallbacks.get(recipient);
    if (dueAt === undefined || currentTime < dueAt) continue;
    pendingGeneralCommandCallbacks.delete(recipient);
    const forced = dispatchForcedTechnique(recipient, true);
    if (forced) events.push(forced);
  }

  const executeWave = (attacker: Soldier): SpecialAttackEvent | null => {
    if (attacker.technique === "CAVALRY_CHARGE")
      return executeCavalryCharge(attacker, soldiers, obstacles, bases, currentTime, random, { consumeCooldown: false, isWave: true });
    if (isSpearTechnique(attacker.technique))
      return executeSpearAttack(attacker, soldiers, obstacles, bases, currentTime, random, false, true);
    if (isNinjaTechnique(attacker.technique))
      return executeNinjaAttack(attacker, soldiers, obstacles, bases, currentTime, random, "WAVE");
    if (isGeneralTechnique(attacker.technique))
      return executeGeneralAttack(attacker, soldiers, obstacles, bases, currentTime, random, false, scheduleGeneralRecipient, true);
    if (isStrategistTechnique(attacker.technique))
      return executeStrategistAttack(attacker, soldiers, obstacles, bases, currentTime, random, false, true);
    if (isMosaTechnique(attacker.technique))
      return executeMosaAttack(attacker, soldiers, obstacles, bases, currentTime, random, false, true);
    return null;
  };

  for (const attacker of soldiers) {
    advanceCombatGauge(attacker, currentTime, random);
    while (attacker.pendingMoutaiSpecials > 0) {
      attacker.pendingMoutaiSpecials -= 1;
      if (!beginTechniqueAction(attacker, currentTime, random, false)) continue;
      const reactive = dispatchForcedTechnique(attacker);
      if (reactive) events.push(reactive);
    }
    if (attacker.activeSpecialTechnique !== null && attacker.nextSpecialWaveAt !== null) {
      let nextWaveAt = attacker.nextSpecialWaveAt;
      while (attacker.specialWavesRemaining > 0 && currentTime >= nextWaveAt
        && !attacker.isDead && attacker.state === "NORMAL" && attacker.reactionState === "NONE") {
        attacker.specialWavesRemaining -= 1;
        nextWaveAt += swfLogicTicksToMs(1);
        attacker.nextSpecialWaveAt = attacker.specialWavesRemaining > 0 ? nextWaveAt : null;
        const wave = executeWave(attacker);
        if (wave) events.push(wave);
      }
    }
    clearTechniqueActionIfComplete(attacker, currentTime);
    if (!canUseSpecial(attacker, currentTime)) continue;
    if (!hasBattleActivationContext(attacker, soldiers)) continue;
    if (attacker.controller === "player" && !playerRequested) continue;
    const event = attacker.technique === "CAVALRY_CHARGE"
      ? executeCavalryCharge(attacker, soldiers, obstacles, bases, currentTime, random)
      : isGunTechnique(attacker.technique)
      ? (() => { const target = findGunTarget(attacker, soldiers); return target && getGunMovementDecision(attacker, target) !== "NORMAL_COMBAT" ? executeGunAttack(attacker, target, currentTime, random, true, soldiers) : null; })()
      : isArrowTechnique(attacker.technique)
      ? (() => { const target = findArrowTarget(attacker, soldiers); return target && getArrowMovementDecision(attacker, target) !== "NORMAL_COMBAT" ? executeArrowAttack(attacker, target, currentTime, random, true, soldiers) : null; })()
      : isSpearTechnique(attacker.technique)
      ? executeSpearAttack(attacker, soldiers, obstacles, bases, currentTime, random, true)
      : isNinjaTechnique(attacker.technique)
      ? executeNinjaAttack(attacker, soldiers, obstacles, bases, currentTime, random, "NORMAL")
      : isGeneralTechnique(attacker.technique)
      ? executeGeneralAttack(attacker, soldiers, obstacles, bases, currentTime, random, true, scheduleGeneralRecipient)
      : isStrategistTechnique(attacker.technique)
      ? executeStrategistAttack(attacker, soldiers, obstacles, bases, currentTime, random, true)
      : isMosaTechnique(attacker.technique)
      ? executeMosaAttack(attacker, soldiers, obstacles, bases, currentTime, random, true)
      : executeSpecialAttack(attacker, findSpecialTargets(attacker, soldiers),
        soldiers, obstacles, bases, currentTime, true, random);
    if (event) events.push(event);
  }
  return events;
}
