import { DEFENSE_CONFIG } from "../config";
import type { RandomSource } from "../stats/soldierStats";
import type { AttackKind, Soldier } from "../types";
import { getEffectiveDefenseForAttack, hasSpecialAbility } from "./specialAbilitySystem";

export function getNormalGuardProbability(defense: number): number {
  return Math.max(0, Math.min(1, defense / DEFENSE_CONFIG.randomScale));
}

/**
 * Raw mode-0 atck() defense gate for ordinary melee contact.
 *
 * AVM1 order is important:
 * 1. consume the ordinary Math.random()*200 defense roll first;
 * 2. when defender has s12/HORO, consume a second Math.random()*100 roll;
 * 3. HORO forces the defense roll to 0 only when that second roll is strictly >30;
 * 4. otherwise compare the original roll with df using <= for guard.
 *
 * Keep this separate from the general ranged/special helper so integrating raw
 * normal-contact RNG ordering cannot perturb already-approved ranged behavior.
 */
export function isRawNormalContactGuarded(
  defender: Soldier,
  random: RandomSource = Math.random,
): boolean {
  const defenseRoll = random() * DEFENSE_CONFIG.randomScale;
  if (hasSpecialAbility(defender, "HORO")) {
    const horoRollPercent = random() * 100;
    if (horoRollPercent > 30) return true;
  }
  const defense = getEffectiveDefenseForAttack(defender, "NORMAL_ATTACK");
  return defenseRoll <= defense;
}

export function isDamageGuarded(
  defender: Pick<Soldier, "stats">,
  damageKind: AttackKind,
  random: RandomSource = Math.random,
  attacker?: Pick<Soldier, "unitType">,
): boolean {
  if (damageKind === "TRAP") return false;
  const soldier = "specialAbilities" in defender ? defender as Soldier : null;
  if (damageKind === "SPECIAL_ATTACK" && (!soldier || !hasSpecialAbility(soldier, "FORESIGHT"))) return false;
  // The original gun branch forces the defense roll high against every class
  // except ninja. Ninja therefore still reaches HORO/the normal defense roll.
  if (damageKind === "GUN_ATTACK" && attacker?.unitType === "TEPPOU" && soldier?.unitType !== "NINJA") return false;
  const isRangedDefense = damageKind === "ARROW_ATTACK" || damageKind === "GUN_ATTACK";
  if (soldier && isRangedDefense && hasSpecialAbility(soldier, "HORO")
    && random() > 1 - DEFENSE_CONFIG.horoForcedGuardChance) return true;
  const defense = soldier ? getEffectiveDefenseForAttack(soldier, damageKind) : defender.stats.defense;
  return random() * DEFENSE_CONFIG.randomScale <= defense;
}
