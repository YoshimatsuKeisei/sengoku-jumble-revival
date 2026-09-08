import { BATTLEFIELD_CONFIG, SOLDIER_RADIUS } from "../config";
import { battlefieldWorldPointToSwf, battlefieldSwfPointToWorld } from "../battlefieldLayout";
import type { BattleBase, BattleObstacle, Soldier } from "../types";
import { getSoldierMoveSpeed } from "../stats/soldierStats";
import { clearEngagement, distanceBetween } from "./aiSystem";
import { getPreferredApproachPoint } from "./engagementPositioningSystem";
import { calculateRetreatMoveSpeed } from "./specialAbilitySystem";
import { findGunTarget, getGunMovementDecision } from "./gunAttackSystem";
import { findArrowTarget, getArrowMovementDecision } from "./arrowAttackSystem";
import { clearStaleCombatTarget, isValidCombatTarget } from "./combatTargetSystem";
import { getArrivalToleranceWorld, isWithinNormalContact, swfLogicTicksToMs } from "./techniqueCombatProfiles";
import {
  getSwfBaseDamageContactSegment,
  getSwfFenceCodeById,
  getSwfFenceId,
  getSwfFenceRouteSplitY,
  getSwfFenceWorldObstacle,
  getSwfStaticCollisionCodeAtWorld,
  isSwfFenceCode,
  type SwfFenceCode,
} from "./swfBaseCollisionGrid";

export interface Direction { x: number; y: number }

export const SWF_FENCE_IMPACT_TICKS = 10;
export const SWF_FENCE_ROUTE_TICKS = 20;

interface FenceRouteRuntime {
  code: SwfFenceCode;
  impactStartedAt: number;
  impactUntil: number;
  routeUntil: number;
  bounceDirectionX: number;
  routeDirection: Direction;
}

const activeFenceRoutes = new WeakMap<Soldier, FenceRouteRuntime>();

export function getPointerMoveDirection(
  player: Pick<Soldier, "x" | "y">,
  pointer: { x: number; y: number },
  deadZone: number,
): Direction {
  const dx = pointer.x - player.x;
  const dy = pointer.y - player.y;
  return Math.hypot(dx, dy) <= deadZone ? { x: 0, y: 0 } : normalize(dx, dy);
}

export function getPlayerMovementIntent(
  player: Pick<Soldier, "x" | "y">,
  arrows: Direction,
  pointer: { x: number; y: number },
  leftMouseHeld: boolean,
  deadZone: number,
): Direction {
  if (arrows.x !== 0 || arrows.y !== 0) return normalize(arrows.x, arrows.y);
  if (!leftMouseHeld) return { x: 0, y: 0 };
  return getPointerMoveDirection(player, pointer, deadZone);
}

function normalize(x: number, y: number): Direction {
  const length = Math.hypot(x, y);
  return length === 0 ? { x: 0, y: 0 } : { x: x / length, y: y / length };
}

export function circleIntersectsObstacle(x: number, y: number, radius: number, obstacle: BattleObstacle): boolean {
  const nearestX = Math.max(obstacle.x, Math.min(x, obstacle.x + obstacle.width));
  const nearestY = Math.max(obstacle.y, Math.min(y, obstacle.y + obstacle.height));
  return (x - nearestX) ** 2 + (y - nearestY) ** 2 < radius ** 2;
}

function isRawFenceObstacle(obstacle: BattleObstacle): boolean {
  return getSwfFenceCodeById(obstacle.id) !== null;
}

interface MovementBlock {
  obstacle: BattleObstacle;
  fenceCode: SwfFenceCode | null;
}

function findMovementBlock(
  x: number,
  y: number,
  obstacles: readonly BattleObstacle[],
): MovementBlock | null {
  // Raw d() samples the soldier center through f[round(x/36)][round(y/36)].
  // The six battlefield fences therefore use the exact 901..906 grid cells,
  // not an independently tuned radius-inflated bitmap rectangle.
  const code = getSwfStaticCollisionCodeAtWorld({ x, y });
  if (isSwfFenceCode(code)) {
    return {
      fenceCode: code,
      obstacle: obstacles.find((candidate) => candidate.id === getSwfFenceId(code))
        ?? getSwfFenceWorldObstacle(code),
    };
  }

  const generic = obstacles.find((candidate) => !isRawFenceObstacle(candidate)
    && circleIntersectsObstacle(x, y, SOLDIER_RADIUS, candidate));
  return generic ? { obstacle: generic, fenceCode: null } : null;
}

/** Exact vc3 turn decision used after a raw 901..906 fence collision. */
export function getSwfFenceRoutingDirection(
  soldier: Pick<Soldier, "x" | "y">,
  desiredDirection: Direction,
  code: SwfFenceCode,
): Direction {
  const desired = normalize(desiredDirection.x, desiredDirection.y);
  if (desired.x === 0 && desired.y === 0) return desired;
  const source = battlefieldWorldPointToSwf(soldier);
  const belowSplit = source.y > getSwfFenceRouteSplitY(code);
  // vc3 rotates the current target vector by +/-1.5 rad. Which sign is chosen
  // depends on the fence's smy entry (+70) and the horizontal target direction.
  const turn = belowSplit
    ? (desired.x > 0 ? 1.5 : -1.5)
    : (desired.x < 0 ? 1.5 : -1.5);
  const angle = Math.atan2(desired.y, desired.x) + turn;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function clearExpiredFenceRoute(soldier: Soldier, currentTime: number): void {
  const runtime = activeFenceRoutes.get(soldier);
  if (runtime && currentTime < runtime.routeUntil) return;
  activeFenceRoutes.delete(soldier);
  soldier.avoidanceSide = null;
  soldier.avoidanceObstacleId = null;
  soldier.avoidanceUntil = 0;
}

function beginFenceRoute(
  soldier: Soldier,
  desired: Direction,
  code: SwfFenceCode,
  currentTime: number,
): void {
  const routeDirection = getSwfFenceRoutingDirection(soldier, desired, code);
  const impactUntil = currentTime + swfLogicTicksToMs(SWF_FENCE_IMPACT_TICKS);
  const routeUntil = impactUntil + swfLogicTicksToMs(SWF_FENCE_ROUTE_TICKS);
  const bounceDirectionX = desired.x === 0 ? 0 : -Math.sign(desired.x);
  activeFenceRoutes.set(soldier, {
    code, impactStartedAt: currentTime, impactUntil, routeUntil, bounceDirectionX, routeDirection,
  });
  soldier.avoidanceObstacleId = getSwfFenceId(code);
  soldier.avoidanceSide = routeDirection.y >= 0 ? "LEFT" : "RIGHT";
  soldier.avoidanceUntil = routeUntil;
}

interface RoutedMovement { direction: Direction; speedMultiplier: number }

function getRoutedMovement(soldier: Soldier, desired: Direction, currentTime: number): RoutedMovement {
  clearExpiredFenceRoute(soldier, currentTime);
  const runtime = activeFenceRoutes.get(soldier);
  if (!runtime) return { direction: desired, speedMultiplier: 1 };
  if (currentTime < runtime.impactUntil) {
    // Raw k=10 branch applies fx=-2*x and damps fx/fy by 0.7 every logic tick.
    const elapsedTicks = Math.max(0, Math.floor((currentTime - runtime.impactStartedAt) / swfLogicTicksToMs(1)));
    return {
      direction: runtime.bounceDirectionX === 0 ? { x: 0, y: 0 } : { x: runtime.bounceDirectionX, y: 0 },
      speedMultiplier: 2 * (0.7 ** Math.min(SWF_FENCE_IMPACT_TICKS - 1, elapsedTicks)),
    };
  }
  return { direction: runtime.routeDirection, speedMultiplier: 1 };
}

/**
 * Compatibility helper exposing the active raw k/t fence vector. There is no
 * speculative pre-contact steering: before a 901..906 collision this returns
 * the requested direction unchanged.
 */
export function resolveMovementDirection(
  soldier: Soldier,
  desiredDirection: Direction,
  _obstacles: readonly BattleObstacle[],
  currentTime: number,
): Direction {
  const desired = normalize(desiredDirection.x, desiredDirection.y);
  return getRoutedMovement(soldier, desired, currentTime).direction;
}

interface MovementStepResult { blocked: MovementBlock | null }

function applyMovementDistance(
  soldier: Soldier,
  direction: Direction,
  distance: number,
  obstacles: readonly BattleObstacle[],
): MovementStepResult {
  const steps = Math.max(1, Math.ceil(distance / Math.max(1, SOLDIER_RADIUS / 2)));
  const stepDistance = distance / steps;
  for (let step = 0; step < steps; step += 1) {
    const nextX = Math.max(SOLDIER_RADIUS,
      Math.min(BATTLEFIELD_CONFIG.width - SOLDIER_RADIUS, soldier.x + direction.x * stepDistance));
    const nextY = Math.max(SOLDIER_RADIUS,
      Math.min(BATTLEFIELD_CONFIG.height - SOLDIER_RADIUS, soldier.y + direction.y * stepDistance));
    const blocked = findMovementBlock(nextX, nextY, obstacles);
    if (blocked) return { blocked };
    soldier.x = nextX;
    soldier.y = nextY;
  }
  return { blocked: null };
}

function moveBy(
  soldier: Soldier,
  dx: number,
  dy: number,
  deltaSeconds: number,
  obstacles: readonly BattleObstacle[],
  currentTime: number,
  _applyAvoidance: boolean,
): void {
  const previousX = soldier.x;
  const previousY = soldier.y;
  const desired = normalize(dx, dy);
  // Raw k/t fence response applies to the protagonist and AI alike.
  // The legacy boolean parameter is retained only for API compatibility with callers;
  // speculative pre-contact steering no longer exists.
  const routed = getRoutedMovement(soldier, desired, currentTime);
  let direction = routed.direction;
  if (direction.x !== 0 || direction.y !== 0) {
    soldier.facingX = direction.x; soldier.facingY = direction.y;
    soldier.aimX = null; soldier.aimY = null;
  }
  const baseSpeed = getSoldierMoveSpeed(soldier);
  const speed = soldier.state === "EMERGENCY_RETREAT" ? calculateRetreatMoveSpeed(baseSpeed, soldier) : baseSpeed;
  const distance = speed * routed.speedMultiplier * deltaSeconds;
  const result = applyMovementDistance(soldier, direction, distance, obstacles);

  if (result.blocked?.fenceCode !== null && result.blocked?.fenceCode !== undefined) {
    // d() rejects the colliding candidate, arms k=10/t=20 and calls vc3().
    // The reverse/damped k motion starts on subsequent updates; do not slide
    // along the bitmap edge or immediately consume the routed movement here.
    beginFenceRoute(soldier, desired, result.blocked.fenceCode, currentTime);
  }

  soldier.velocityX = soldier.x - previousX;
  soldier.velocityY = soldier.y - previousY;
}

export function applyForcedMovement(
  soldier: Soldier,
  dx: number,
  dy: number,
  distance: number,
  obstacles: readonly BattleObstacle[] = [],
): void {
  const previousX = soldier.x;
  const previousY = soldier.y;
  applyMovementDistance(soldier, normalize(dx, dy), Math.max(0, distance), obstacles);
  soldier.velocityX = soldier.x - previousX;
  soldier.velocityY = soldier.y - previousY;
}

export function movePlayer(soldier: Soldier, dx: number, dy: number, deltaSeconds: number,
  obstacles: readonly BattleObstacle[] = [], allowDuringWindup = false, currentTime = 0): void {
  soldier.velocityX = 0;
  soldier.velocityY = 0;
  if (!soldier.isDead && soldier.reactionState === "NONE"
    && currentTime >= soldier.abilityActionLockUntil && currentTime >= soldier.trapStateUntil
    && soldier.baseContactLockTicks <= 0
    && (soldier.state === "NORMAL" || soldier.state === "EMERGENCY_RETREAT")
    && (soldier.combatActionState === "IDLE" || allowDuringWindup)) {
    moveBy(soldier, dx, dy, deltaSeconds, obstacles, currentTime, false);
  }
}

export function moveAiSoldiers(
  soldiers: Soldier[],
  deltaSeconds: number,
  obstacles: readonly BattleObstacle[] = [],
  currentTime = 0,
  bases: readonly BattleBase[] = [],
): void {
  for (const soldier of soldiers) {
    if (soldier.controller === "ai" || soldier.state !== "NORMAL") {
      soldier.velocityX = 0;
      soldier.velocityY = 0;
    }
    if (soldier.targetId) {
      const selected = soldiers.find((candidate) => candidate.id === soldier.targetId);
      if (!isValidCombatTarget(soldier, selected)) clearStaleCombatTarget(soldier);
    }
    const stateControlled = soldier.state === "EMERGENCY_RETREAT" || soldier.state === "REJOINING" || soldier.isConfused;
    const windupTarget = soldier.attackTargetKind === "SOLDIER"
      ? soldiers.find((candidate) => candidate.id === soldier.attackTargetId && isValidCombatTarget(soldier, candidate)) ?? null
      : null;
    const chasingRetreatWindup = soldier.controller === "ai"
      && soldier.state === "NORMAL"
      && soldier.combatActionState === "ATTACK_WINDUP"
      && windupTarget?.state === "EMERGENCY_RETREAT";
    if (soldier.isDead || currentTime < soldier.ninjaDashUntil || currentTime < soldier.abilityActionLockUntil
      || currentTime < soldier.trapStateUntil || soldier.baseContactLockTicks > 0
      || soldier.activeSpecialTechnique !== null
      || soldier.reactionState !== "NONE" || (soldier.combatActionState !== "IDLE" && !chasingRetreatWindup)
      || (!stateControlled && soldier.controller !== "ai") || soldier.state === "HEALING"
    ) continue;
    if (soldier.isConfused) {
      const ownBase = bases.find((base) => base.team === soldier.team);
      const destination = ownBase ?? { x: soldier.team === "player" ? BATTLEFIELD_CONFIG.playerHomeX : BATTLEFIELD_CONFIG.enemyHomeX, y: soldier.y };
      moveBy(soldier, destination.x - soldier.x, destination.y - soldier.y, deltaSeconds, obstacles, currentTime, true);
      continue;
    }
    const target = chasingRetreatWindup ? windupTarget : soldier.state === "NORMAL" && !soldier.temporaryOrder && soldier.targetId
      ? soldiers.find((candidate) => candidate.id === soldier.targetId && isValidCombatTarget(soldier, candidate)) ?? null
      : null;
    if (soldier.state === "NORMAL" && soldier.unitType === "TEPPOU" && !chasingRetreatWindup) {
      const gunTarget = target ?? findGunTarget(soldier, soldiers);
      if (gunTarget && getGunMovementDecision(soldier, gunTarget) === "HOLD_IN_RANGE") {
        const gx = gunTarget.x - soldier.x; const gy = gunTarget.y - soldier.y; const length = Math.hypot(gx, gy);
        if (length > 0) { soldier.facingX = gx / length; soldier.facingY = gy / length; soldier.aimX = gx / length; soldier.aimY = gy / length; }
        continue;
      }
    }
    if (soldier.state === "NORMAL" && soldier.unitType === "ARCHER" && !chasingRetreatWindup) {
      const arrowTarget = target && getArrowMovementDecision(soldier, target) === "HOLD_IN_RANGE"
        ? target : findArrowTarget(soldier, soldiers);
      if (arrowTarget && getArrowMovementDecision(soldier, arrowTarget) === "HOLD_IN_RANGE") {
        const ax = arrowTarget.x - soldier.x; const ay = arrowTarget.y - soldier.y; const length = Math.hypot(ax, ay);
        if (length > 0) { soldier.facingX = ax / length; soldier.facingY = ay / length; soldier.aimX = ax / length; soldier.aimY = ay / length; }
        continue;
      }
    }
    if (target && !chasingRetreatWindup && isWithinNormalContact(soldier, target)) continue;
    if (!target && (soldier.moveTargetX === null || soldier.moveTargetY === null)) continue;
    const predictiveDefendDestination = target && soldier.strategy === "defend"
      && soldier.strategyObjectiveKind === "SEEK_COMBAT"
      ? { x: soldier.strategyObjectiveX, y: soldier.strategyObjectiveY }
      : null;
    const destination = target
      ? predictiveDefendDestination
        ?? (target.state === "EMERGENCY_RETREAT" ? target : getPreferredApproachPoint(soldier, target, soldiers, obstacles) ?? target)
      : { x: soldier.moveTargetX!, y: soldier.moveTargetY! };
    if (!target && soldier.state === "NORMAL" && soldier.strategyObjectiveKind === "ENEMY_SIDE") {
      const enemyBase = bases.find((base) => base.team !== soldier.team && !base.isDestroyed && base.hp > 0);
      if (enemyBase) {
        const contact = getSwfBaseDamageContactSegment(enemyBase.team);
        const verticalInset = SOLDIER_RADIUS * 2;
        const minimumApproachY = Math.min(contact.maxY, contact.minY + verticalInset);
        const maximumApproachY = Math.max(contact.minY, contact.maxY - verticalInset);
        destination.y = Math.max(minimumApproachY, Math.min(maximumApproachY, destination.y));
        if (soldier.y < contact.minY || soldier.y > contact.maxY) {
          destination.x = contact.x + (enemyBase.team === "enemy" ? -verticalInset : verticalInset);
        }
      }
    }
    const stopDistance = target ? 2 : getArrivalToleranceWorld(soldier.stats.foot);
    if (distanceBetween(soldier, destination) <= stopDistance) continue;
    moveBy(soldier, destination.x - soldier.x, destination.y - soldier.y, deltaSeconds, obstacles, currentTime, true);
  }
}

export function resolveObstacleOverlaps(soldiers: Soldier[], obstacles: readonly BattleObstacle[]): void {
  for (const soldier of soldiers) {
    if (soldier.isDead) continue;

    const staticCode = getSwfStaticCollisionCodeAtWorld(soldier);
    if (isSwfFenceCode(staticCode)) {
      const obstacle = getSwfFenceWorldObstacle(staticCode);
      const left = Math.abs(soldier.x - obstacle.x);
      const right = Math.abs(soldier.x - (obstacle.x + obstacle.width));
      const top = Math.abs(soldier.y - obstacle.y);
      const bottom = Math.abs(soldier.y - (obstacle.y + obstacle.height));
      const minimum = Math.min(left, right, top, bottom);
      const epsilon = 0.01;
      if (minimum === left) soldier.x = obstacle.x - epsilon;
      else if (minimum === right) soldier.x = obstacle.x + obstacle.width + epsilon;
      else if (minimum === top) soldier.y = obstacle.y - epsilon;
      else soldier.y = obstacle.y + obstacle.height + epsilon;
    }

    for (const obstacle of obstacles) {
      if (isRawFenceObstacle(obstacle)) continue;
      if (!circleIntersectsObstacle(soldier.x, soldier.y, SOLDIER_RADIUS, obstacle)) continue;
      const left = Math.abs(soldier.x - (obstacle.x - SOLDIER_RADIUS));
      const right = Math.abs(soldier.x - (obstacle.x + obstacle.width + SOLDIER_RADIUS));
      const top = Math.abs(soldier.y - (obstacle.y - SOLDIER_RADIUS));
      const bottom = Math.abs(soldier.y - (obstacle.y + obstacle.height + SOLDIER_RADIUS));
      const minimum = Math.min(left, right, top, bottom);
      if (minimum === left) soldier.x = obstacle.x - SOLDIER_RADIUS;
      else if (minimum === right) soldier.x = obstacle.x + obstacle.width + SOLDIER_RADIUS;
      else if (minimum === top) soldier.y = obstacle.y - SOLDIER_RADIUS;
      else soldier.y = obstacle.y + obstacle.height + SOLDIER_RADIUS;
    }
    soldier.x = Math.max(SOLDIER_RADIUS, Math.min(BATTLEFIELD_CONFIG.width - SOLDIER_RADIUS, soldier.x));
    soldier.y = Math.max(SOLDIER_RADIUS, Math.min(BATTLEFIELD_CONFIG.height - SOLDIER_RADIUS, soldier.y));
  }
}

/**
 * Raw d() crowd/contact correction: when both axis deltas are <32 source units,
 * place the roster-earlier unit 24 source units from the other unit if the
 * candidate f cell is empty. This replaces the unrelated 16-world-pixel circle
 * separator that allowed large sprite stacks in the reconstruction.
 */
export function separateSoldiers(soldiers: Soldier[]): void {
  for (let i = 0; i < soldiers.length; i += 1) {
    const a = soldiers[i];
    if (a.isDead || a.state === "HEALING" || a.baseContactLockTicks > 0 || a.reactionState !== "NONE") continue;
    for (let j = i + 1; j < soldiers.length; j += 1) {
      const b = soldiers[j];
      if (b.isDead || b.state === "HEALING") continue;
      const sourceA = battlefieldWorldPointToSwf(a);
      const sourceB = battlefieldWorldPointToSwf(b);
      const dx = sourceB.x - sourceA.x;
      const dy = sourceB.y - sourceA.y;
      if (Math.abs(dx) >= 32 || Math.abs(dy) >= 32) continue;
      const length = Math.hypot(dx, dy);
      const ux = length > 0 ? dx / length : 1;
      const uy = length > 0 ? dy / length : 0;
      const candidate = battlefieldSwfPointToWorld({
        x: Math.round(sourceB.x - ux * 24),
        y: Math.round(sourceB.y - uy * 24),
      });
      if (getSwfStaticCollisionCodeAtWorld(candidate) !== null) continue;
      a.x = candidate.x;
      a.y = candidate.y;
    }
  }
  for (const soldier of soldiers) {
    if (soldier.isDead || soldier.state === "HEALING") continue;
    soldier.x = Math.max(SOLDIER_RADIUS, Math.min(BATTLEFIELD_CONFIG.width - SOLDIER_RADIUS, soldier.x));
    soldier.y = Math.max(SOLDIER_RADIUS, Math.min(BATTLEFIELD_CONFIG.height - SOLDIER_RADIUS, soldier.y));
  }
}
