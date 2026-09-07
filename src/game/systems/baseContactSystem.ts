import { BASE_CONTACT_CONFIG, SOLDIERS_PER_TEAM, SOLDIER_RADIUS } from "../config";
import type { RandomSource } from "../stats/soldierStats";
import type { BattleBase, Soldier, Team } from "../types";
import { startEngagement } from "./aiSystem";
import { applyBaseAttackBounce } from "./baseAttackBounceSystem";
import { getBaseAttackSurfaceRect } from "./battlefieldGeometry";
import { damageBase } from "./baseSystem";
import { isValidCombatTarget } from "./combatTargetSystem";
import { calculateBaseAttackDamage, hasSpecialAbility } from "./specialAbilitySystem";
import { recordBaseAttack } from "./meritSystem";

export interface SoldierPosition { x: number; y: number }

export function captureSoldierPositions(soldiers: readonly Soldier[]): Map<string, SoldierPosition> {
  return new Map(soldiers.map((soldier) => [soldier.id, { x: soldier.x, y: soldier.y }]));
}

function randomSlotIndex(random: RandomSource): number {
  const value = Math.max(0, Math.min(0.999999999, random()));
  return Math.floor(value * SOLDIERS_PER_TEAM);
}

/**
 * Mirrors the SWF's two independent 30-slot draws. Missing/dead slot semantics
 * are intentionally not invented: the runtime army slot remains selectable,
 * and only the presence of FORTIFY on that selected slot matters.
 */
export function isBaseHitBlockedByFortify(
  attacker: Soldier,
  defendingSlots: readonly Soldier[],
  random: RandomSource = Math.random,
): boolean {
  if (attacker.unitType === "NINJA") return false;
  for (let attempt = 0; attempt < BASE_CONTACT_CONFIG.fortifyAttempts; attempt += 1) {
    const selected = defendingSlots[randomSlotIndex(random)];
    if (selected && hasSpecialAbility(selected, "FORTIFY")
      && random() < BASE_CONTACT_CONFIG.fortifySuccessChance) return true;
  }
  return false;
}

function crossedAttackSurface(
  attacker: Soldier,
  previous: SoldierPosition,
  base: BattleBase,
): boolean {
  const surface = getBaseAttackSurfaceRect(base);
  const contactX = base.team === "enemy"
    ? surface.x - SOLDIER_RADIUS
    : surface.x + surface.width + SOLDIER_RADIUS;
  const deltaX = attacker.x - previous.x;
  const crossed = base.team === "enemy"
    ? previous.x < contactX && attacker.x >= contactX
    : previous.x > contactX && attacker.x <= contactX;
  if (!crossed || deltaX === 0) return false;
  const progress = (contactX - previous.x) / deltaX;
  const crossingY = previous.y + (attacker.y - previous.y) * progress;
  return crossingY >= surface.y - SOLDIER_RADIUS
    && crossingY <= surface.y + surface.height + SOLDIER_RADIUS;
}

function canTriggerBaseContact(attacker: Soldier, base: BattleBase): boolean {
  if (attacker.isDead || attacker.hp <= 0 || attacker.team === base.team || base.isDestroyed || base.hp <= 0) return false;
  if (attacker.state !== "NORMAL" || attacker.reactionState !== "NONE" || attacker.isConfused) return false;
  return attacker.temporaryOrder?.type !== "DEFEND_ORDER" && attacker.temporaryOrder?.type !== "RALLY";
}

function aggroBaseDefenders(defenders: readonly Soldier[], attacker: Soldier, currentTime: number): void {
  for (const defender of defenders) {
    if ((defender.strategy !== "defend" && defender.strategy !== "intercept")
      || defender.isDead || defender.hp <= 0 || defender.state !== "NORMAL"
      || defender.reactionState !== "NONE" || defender.temporaryOrder
      || !isValidCombatTarget(defender, attacker)) continue;
    startEngagement(defender, attacker, currentTime);
  }
}

/** Resolve one logic update of SWF-style movement-contact base attacks. */
export function resolveBaseMovementContacts(
  soldiers: Soldier[],
  bases: readonly BattleBase[],
  previousPositions: ReadonlyMap<string, SoldierPosition>,
  currentTime: number,
  random: RandomSource = Math.random,
): Team | null {
  for (const attacker of soldiers) {
    if (attacker.baseContactLockTicks > 0) {
      attacker.baseContactLockTicks -= 1;
      continue;
    }
    const previous = previousPositions.get(attacker.id);
    if (!previous || (previous.x === attacker.x && previous.y === attacker.y)) continue;
    const base = bases.find((candidate) => candidate.team !== attacker.team);
    if (!base || !canTriggerBaseContact(attacker, base) || !crossedAttackSurface(attacker, previous, base)) continue;

    const defenders = soldiers.filter((soldier) => soldier.team === base.team);
    const blocked = isBaseHitBlockedByFortify(attacker, defenders, random);
    if (!blocked) {
      const appliedDamage = damageBase(base, calculateBaseAttackDamage(attacker));
      if (appliedDamage > 0) recordBaseAttack(attacker, base.isDestroyed);
      aggroBaseDefenders(defenders, attacker, currentTime);
    }
    applyBaseAttackBounce(attacker, base, defenders);
    if (attacker.temporaryOrder?.type === "JINTO_CHARGE") {
      attacker.temporaryOrder = null;
      attacker.moveTargetX = null;
      attacker.moveTargetY = null;
    }
    attacker.baseContactLockTicks = BASE_CONTACT_CONFIG.lockLogicUpdates;
    if (base.isDestroyed) return base.team;
  }
  return null;
}
