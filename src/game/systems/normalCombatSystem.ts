import { BATTLE_OBSTACLES, STRATEGY_AI_CONFIG } from "../config";
import type { RandomSource } from "../stats/soldierStats";
import type { Soldier } from "../types";
import { startEngagement } from "./aiSystem";
import { startSoldierAttack } from "./attackSystem";
import { isValidCombatTarget } from "./combatTargetSystem";
import { getRawCloseEngagementPoint } from "./engagementPositioningSystem";
import { recordNormalCombatResult } from "./meritSystem";
import { hasSpecialAbility } from "./specialAbilitySystem";
import { isWithinNormalContact } from "./techniqueCombatProfiles";

export function getCombatWinProbability(combatA: number, combatB: number): number {
  const valueA = Math.max(0, combatA);
  const valueB = Math.max(0, combatB);
  const scale = Math.max(valueA, valueB);
  if (scale === 0) return 0.5;
  // Raw shk() stores the raw combat value separately and replaces pw with pow(raw, 3).
  const weightA = (valueA / scale) ** 3;
  const weightB = (valueB / scale) ** 3;
  return weightA / (weightA + weightB);
}

export function resolveCombatContest(a: Soldier, b: Soldier, random: RandomSource = Math.random): Soldier {
  return random() < getCombatWinProbability(a.stats.combat, b.stats.combat) ? a : b;
}

function isContactPair(a: Soldier, b: Soldier): boolean {
  if (!isValidCombatTarget(a, b) || !isValidCombatTarget(b, a)) return false;
  if (a.activeSpecialTechnique !== null || b.activeSpecialTechnique !== null) return false;
  return isWithinNormalContact(a, b);
}

function isRushCharge(soldier: Soldier): boolean {
  return soldier.strategy === "charge" && hasSpecialAbility(soldier, "RUSH");
}

function canReceiveNormalContactEngagement(soldier: Soldier): boolean {
  return !soldier.isDead && soldier.hp > 0 && soldier.state === "NORMAL";
}

function applyNormalContactEngagements(
  attacker: Soldier,
  defender: Soldier,
  currentTime: number,
  random: RandomSource,
): void {
  // Raw atck(sa=defender, sb=attacker, mode=0): defender has the mode==0
  // fallback and therefore receives l=attacker whenever its state is eligible.
  if (canReceiveNormalContactEngagement(defender)) {
    if (isRushCharge(defender)) random();
    startEngagement(defender, attacker, currentTime);
  }

  // The attack-side RUSH branch has no mode==0 fallback. Exactly 70 belongs
  // to the keep-prior-target side because the raw retarget test is >70.
  if (!canReceiveNormalContactEngagement(attacker)) return;
  const rushKeepsPriorTarget = isRushCharge(attacker)
    && random() <= STRATEGY_AI_CONFIG.rushRetargetIgnoreChance;
  if (!rushKeepsPriorTarget) startEngagement(attacker, defender, currentTime);
}

function applyRawClosePairSpacing(first: Soldier, second: Soldier): void {
  const firstPoint = getRawCloseEngagementPoint(first, second, BATTLE_OBSTACLES);
  if (firstPoint) { first.x = firstPoint.x; first.y = firstPoint.y; }
  const secondPoint = getRawCloseEngagementPoint(second, first, BATTLE_OBSTACLES);
  if (secondPoint) { second.x = secondPoint.x; second.y = secondPoint.y; }
}

/** Resolves every unordered normal-contact pair at most once in this update. */
export function updateNormalCombatContests(
  soldiers: Soldier[],
  currentTime: number,
  random: RandomSource = Math.random,
): void {
  for (let firstIndex = 0; firstIndex < soldiers.length; firstIndex += 1) {
    const first = soldiers[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < soldiers.length; secondIndex += 1) {
      const second = soldiers[secondIndex];
      if (!isContactPair(first, second)) continue;
      const attacker = resolveCombatContest(first, second, random);
      const defender = attacker === first ? second : first;
      applyNormalContactEngagements(attacker, defender, currentTime, random);
      applyRawClosePairSpacing(first, second);
      if (startSoldierAttack(attacker, defender, currentTime)) recordNormalCombatResult(attacker, defender);
    }
  }
}
