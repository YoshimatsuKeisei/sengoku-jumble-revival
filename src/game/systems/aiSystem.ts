import { BATTLEFIELD_CONFIG, STRATEGY_ENGAGEMENT_CONFIG } from "../config";
import type { Soldier, Strategy, StrategyObjectiveKind } from "../types";
import { clearApproachRuntime } from "./engagementPositioningSystem";
import { getBaseCenter } from "./battlefieldGeometry";
import { isValidCombatTarget } from "./combatTargetSystem";

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

function engagementTimedOut(soldier: Soldier, strategy: Strategy, currentTime: number): boolean {
  return soldier.engagementStartedAt !== null
    && currentTime - soldier.engagementStartedAt >= STRATEGY_ENGAGEMENT_CONFIG[strategy].maxEngagementMs;
}

function movedBeyondEngagementOrigin(soldier: Soldier, strategy: Strategy): boolean {
  if (soldier.engagementOriginX === null || soldier.engagementOriginY === null) return false;
  return Math.hypot(soldier.x - soldier.engagementOriginX, soldier.y - soldier.engagementOriginY)
    > STRATEGY_ENGAGEMENT_CONFIG[strategy].maxPursuitDistance;
}

function isCommonTargetValid(soldier: Soldier, target: Soldier | null, currentTime: number): target is Soldier {
  return isValidCombatTarget(soldier, target)
    && !engagementTimedOut(soldier, soldier.strategy, currentTime)
    && !movedBeyondEngagementOrigin(soldier, soldier.strategy);
}

function beginNearestEngagement(soldier: Soldier, soldiers: Soldier[], range: number, currentTime: number): void {
  const target = findNearestEnemyWithinRange(soldier, soldiers, range);
  if (target) startEngagement(soldier, target, currentTime);
}

export function updateChargeAI(soldier: Soldier, soldiers: Soldier[], currentTime = 0): void {
  const enemyBasePosition = getBaseCenter(soldier.team === "player" ? "enemy" : "player");
  setStrategyObjective(soldier, "ENEMY_SIDE", enemyBasePosition.x, enemyBasePosition.y);
  const hadTarget = soldier.targetId !== null;
  const current = targetById(soldier, soldiers);
  if (hadTarget && !isCommonTargetValid(soldier, current, currentTime)) { clearEngagement(soldier); return; }
  if (current) return;
  beginNearestEngagement(soldier, soldiers, STRATEGY_ENGAGEMENT_CONFIG.charge.detectionRange, currentTime);
}

export function updateDefendAI(soldier: Soldier, soldiers: Soldier[], currentTime = 0): void {
  setStrategyObjective(soldier, "ANCHOR", soldier.anchorX, soldier.anchorY);
  const hadTarget = soldier.targetId !== null;
  const current = targetById(soldier, soldiers);
  const withinZone = current && distanceBetween(current, { x: soldier.anchorX, y: soldier.anchorY })
    <= STRATEGY_ENGAGEMENT_CONFIG.defend.maxPursuitDistance;
  if (hadTarget && (!isCommonTargetValid(soldier, current, currentTime) || !withinZone)) { clearEngagement(soldier); return; }
  if (current) return;
  beginNearestEngagement(soldier, soldiers, STRATEGY_ENGAGEMENT_CONFIG.defend.detectionRange, currentTime);
}

export function updateInterceptAI(soldier: Soldier, soldiers: Soldier[], currentTime = 0): void {
  const lineX = soldier.team === "player" ? BATTLEFIELD_CONFIG.playerInterceptX : BATTLEFIELD_CONFIG.enemyInterceptX;
  const objective = { x: lineX, y: soldier.anchorY };
  setStrategyObjective(soldier, "INTERCEPT_POINT", objective.x, objective.y);
  const hadTarget = soldier.targetId !== null;
  const current = targetById(soldier, soldiers);
  const withinZone = current && distanceBetween(current, objective) <= STRATEGY_ENGAGEMENT_CONFIG.intercept.maxPursuitDistance;
  if (hadTarget && (!isCommonTargetValid(soldier, current, currentTime) || !withinZone)) { clearEngagement(soldier); return; }
  if (current) return;
  const candidates = soldiers.filter((enemy) => !enemy.isDead && enemy.team !== soldier.team
    && distanceBetween(enemy, objective) <= STRATEGY_ENGAGEMENT_CONFIG.intercept.detectionRange);
  const target = findNearestEnemy(soldier, candidates);
  if (target) startEngagement(soldier, target, currentTime);
}

export function updateMeleeAI(soldier: Soldier, soldiers: Soldier[], currentTime = 0): void {
  const enemyBasePosition = getBaseCenter(soldier.team === "player" ? "enemy" : "player");
  setStrategyObjective(soldier, "ENEMY_SIDE", enemyBasePosition.x, enemyBasePosition.y);
  const hadTarget = soldier.targetId !== null;
  const current = targetById(soldier, soldiers);
  if (hadTarget && !isCommonTargetValid(soldier, current, currentTime)) {
    clearEngagement(soldier);
    beginNearestEngagement(soldier, soldiers, STRATEGY_ENGAGEMENT_CONFIG.melee.detectionRange, currentTime);
    return;
  }
  if (current) return;
  beginNearestEngagement(soldier, soldiers, STRATEGY_ENGAGEMENT_CONFIG.melee.detectionRange, currentTime);
}

export function updateWaitAI(soldier: Soldier, soldiers: Soldier[], currentTime = 0): void {
  setStrategyObjective(soldier, "ANCHOR", soldier.anchorX, soldier.anchorY);
  const hadTarget = soldier.targetId !== null;
  const current = targetById(soldier, soldiers);
  const withinZone = current && distanceBetween(current, { x: soldier.anchorX, y: soldier.anchorY })
    <= STRATEGY_ENGAGEMENT_CONFIG.wait.maxPursuitDistance;
  if (hadTarget && (!isCommonTargetValid(soldier, current, currentTime) || !withinZone)) { clearEngagement(soldier); return; }
  if (current) return;
  beginNearestEngagement(soldier, soldiers, STRATEGY_ENGAGEMENT_CONFIG.wait.detectionRange, currentTime);
}

export function isAtAnchor(soldier: Soldier): boolean {
  return Math.hypot(soldier.x - soldier.anchorX, soldier.y - soldier.anchorY)
    <= STRATEGY_ENGAGEMENT_CONFIG[soldier.strategy].returnRadius;
}

export function updateAiTargets(soldiers: Soldier[], currentTime = 0): void {
  for (const soldier of soldiers) {
    if (soldier.isDead || soldier.isConfused || soldier.controller !== "ai" || soldier.reactionState !== "NONE"
      || soldier.state !== "NORMAL" || (soldier.temporaryOrder && soldier.temporaryOrder.type !== "DEFEND_ORDER")) continue;
    if (soldier.temporaryOrder?.type === "DEFEND_ORDER") {
      const current = targetById(soldier, soldiers);
      if (current && !current.isDead && distanceBetween(soldier, current) <= STRATEGY_ENGAGEMENT_CONFIG.defend.detectionRange) continue;
      if (current) clearEngagement(soldier);
      beginNearestEngagement(soldier, soldiers, STRATEGY_ENGAGEMENT_CONFIG.defend.detectionRange, currentTime);
      continue;
    }
    switch (soldier.strategy) {
      case "charge": updateChargeAI(soldier, soldiers, currentTime); break;
      case "defend": updateDefendAI(soldier, soldiers, currentTime); break;
      case "intercept": updateInterceptAI(soldier, soldiers, currentTime); break;
      case "melee": updateMeleeAI(soldier, soldiers, currentTime); break;
      case "wait": updateWaitAI(soldier, soldiers, currentTime); break;
    }
  }
}
