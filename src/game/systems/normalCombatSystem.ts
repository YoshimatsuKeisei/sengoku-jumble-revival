import { BATTLE_OBSTACLES, STRATEGY_AI_CONFIG } from "../config";
import type { RandomSource } from "../stats/soldierStats";
import type { Soldier } from "../types";
import { startEngagement } from "./aiSystem";
import { startSoldierAttack } from "./attackSystem";
import { isValidCombatTarget } from "./combatTargetSystem";
import { getRawCloseEngagementPoint } from "./engagementPositioningSystem";
import { hasSpecialAbility } from "./specialAbilitySystem";
import { isWithinNormalContact } from "./techniqueCombatProfiles";

export function getCombatWinProbability(combatA: number, combatB: number): number {
  const valueA = Math.max(0, combatA);
  const valueB = Math.max(0, combatB);
  const scale = Math.max(valueA, valueB);
  if (scale === 0) return 0.5;
  // Raw shk stores pw2=raw combat and replaces pw with pow(raw combat, 3).
  // Scaling before cubing preserves that ratio while avoiding overflow for debug values.
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
  // Raw atck only assigns l while p<89. NORMAL is the reconstruction-side
  // equivalent; retreat/healing/rejoin states must not acquire a new l.
  return !soldier.isDead && soldier.hp > 0 && soldier.state === "NORMAL";
}

function applyNormalContactEngagements(
  attacker: Soldier,
  defender: Soldier,
  currentTime: number,
  random: RandomSource,
): void {
  // atck(sa=defender, sb=attacker, mode=0): the defender's s7 branch still
  // evaluates its random test, but mode==0 is the final fallback and therefore
  // normal contact always assigns defender.l=attacker when the state is eligible.
  if (canReceiveNormalContactEngagement(defender)) {
    if (isRushCharge(defender)) random();
    startEngagement(defender, attacker, currentTime);
  }

  // The attacker's l assignment has no mode==0 fallback. For a charge soldier
  // carrying raw s7 (RUSH), random*100 must be >70 to retarget; <=70 preserves
  // its previous l. Other normal strategies retarget unconditionally.
  if (!canReceiveNormalContactEngagement(attacker)) return;
  const rushKeepsPriorTarget = isRushCharge(attacker)
    && random() <= STRATEGY_AI_CONFIG.rushRetargetIgnoreChance;
  if (!rushKeepsPriorTarget) startEngagement(attacker, defender, currentTime);
}

function applyRawClosePairSpacing(first: Soldier, second: Soldier): void {
  // d() applies the 20-axis / 24-unit correction only to a unit that already
  // has l. Process roster order just like the original per-unit frame loop;
  // after the first correction the pair is normally no longer inside <20.
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
      startSoldierAttack(attacker, defender, currentTime);
    }
  }
}
