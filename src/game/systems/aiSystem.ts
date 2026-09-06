import { BATTLEFIELD_CONFIG, COMMAND_CONFIG, STRATEGY_AI_CONFIG } from "../config";
import {
  BATTLEFIELD_STRATEGY_SOURCE_GEOMETRY,
  BATTLEFIELD_STRATEGY_WORLD_GEOMETRY,
  battlefieldSourcePointToWorld,
  battlefieldWorldPointToSource,
} from "../battlefieldLayout";
import type { RandomSource } from "../stats/soldierStats";
import type { Soldier, StrategyObjectiveKind, Team } from "../types";
import { clearApproachRuntime } from "./engagementPositioningSystem";
import { isValidCombatTarget } from "./combatTargetSystem";
import { getNormalContactBounds } from "./techniqueCombatProfiles";

export function distanceBetween(a: Pick<Soldier, "x" | "y">, b: Pick<Soldier, "x" | "y">): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function findNearestEnemy(soldier: Soldier, soldiers: Soldier[]): Soldier | null {
  return findNearestEnemyWithinRange(soldier, soldiers, Number.POSITIVE_INFINITY);
}

export function findNearestEnemyWithinRange(soldier: Soldier, soldiers: Soldier[], range: number): Soldier | null {
  let nearest: Soldier | null = null;
  let nearestDistance = range;
  for (const candidate of soldiers) {
    if (!isValidCombatTarget(soldier, candidate)) continue;
    const distance = distanceBetween(soldier, candidate);
    if (distance <= nearestDistance) { nearest = candidate; nearestDistance = distance; }
  }
  return nearest;
}

function targetById(soldier: Soldier, soldiers: Soldier[]): Soldier | null {
  if (!soldier.targetId) return null;
  return soldiers.find((candidate) => candidate.id === soldier.targetId) ?? null;
}

export function startEngagement(soldier: Soldier, target: Soldier, currentTime: number): void {
  if (soldier.targetId !== target.id) clearApproachRuntime(soldier);
  soldier.targetId = target.id;
  soldier.engagementStartedAt = currentTime;
  soldier.engagementOriginX = soldier.x;
  soldier.engagementOriginY = soldier.y;
}

export function clearEngagement(soldier: Soldier): void {
  soldier.targetId = null;
  soldier.engagementStartedAt = null;
  soldier.engagementOriginX = null;
  soldier.engagementOriginY = null;
  clearApproachRuntime(soldier);
}

function setStrategyObjective(soldier: Soldier, kind: StrategyObjectiveKind, x: number, y: number): void {
  soldier.strategyObjectiveKind = kind;
  soldier.strategyObjectiveX = x;
  soldier.strategyObjectiveY = y;
  soldier.moveTargetX = x;
  soldier.moveTargetY = y;
}

function clearInvalidEngagement(soldier: Soldier, soldiers: Soldier[]): Soldier | null {
  const current = targetById(soldier, soldiers);
  if (soldier.targetId && !isValidCombatTarget(soldier, current)) clearEngagement(soldier);
  return isValidCombatTarget(soldier, current) ? current : null;
}

function beginNearestEngagement(soldier: Soldier, soldiers: Soldier[], range: number, currentTime: number): void {
  const target = findNearestEnemyWithinRange(soldier, soldiers, range);
  if (target) startEngagement(soldier, target, currentTime);
}

export function getEnemyEffectiveX(enemy: Pick<Soldier, "x" | "velocityX">): number {
  return enemy.x + enemy.velocityX;
}

export function findFrontmostInvader(defender: Soldier, soldiers: Soldier[], thresholdX: number): Soldier | null {
  const candidates = soldiers.filter((candidate) => isValidCombatTarget(defender, candidate));
  if (candidates.length === 0) return null;
  const frontmost = candidates.reduce((best, candidate) => {
    const candidateX = getEnemyEffectiveX(candidate);
    const bestX = getEnemyEffectiveX(best);
    return defender.team === "player" ? (candidateX < bestX ? candidate : best) : (candidateX > bestX ? candidate : best);
  });
  const effectiveX = getEnemyEffectiveX(frontmost);
  return defender.team === "player"
    ? (effectiveX <= thresholdX ? frontmost : null)
    : (effectiveX >= thresholdX ? frontmost : null);
}

function teamThreshold(team: Team, kind: "defend" | "intercept"): number {
  return BATTLEFIELD_STRATEGY_WORLD_GEOMETRY[`${kind}FrontLineX`][team];
}

function updateDefenderPursuitObjective(defender: Soldier, target: Soldier): void {
  const enemyPassedDefender = (target.x - defender.x) * (defender.team === "player" ? 1 : -1) < 0;
  const verticallySeparated = Math.abs(target.y - defender.y) > getNormalContactBounds().y;
  if (!enemyPassedDefender && !verticallySeparated) return;
  setStrategyObjective(
    defender,
    "SEEK_COMBAT",
    Math.max(0, Math.min(BATTLEFIELD_CONFIG.width, target.x + target.velocityX * STRATEGY_AI_CONFIG.defendPredictionTicks)),
    Math.max(0, Math.min(BATTLEFIELD_CONFIG.height, target.y + target.velocityY * STRATEGY_AI_CONFIG.defendPredictionTicks)),
  );
}

export function updateChargeAI(soldier: Soldier, soldiers: Soldier[], _currentTime = 0): void {
  setStrategyObjective(
    soldier,
    "ENEMY_SIDE",
    BATTLEFIELD_STRATEGY_WORLD_GEOMETRY.chargeDestinationX[soldier.team],
    soldier.y,
  );
  clearInvalidEngagement(soldier, soldiers);
  // Retaliation and explicit combat events may assign a target. Charge itself
  // never performs proactive nearest-enemy acquisition.
}

export function updateDefendAI(soldier: Soldier, soldiers: Soldier[], currentTime = 0): void {
  setStrategyObjective(soldier, "ANCHOR", soldier.anchorX, soldier.anchorY);
  const current = clearInvalidEngagement(soldier, soldiers);
  if (current) {
    updateDefenderPursuitObjective(soldier, current);
    return;
  }
  const target = findFrontmostInvader(soldier, soldiers, teamThreshold(soldier.team, "defend"));
  if (target) {
    startEngagement(soldier, target, currentTime);
    updateDefenderPursuitObjective(soldier, target);
  }
}

export function updateInterceptAI(soldier: Soldier, soldiers: Soldier[], currentTime = 0): void {
  setStrategyObjective(soldier, "INTERCEPT_POINT", soldier.anchorX, soldier.anchorY);
  const current = clearInvalidEngagement(soldier, soldiers);
  if (current) return;
  const target = findFrontmostInvader(soldier, soldiers, teamThreshold(soldier.team, "intercept"));
  if (target) startEngagement(soldier, target, currentTime);
}

function randomIndex(length: number, random: RandomSource): number {
  return Math.min(length - 1, Math.floor(Math.max(0, Math.min(0.999999999, random())) * length));
}

function setRandomMeleeObjective(soldier: Soldier, random: RandomSource): void {
  const source = BATTLEFIELD_STRATEGY_SOURCE_GEOMETRY.meleeRoamRect;
  const point = battlefieldSourcePointToWorld({
    x: source.x + random() * source.width,
    y: source.y + random() * source.height,
  });
  setStrategyObjective(soldier, "RANDOM_ROAM", point.x, point.y);
}

function hasReachedRandomMeleeObjective(soldier: Soldier): boolean {
  const current = battlefieldWorldPointToSource(soldier);
  const target = battlefieldWorldPointToSource({ x: soldier.strategyObjectiveX, y: soldier.strategyObjectiveY });
  return Math.abs(current.x - target.x) + Math.abs(current.y - target.y)
    < BATTLEFIELD_STRATEGY_SOURCE_GEOMETRY.meleeArrivalManhattanDistance;
}

function selectRandomMeleeTarget(soldier: Soldier, soldiers: Soldier[], currentTime: number, random: RandomSource): void {
  const enemySlots = soldiers.filter((candidate) => candidate.team !== soldier.team && candidate !== soldier);
  const selected = enemySlots.length > 0 ? enemySlots[randomIndex(enemySlots.length, random)] : null;
  if (isValidCombatTarget(soldier, selected)) {
    startEngagement(soldier, selected, currentTime);
    setStrategyObjective(soldier, "SEEK_COMBAT", selected.x, selected.y);
  } else {
    setRandomMeleeObjective(soldier, random);
  }
}

export function updateMeleeAI(
  soldier: Soldier,
  soldiers: Soldier[],
  currentTime = 0,
  random: RandomSource = Math.random,
): void {
  const hadTarget = soldier.targetId !== null;
  const current = clearInvalidEngagement(soldier, soldiers);
  if (current) return;
  if (hadTarget) {
    setRandomMeleeObjective(soldier, random);
    return;
  }
  if (soldier.strategyObjectiveKind === "RANDOM_ROAM" && !hasReachedRandomMeleeObjective(soldier)) return;
  selectRandomMeleeTarget(soldier, soldiers, currentTime, random);
}

export function updateWaitAI(soldier: Soldier, soldiers: Soldier[], _currentTime = 0): void {
  setStrategyObjective(soldier, "ANCHOR", soldier.anchorX, soldier.anchorY);
  clearInvalidEngagement(soldier, soldiers);
  // Wait never acquires a target proactively. Retaliation targets are retained
  // until invalid, after which this objective returns the unit to its anchor.
}

export function isAtAnchor(soldier: Soldier): boolean {
  return Math.hypot(soldier.x - soldier.anchorX, soldier.y - soldier.anchorY) <= STRATEGY_AI_CONFIG.returnRadius;
}

export function updateAiTargets(soldiers: Soldier[], currentTime = 0, random: RandomSource = Math.random): void {
  for (const soldier of soldiers) {
    if (soldier.isDead || soldier.isConfused || soldier.controller !== "ai" || soldier.reactionState !== "NONE"
      || soldier.state !== "NORMAL" || (soldier.temporaryOrder && soldier.temporaryOrder.type !== "DEFEND_ORDER")) continue;
    if (soldier.temporaryOrder?.type === "DEFEND_ORDER") {
      const current = targetById(soldier, soldiers);
      if (current && isValidCombatTarget(soldier, current) && distanceBetween(soldier, current) <= COMMAND_CONFIG.defendRadius) continue;
      if (current) clearEngagement(soldier);
      beginNearestEngagement(soldier, soldiers, COMMAND_CONFIG.defendRadius, currentTime);
      continue;
    }
    switch (soldier.strategy) {
      case "charge": updateChargeAI(soldier, soldiers, currentTime); break;
      case "defend": updateDefendAI(soldier, soldiers, currentTime); break;
      case "intercept": updateInterceptAI(soldier, soldiers, currentTime); break;
      case "melee": updateMeleeAI(soldier, soldiers, currentTime, random); break;
      case "wait": updateWaitAI(soldier, soldiers, currentTime); break;
    }
  }
}
