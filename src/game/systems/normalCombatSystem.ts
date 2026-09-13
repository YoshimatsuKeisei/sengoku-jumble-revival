import { BATTLE_OBSTACLES, STRATEGY_AI_CONFIG } from "../config";
import type { RandomSource } from "../stats/soldierStats";
import type { Soldier } from "../types";
import { startEngagement } from "./aiSystem";
import { canStartSoldierAttack, startSoldierAttack } from "./attackRuntime";
import { isValidCombatTarget } from "./combatTargetSystem";
import { getRawCloseEngagementPoint } from "./engagementPositioningSystem";
import { recordNormalCombatResult } from "./meritSystem";
import { hasSpecialAbility } from "./specialAbilitySystem";
import {
  consumeSwfSelectedEnemyContactPairs,
  type SwfSelectedEnemyContactPair,
} from "./swfContactCandidateSelection";
import {
  getSwfContactWinProbability,
  resolveSwfContactContest,
} from "./swfContactContestSystem";
import { consumeSwfSelectedContactBranchOutcome } from "./swfSelectedContactBranchRuntime";
import { isWithinNormalContact } from "./techniqueCombatProfiles";

export const getCombatWinProbability = getSwfContactWinProbability;
export const resolveCombatContest = resolveSwfContactContest;

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
  if (canReceiveNormalContactEngagement(defender)) {
    if (isRushCharge(defender)) random();
    startEngagement(defender, attacker, currentTime);
  }

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

function pairKey(first: Soldier, second: Soldier): string {
  return first.id < second.id
    ? `${first.id}\u0000${second.id}`
    : `${second.id}\u0000${first.id}`;
}

function findSelectedPairSoldiers(
  soldiers: Soldier[],
  pair: SwfSelectedEnemyContactPair,
): [Soldier, Soldier] | null {
  const current = soldiers.find((soldier) => soldier.id === pair.currentId) ?? null;
  const candidate = soldiers.find((soldier) => soldier.id === pair.candidateId) ?? null;
  return current && candidate ? [current, candidate] : null;
}

function finishStartedSelectedContact(
  soldiers: Soldier[],
  first: Soldier,
  second: Soldier,
  currentTime: number,
  random: RandomSource,
): boolean {
  const outcome = consumeSwfSelectedContactBranchOutcome(soldiers, first, second);
  if (!outcome) return false;
  const attacker = soldiers.find((soldier) => soldier.id === outcome.attackerId) ?? null;
  const defender = soldiers.find((soldier) => soldier.id === outcome.defenderId) ?? null;
  if (!attacker || !defender) return true;
  applyNormalContactEngagements(attacker, defender, currentTime, random);
  recordNormalCombatResult(attacker, defender);
  return true;
}

function tryResolveSelectedRawContact(
  first: Soldier,
  second: Soldier,
  currentTime: number,
  random: RandomSource,
): boolean {
  if (!isContactPair(first, second)) return false;
  if (!canStartSoldierAttack(first, second, currentTime)
    || !canStartSoldierAttack(second, first, currentTime)) return false;

  const attacker = resolveSwfContactContest(first, second, random);
  const defender = attacker === first ? second : first;
  if (!startSoldierAttack(attacker, defender, currentTime)) return false;
  applyNormalContactEngagements(attacker, defender, currentTime, random);
  recordNormalCombatResult(attacker, defender);
  return true;
}

function resolveLegacyContactPair(
  first: Soldier,
  second: Soldier,
  currentTime: number,
  random: RandomSource,
): void {
  if (!isContactPair(first, second)) return;
  const attacker = resolveSwfContactContest(first, second, random);
  const defender = attacker === first ? second : first;
  applyNormalContactEngagements(attacker, defender, currentTime, random);
  applyRawClosePairSpacing(first, second);
  if (startSoldierAttack(attacker, defender, currentTime)) recordNormalCombatResult(attacker, defender);
}

export function updateNormalCombatContests(
  soldiers: Soldier[],
  currentTime: number,
  random: RandomSource = Math.random,
): void {
  const selectedPairs = consumeSwfSelectedEnemyContactPairs(soldiers);
  const resolvedSelectedPairs = new Set<string>();

  for (const selectedPair of selectedPairs) {
    const pair = findSelectedPairSoldiers(soldiers, selectedPair);
    if (!pair) continue;
    const [first, second] = pair;
    if (finishStartedSelectedContact(soldiers, first, second, currentTime, random)
      || tryResolveSelectedRawContact(first, second, currentTime, random)) {
      resolvedSelectedPairs.add(pairKey(first, second));
    }
  }

  for (let firstIndex = 0; firstIndex < soldiers.length; firstIndex += 1) {
    const first = soldiers[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < soldiers.length; secondIndex += 1) {
      const second = soldiers[secondIndex];
      if (resolvedSelectedPairs.has(pairKey(first, second))) continue;
      resolveLegacyContactPair(first, second, currentTime, random);
    }
  }
}
