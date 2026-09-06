import { DEFENSE_CONFIG } from "../config";
import type { RandomSource } from "../stats/soldierStats";
import type { AttackKind, Soldier } from "../types";
import { getEffectiveDefenseForAttack, hasSpecialAbility } from "./specialAbilitySystem";

export function getNormalGuardProbability(defense: number): number {
  return Math.max(0, Math.min(1, defense / DEFENSE_CONFIG.randomScale));
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
  if (damageKind === "GUN_ATTACK" && attacker?.unitType === "TEPPOU" && soldier?.unitType === "NINJA") return false;
  if (soldier && hasSpecialAbility(soldier, "HORO") && random() < DEFENSE_CONFIG.horoForcedGuardChance) return true;
  const defense = soldier ? getEffectiveDefenseForAttack(soldier, damageKind) : defender.stats.defense;
  return random() * DEFENSE_CONFIG.randomScale <= defense;
}
