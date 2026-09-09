import { COMMAND_CONFIG } from "../config";
import {
  BATTLEFIELD_SOURCE_TO_WORLD,
  BATTLEFIELD_STRATEGY_SOURCE_GEOMETRY,
  BATTLEFIELD_STRATEGY_WORLD_GEOMETRY,
  battlefieldSourcePointToWorld,
  battlefieldWorldPointToSource,
} from "../battlefieldLayout";
import type { RandomSource } from "../stats/soldierStats";
import type { Soldier, StrategyObjectiveKind, Team } from "../types";
import { clearApproachRuntime } from "./engagementPositioningSystem";
import { isValidCombatTarget } from "./combatTargetSystem";
import { getTeamRosterSlots } from "./specialAbilitySystem";

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

function meleeOpponentSlots(soldier: Soldier, soldiers: readonly Soldier[]): readonly (Soldier | undefined)[] {
  const opponentTeam: Team = soldier.team === "player" ? "enemy" : "player";
  const slots = getTeamRosterSlots(soldiers, opponentTeam);
  // Raw p10 samples enemy m30..m59 (30 slots). Raw p11 samples m1..m29,
  // deliberately excluding player-controlled m0/m200 from the 29-slot draw.
  return soldier.team === "player" ? slots : slots.slice(1);
}

export function findFrontmostEnemyNinja(soldier: Soldier, soldiers: readonly Soldier[]): Soldier | null {
  let best: { soldier: Soldier; projectedX: number } | null = null;
  for (const candidate of meleeOpponentSlots(soldier, soldiers)) {
    if (!candidate || candidate.unitType !== "NINJA") continue;
    const projected = projectedStrategyCandidate(soldier, candidate);
    if (!projected) continue;
    if (!best || (soldier.team === "player" ? projected.x < best.projectedX : projected.x > best.projectedX)) {
      best = { soldier: candidate, projectedX: projected.x };
    }
  }
  return best?.soldier ?? null;
}

function targetById(soldier: Soldier, soldiers: Soldier[]): Soldier | null {
  if (!soldier.targetId) return null;
  return soldiers.find((candidate) => candidate.id === soldier.targetId) ?? null;
}

export function startEngagement(soldier: Soldier, target: Soldier, currentTime: number): void {
  if (soldier.targetId !== target.id) clearApproachRuntime(soldier);
  soldier.targetId = target.id;
  soldier.engagementStartedAt = currentTime;
  // Raw l assignment is accompanied by tx/ty plus vc(). Preserve the position
  // sampled by that event instead of steering to l's live coordinates every frame.
  soldier.engagementOriginX = soldier.x;
  soldier.engagementOriginY = soldier.y;
  soldier.moveTargetX = target.x;
  soldier.moveTargetY = target.y;
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

function refreshEngagementVector(soldier: Soldier, target: Soldier, currentTime: number): void {
  startEngagement(soldier, target, currentTime);
  setStrategyObjective(soldier, "SEEK_COMBAT", target.x, target.y);
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

function sourceVelocity(soldier: Pick<Soldier, "velocityX" | "velocityY">): { x: number; y: number } {
  return {
    x: soldier.velocityX / BATTLEFIELD_SOURCE_TO_WORLD.scaleX,
    y: soldier.velocityY / BATTLEFIELD_SOURCE_TO_WORLD.scaleY,
  };
}

function projectedStrategyCandidate(defender: Soldier, candidate: Soldier): { x: number; y: number } | null {
  if (!isValidCombatTarget(defender, candidate) || candidate.state === "EMERGENCY_RETREAT") return null;
  const source = battlefieldWorldPointToSource(candidate);
  if (defender.team === "enemy" && source.x >= 1615) return null;
  const velocity = sourceVelocity(candidate);
  const unengagedAiBias = candidate.targetId === null && candidate.controller === "ai"
    ? (defender.team === "player" ? -200 : 200)
    : 0;
  const projected = {
    x: source.x + velocity.x * 8 + unengagedAiBias,
    y: source.y + velocity.y * 50,
  };
  return projected.y > 324 && projected.y < 841 ? projected : null;
}

export function findFrontmostInvader(defender: Soldier, soldiers: Soldier[], thresholdX: number): Soldier | null {
  const thresholdSourceX = battlefieldWorldPointToSource({ x: thresholdX, y: 0 }).x;
  let best: { soldier: Soldier; projectedX: number } | null = null;
  for (const candidate of soldiers) {
    const projected = projectedStrategyCandidate(defender, candidate);
    if (!projected) continue;
    if (!best || (defender.team === "player" ? projected.x < best.projectedX : projected.x > best.projectedX)) {
      best = { soldier: candidate, projectedX: projected.x };
    }
  }
  if (!best) return null;
  return defender.team === "player"
    ? (best.projectedX <= thresholdSourceX ? best.soldier : null)
    : (best.projectedX >= thresholdSourceX ? best.soldier : null);
}

function teamThreshold(team: Team, kind: "defend" | "intercept"): number {
  return BATTLEFIELD_STRATEGY_WORLD_GEOMETRY[`${kind}FrontLineX`][team];
}

function updateDefenderPursuitObjective(defender: Soldier, target: Soldier): void {
  const defenderSource = battlefieldWorldPointToSource(defender);
  const targetSource = battlefieldWorldPointToSource(target);
  const velocity = sourceVelocity(target);
  const enemyPassedDefender = (targetSource.x - defenderSource.x) * (defender.team === "player" ? 1 : -1) < 0;
  const verticallySeparated = Math.abs(targetSource.y - defenderSource.y) > 250;
  const predictionTicks = enemyPassedDefender || verticallySeparated ? 30 : 1;
  const destination = battlefieldSourcePointToWorld({
    x: targetSource.x + velocity.x * predictionTicks,
    y: targetSource.y + velocity.y * predictionTicks,
  });
  setStrategyObjective(defender, "SEEK_COMBAT", destination.x, destination.y);
}

function setInitialChargeObjective(soldier: Soldier): void {
  const source = battlefieldWorldPointToSource(soldier);
  const target = battlefieldSourcePointToWorld({ x: soldier.team === "player" ? 1600 : 0, y: source.y });
  setStrategyObjective(soldier, "ENEMY_SIDE", target.x, target.y);
}

export function updateChargeAI(soldier: Soldier, soldiers: Soldier[], currentTime = 0): void {
  const current = clearInvalidEngagement(soldier, soldiers);
  if (current) {
    // p21/p22 are not explicit scd cases, so scd's default refreshes tx/ty
    // from the current l and recalculates vc only on that cadence.
    refreshEngagementVector(soldier, current, currentTime);
    return;
  }
  const source = battlefieldWorldPointToSource(soldier);
  let target = { x: soldier.team === "player" ? 1600 : 0, y: source.y };
  if (soldier.team === "player") {
    if (source.x > 1442) target = { x: 1662, y: 574 };
    else if (source.x > 1207) target = { x: 1607, y: 574 };
  } else {
    if (source.x < 390) target = { x: 200, y: 574 };
    else if (source.x < 634) target = { x: 234, y: 574 };
  }
  const world = battlefieldSourcePointToWorld(target);
  setStrategyObjective(soldier, "ENEMY_SIDE", world.x, world.y);
  // Raw p1/p2 do not proactively acquire a combat target. Contact/retaliation
  // can still put the soldier into the corresponding pp+20 engagement state.
}

export function updateDefendAI(soldier: Soldier, soldiers: Soldier[], currentTime = 0): void {
  setStrategyObjective(soldier, "ANCHOR", soldier.anchorX, soldier.anchorY);
  clearInvalidEngagement(soldier, soldiers);
  const target = findFrontmostInvader(soldier, soldiers, teamThreshold(soldier.team, "defend"));
  if (!target) {
    if (soldier.targetId) clearEngagement(soldier);
    return;
  }
  startEngagement(soldier, target, currentTime);
  updateDefenderPursuitObjective(soldier, target);
}

export function updateInterceptAI(soldier: Soldier, soldiers: Soldier[], currentTime = 0): void {
  setStrategyObjective(soldier, "INTERCEPT_POINT", soldier.anchorX, soldier.anchorY);
  clearInvalidEngagement(soldier, soldiers);
  const target = findFrontmostInvader(soldier, soldiers, teamThreshold(soldier.team, "intercept"));
  if (!target) {
    if (soldier.targetId) clearEngagement(soldier);
    return;
  }
  startEngagement(soldier, target, currentTime);
  setStrategyObjective(soldier, "SEEK_COMBAT", target.x, target.y);
}

function randomIndex(length: number, random: RandomSource): number {
  return Math.min(length - 1, Math.floor(Math.max(0, Math.min(0.999999999, random())) * length));
}

function setRandomMeleeObjective(soldier: Soldier, random: RandomSource): void {
  const source = BATTLEFIELD_STRATEGY_SOURCE_GEOMETRY.meleeRoamRect;
  const point = battlefieldSourcePointToWorld({
    x: Math.floor(random() * source.width) + source.x,
    y: Math.floor(random() * source.height) + source.y,
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
  const opponentSlots = meleeOpponentSlots(soldier, soldiers);
  const selected = opponentSlots[randomIndex(opponentSlots.length, random)];
  if (isValidCombatTarget(soldier, selected) && selected.state !== "EMERGENCY_RETREAT") {
    startEngagement(soldier, selected, currentTime);
    setStrategyObjective(soldier, "SEEK_COMBAT", selected.x, selected.y);
  } else {
    // The raw code does not retry another valid opponent. One bad fixed roster
    // slot immediately diverts p10/p11 to the p12/p13 random roam branch.
    setRandomMeleeObjective(soldier, random);
  }
}

export function updateMeleeAI(
  soldier: Soldier,
  soldiers: Soldier[],
  currentTime = 0,
  random: RandomSource = Math.random,
): void {
  const current = clearInvalidEngagement(soldier, soldiers);
  if (current) return;
  if (soldier.strategyObjectiveKind === "RANDOM_ROAM" && !hasReachedRandomMeleeObjective(soldier)) return;
  // Raw p10/p11 immediately samples another fixed opponent slot after a lost target.
  // s34 changes the pursuit state to p40/p41 but does not replace that initial
  // random l until the later scd frontmost-ninja pass.
  selectRandomMeleeTarget(soldier, soldiers, currentTime, random);
}

function updateMeleeScdAI(soldier: Soldier, soldiers: Soldier[], currentTime: number): void {
  const current = clearInvalidEngagement(soldier, soldiers);
  if (!current) return;
  if (soldier.rareSpecialAbilities.includes("NINJA_HUNTER")) {
    // Raw p40/p41 only updates l/tx/ty/vc when the projected frontmost-ninja
    // candidate register is valid. No candidate means the old vector is retained.
    const ninja = findFrontmostEnemyNinja(soldier, soldiers);
    if (ninja) refreshEngagementVector(soldier, ninja, currentTime);
    return;
  }
  // p30/p31 are absent from the explicit scd switch and therefore hit its
  // default tx=l._x / ty=l._y / vc() block every 23 logic ticks.
  refreshEngagementVector(soldier, current, currentTime);
}

export function updateWaitAI(soldier: Soldier, soldiers: Soldier[], currentTime = 0): void {
  const current = clearInvalidEngagement(soldier, soldiers);
  if (current) {
    // Retaliation p34/p35 also falls through scd's default pursuit refresh.
    refreshEngagementVector(soldier, current, currentTime);
    return;
  }
  setStrategyObjective(soldier, "ANCHOR", soldier.anchorX, soldier.anchorY);
  // Raw p14/p15 never proactively assign persistent l. Ranged wait units can
  // still fire through the separate local tk/atck scan, and retaliation may pursue.
}

export function isAtAnchor(soldier: Soldier): boolean {
  return Math.hypot(soldier.x - soldier.anchorX, soldier.y - soldier.anchorY) <= 4;
}

const SWF_STRATEGY_LOGIC_TICK_MS = 1000 / 24;
const SWF_STRATEGY_SCD_INITIAL_COUNTER = 19;
let strategyClockOwner: Soldier | null = null;
let strategyClockLastTime = 0;
let strategyClockAccumulator = 0;
let strategyScdCounter = SWF_STRATEGY_SCD_INITIAL_COUNTER;
let initializedStrategy = new WeakMap<Soldier, Soldier["strategy"]>();

function resetStrategyClock(owner: Soldier | null, currentTime: number): void {
  strategyClockOwner = owner;
  strategyClockLastTime = currentTime;
  strategyClockAccumulator = 0;
  strategyScdCounter = SWF_STRATEGY_SCD_INITIAL_COUNTER;
  initializedStrategy = new WeakMap<Soldier, Soldier["strategy"]>();
}

function canRunNormalStrategy(soldier: Soldier, currentTime: number): boolean {
  return !soldier.isDead && !soldier.isConfused && soldier.controller === "ai" && soldier.reactionState === "NONE"
    && currentTime >= soldier.abilityActionLockUntil && soldier.state === "NORMAL" && !soldier.temporaryOrder;
}

function initializeStrategy(soldier: Soldier): void {
  const prior = initializedStrategy.get(soldier);
  if (prior === soldier.strategy) return;
  initializedStrategy.set(soldier, soldier.strategy);
  if (prior !== undefined && soldier.targetId) clearEngagement(soldier);
  switch (soldier.strategy) {
    case "charge": setInitialChargeObjective(soldier); break;
    case "defend": setStrategyObjective(soldier, "ANCHOR", soldier.anchorX, soldier.anchorY); break;
    case "intercept": setStrategyObjective(soldier, "INTERCEPT_POINT", soldier.anchorX, soldier.anchorY); break;
    case "wait": setStrategyObjective(soldier, "ANCHOR", soldier.anchorX, soldier.anchorY); break;
    case "melee": break;
  }
}

function runScdStrategyPass(soldiers: Soldier[], currentTime: number): void {
  for (const soldier of soldiers) {
    if (!canRunNormalStrategy(soldier, currentTime)) continue;
    switch (soldier.strategy) {
      case "charge": updateChargeAI(soldier, soldiers, currentTime); break;
      case "defend": updateDefendAI(soldier, soldiers, currentTime); break;
      case "intercept": updateInterceptAI(soldier, soldiers, currentTime); break;
      case "melee": updateMeleeScdAI(soldier, soldiers, currentTime); break;
      case "wait": updateWaitAI(soldier, soldiers, currentTime); break;
    }
  }
}

function runMeleeLogicPass(soldiers: Soldier[], currentTime: number, random: RandomSource): void {
  for (const soldier of soldiers) {
    if (canRunNormalStrategy(soldier, currentTime) && soldier.strategy === "melee") {
      updateMeleeAI(soldier, soldiers, currentTime, random);
    }
  }
}

function updateDefendOrders(soldiers: Soldier[], currentTime: number): void {
  for (const soldier of soldiers) {
    if (soldier.isDead || soldier.isConfused || soldier.controller !== "ai" || soldier.reactionState !== "NONE"
      || currentTime < soldier.abilityActionLockUntil || soldier.state !== "NORMAL"
      || soldier.temporaryOrder?.type !== "DEFEND_ORDER") continue;
    const current = targetById(soldier, soldiers);
    if (current && isValidCombatTarget(soldier, current) && distanceBetween(soldier, current) <= COMMAND_CONFIG.defendRadius) continue;
    if (current) clearEngagement(soldier);
    beginNearestEngagement(soldier, soldiers, COMMAND_CONFIG.defendRadius, currentTime);
  }
}

export function updateAiTargets(soldiers: Soldier[], currentTime = 0, random: RandomSource = Math.random): void {
  const owner = soldiers[0] ?? null;
  if (strategyClockOwner !== owner || currentTime < strategyClockLastTime) resetStrategyClock(owner, currentTime);

  for (const soldier of soldiers) if (canRunNormalStrategy(soldier, currentTime)) initializeStrategy(soldier);
  updateDefendOrders(soldiers, currentTime);

  strategyClockAccumulator += Math.max(0, currentTime - strategyClockLastTime);
  strategyClockLastTime = currentTime;
  const logicTicks = Math.floor(strategyClockAccumulator / SWF_STRATEGY_LOGIC_TICK_MS + 1e-9);
  if (logicTicks <= 0) return;
  strategyClockAccumulator -= logicTicks * SWF_STRATEGY_LOGIC_TICK_MS;

  for (let tick = 0; tick < logicTicks; tick += 1) {
    runMeleeLogicPass(soldiers, currentTime, random);
    strategyScdCounter += 1;
    if (strategyScdCounter > 22) {
      runScdStrategyPass(soldiers, currentTime);
      strategyScdCounter = 0;
    }
  }
}
