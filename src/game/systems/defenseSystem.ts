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

  // Raw atck() first lets s19 clear the ss=1 special-defense bypass, then
  // consumes the ordinary random*200 defense roll. Even an unguardable ss=1
  // special consumes that roll before the final ss check.
  const specialBypassesDefense = damageKind === "SPECIAL_ATTACK"
    && (!soldier || !hasSpecialAbility(soldier, "FORESIGHT"));
  const defense = soldier ? getEffectiveDefenseForAttack(soldier, damageKind) : defender.stats.defense;
  let defenseRoll = random() * DEFENSE_CONFIG.randomScale;

  // Direct AVM1 ch==6 attacker / ch==7 defender path: teppou against ninja
  // forces the roll to 999 and jumps past s12, so it is a forced hit and HORO
  // does not consume a second random value on this path.
  if (damageKind === "GUN_ATTACK" && attacker?.unitType === "TEPPOU" && soldier?.unitType === "NINJA") {
    defenseRoll = 999;
    return false;
  }

  // s12 is evaluated after the ordinary defense roll and overwrites that roll
  // with zero only on strict random*100 > 30. Thus it applies to every
  // guard-capable atck() path (normal/ranged, and ss=1 only after s19).
  if (soldier && hasSpecialAbility(soldier, "HORO") && random() * 100 > 30) defenseRoll = 0;

  return !specialBypassesDefense && defenseRoll <= defense;
}
