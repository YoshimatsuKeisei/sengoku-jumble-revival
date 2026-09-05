import { DEFENSE_CONFIG, NINJA_CONFIG, PROTOTYPE_DEFENSE_MAX } from "../config";
import type { RandomSource } from "../stats/soldierStats";
import type { AttackKind, Soldier } from "../types";
import { getEffectiveDefenseForAttack, hasSpecialAbility } from "./specialAbilitySystem";

export function getNormalGuardProbability(defense: number): number {
  const normalized = Math.max(0, Math.min(1, defense / PROTOTYPE_DEFENSE_MAX));
  return DEFENSE_CONFIG.maxGuardRate * normalized;
}

export function isDamageGuarded(
  defender: Pick<Soldier, "stats">,
  damageKind: AttackKind,
  random: RandomSource = Math.random,
): boolean {
  if (damageKind === "TRAP") return false;
  if (damageKind === "SPECIAL_ATTACK" && (!('specialAbilities' in defender) || !hasSpecialAbility(defender as Soldier, "FORESIGHT"))) return false;
  if (damageKind === "GUN_ATTACK") {
    if (!('specialAbilities' in defender)) return false;
    const soldier = defender as Soldier; const foresight = hasSpecialAbility(soldier, "FORESIGHT");
    if (soldier.unitType !== "NINJA" && !foresight) return false;
    const multiplier = soldier.unitType === "NINJA"
      ? (foresight ? NINJA_CONFIG.foresightGunDefenseMultiplier : NINJA_CONFIG.gunDefenseMultiplier) : 1;
    return random() < getNormalGuardProbability(soldier.stats.defense * multiplier);
  }
  if (damageKind === "ARROW_ATTACK" && (!('specialAbilities' in defender)
    || (!hasSpecialAbility(defender as Soldier, "HORO") && !hasSpecialAbility(defender as Soldier, "FORESIGHT")))) return false;
  return random() < getNormalGuardProbability('specialAbilities' in defender
    ? getEffectiveDefenseForAttack(defender as Soldier, damageKind) : defender.stats.defense);
}
