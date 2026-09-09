import { BASE_CONTACT_CONFIG, SOLDIERS_PER_TEAM } from "../config";
import type { RandomSource } from "../stats/soldierStats";
import type { BattleBase, Soldier, Team } from "../types";
import { startEngagement } from "./aiSystem";
import { applyBaseAttackBounce } from "./baseAttackBounceSystem";
import { damageBase } from "./baseSystem";
import { isValidCombatTarget } from "./combatTargetSystem";
import { recordBaseAttack } from "./meritSystem";
import { calculateBaseAttackDamage, hasSpecialAbility } from "./specialAbilitySystem";
import { getSwfBaseCollisionCodeAtWorld, getSwfBaseDamageTileForTeam } from "./swfBaseCollisionGrid";

export interface SoldierPosition { x: number; y: number }

export function captureSoldierPositions(soldiers: readonly Soldier[]): Map<string, SoldierPosition> {
  return new Map(soldiers.map((soldier) => [soldier.id, { x: soldier.x, y: soldier.y }]));
}

function randomSlotIndex(random: RandomSource): number {
  const value = Math.max(0, Math.min(0.999999999, random()));
  return Math.floor(value * SOLDIERS_PER_TEAM);
}

/**
 * Raw mkjn()/ekjn(): exactly two roster-slot draws. A selected FORTIFY holder
 * blocks only when Math.random()*100 > 50. The loop never returns early; the
 * last successful holder is retained, so all source RNG draws must be consumed.
 */
export function isBaseHitBlockedByFortify(
  attacker: Soldier,
  defendingSlots: readonly Soldier[],
  random: RandomSource = Math.random,
): boolean {
  if (attacker.unitType === "NINJA") return false;
  let blocked = false;
  for (let attempt = 0; attempt < BASE_CONTACT_CONFIG.fortifyAttempts; attempt += 1) {
    const selected = defendingSlots[randomSlotIndex(random)];
    if (selected && hasSpecialAbility(selected, "FORTIFY")
      && random() * 100 > 50) blocked = true;
  }
  return blocked;
}

function enteredSwfBaseDamageCell(
  attacker: Soldier,
  previous: SoldierPosition,
  base: BattleBase,
): boolean {
  const currentCode = getSwfBaseCollisionCodeAtWorld(attacker);
  if (currentCode !== getSwfBaseDamageTileForTeam(base.team)) return false;
  return getSwfBaseCollisionCodeAtWorld(previous) !== currentCode;
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

/**
 * Resolve one logic update of the SWF base-contact branch. The original battle
 * code samples the next position through f[round(x / 36)][round(y / 36)] and
 * treats only tile 996/997 as base damage. It arms fx/k before resolving damage.
 */
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
    if (!base || !canTriggerBaseContact(attacker, base) || !enteredSwfBaseDamageCell(attacker, previous, base)) continue;

    const defenders = soldiers.filter((soldier) => soldier.team === base.team);

    // Direct AVM1: 996/997 assigns fx and k=10 before the damage/fortify branch.
    applyBaseAttackBounce(attacker, base, defenders);
    attacker.baseContactLockTicks = BASE_CONTACT_CONFIG.lockLogicUpdates;

    const blocked = isBaseHitBlockedByFortify(attacker, defenders, random);
    if (!blocked) {
      const attackDamage = calculateBaseAttackDamage(attacker);
      const appliedDamage = damageBase(base, attackDamage);
      // Raw d() adds rsj by the attempted base-hit value (1, or 2 with s8)
      // before clamping base HP to zero. A finishing s8 hit therefore still
      // earns two base-attack merit points even when only one HP remained.
      if (appliedDamage > 0) recordBaseAttack(attacker, attackDamage);
      aggroBaseDefenders(defenders, attacker, currentTime);
    }
    if (attacker.temporaryOrder?.type === "JINTO_CHARGE") {
      attacker.temporaryOrder = null;
      attacker.moveTargetX = null;
      attacker.moveTargetY = null;
    }
    if (base.isDestroyed) return base.team;
  }
  return null;
}
