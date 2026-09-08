import { BATTLEFIELD_CONFIG, OBSTACLE_AVOIDANCE_CONFIG, SOLDIER_RADIUS } from "../config";
import type { AvoidanceSide, BattleBase, BattleObstacle, Soldier } from "../types";
import { getSoldierMoveSpeed } from "../stats/soldierStats";
import { clearEngagement, distanceBetween } from "./aiSystem";
import { getPreferredApproachPoint } from "./engagementPositioningSystem";
import { calculateRetreatMoveSpeed } from "./specialAbilitySystem";
import { findGunTarget, getGunMovementDecision } from "./gunAttackSystem";
import { findArrowTarget, getArrowMovementDecision } from "./arrowAttackSystem";
import { clearStaleCombatTarget, isTrackableCombatTarget, isValidCombatTarget } from "./combatTargetSystem";
import { getArrivalToleranceWorld, isWithinNormalContact } from "./techniqueCombatProfiles";
import { getBaseAttackContactSegment } from "./battlefieldGeometry";

export interface Direction { x: number; y: number }

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

function segmentIntersectsInflatedObstacle(start: Direction, end: Direction, obstacle: BattleObstacle): boolean {
  const minX = obstacle.x - SOLDIER_RADIUS;
  const maxX = obstacle.x + obstacle.width + SOLDIER_RADIUS;
  const minY = obstacle.y - SOLDIER_RADIUS;
  const maxY = obstacle.y + obstacle.height + SOLDIER_RADIUS;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let near = 0;
  let far = 1;
  for (const [origin, direction, minimum, maximum] of [[start.x, dx, minX, maxX], [start.y, dy, minY, maxY]] as const) {
    if (Math.abs(direction) < 1e-8) {
      if (origin < minimum || origin > maximum) return false;
      continue;
    }
    const first = (minimum - origin) / direction;
    const second = (maximum - origin) / direction;
    near = Math.max(near, Math.min(first, second));
    far = Math.min(far, Math.max(first, second));
    if (near > far) return false;
  }
  return true;
}

function probeScore(soldier: Soldier, direction: Direction, obstacles: readonly BattleObstacle[]): number {
  const end = {
    x: soldier.x + direction.x * OBSTACLE_AVOIDANCE_CONFIG.sideProbeDistance,
    y: soldier.y + direction.y * OBSTACLE_AVOIDANCE_CONFIG.sideProbeDistance,
  };
  if (end.x < SOLDIER_RADIUS || end.x > BATTLEFIELD_CONFIG.width - SOLDIER_RADIUS
    || end.y < SOLDIER_RADIUS || end.y > BATTLEFIELD_CONFIG.height - SOLDIER_RADIUS) return Number.POSITIVE_INFINITY;
  return obstacles.reduce((score, obstacle) => score + Number(segmentIntersectsInflatedObstacle(soldier, end, obstacle)), 0);
}

function deterministicSide(id: string): AvoidanceSide {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % 2 === 0 ? "LEFT" : "RIGHT";
}

function avoidanceDirection(desired: Direction, side: AvoidanceSide): Direction {
  const perpendicular = side === "LEFT" ? { x: -desired.y, y: desired.x } : { x: desired.y, y: -desired.x };
  return normalize(
    desired.x + perpendicular.x * OBSTACLE_AVOIDANCE_CONFIG.sideWeight,
    desired.y + perpendicular.y * OBSTACLE_AVOIDANCE_CONFIG.sideWeight,
  );
}

export function resolveMovementDirection(
  soldier: Soldier,
  desiredDirection: Direction,
  obstacles: readonly BattleObstacle[],
  currentTime: number,
): Direction {
  const desired = normalize(desiredDirection.x, desiredDirection.y);
  if (desired.x === 0 && desired.y === 0) return desired;
  const sensorEnd = {
    x: soldier.x + desired.x * OBSTACLE_AVOIDANCE_CONFIG.lookAhead,
    y: soldier.y + desired.y * OBSTACLE_AVOIDANCE_CONFIG.lookAhead,
  };
  const obstacle = obstacles.find((candidate) => segmentIntersectsInflatedObstacle(soldier, sensorEnd, candidate));
  if (!obstacle) {
    if (currentTime >= soldier.avoidanceUntil) {
      soldier.avoidanceSide = null;
      soldier.avoidanceObstacleId = null;
    }
    return desired;
  }

  const left = avoidanceDirection(desired, "LEFT");
  const right = avoidanceDirection(desired, "RIGHT");
  const leftScore = probeScore(soldier, left, obstacles);
  const rightScore = probeScore(soldier, right, obstacles);
  let side = soldier.avoidanceSide;
  const committedDirection = side ? (side === "LEFT" ? left : right) : null;
  const committedScore = side ? (side === "LEFT" ? leftScore : rightScore) : Number.POSITIVE_INFINITY;
  const alternativeScore = side === "LEFT" ? rightScore : leftScore;
  const commitmentUsable = side && currentTime < soldier.avoidanceUntil && committedScore <= alternativeScore;
  if (!commitmentUsable) {
    side = leftScore < rightScore ? "LEFT" : rightScore < leftScore ? "RIGHT" : deterministicSide(soldier.id);
    soldier.avoidanceSide = side;
    soldier.avoidanceUntil = currentTime + OBSTACLE_AVOIDANCE_CONFIG.commitMs;
    soldier.avoidanceObstacleId = obstacle.id;
  }
  return commitmentUsable && committedDirection ? committedDirection : side === "LEFT" ? left : right;
}

function moveBy(
  soldier: Soldier,
  dx: number,
  dy: number,
  deltaSeconds: number,
  obstacles: readonly BattleObstacle[],
  currentTime: number,
  applyAvoidance: boolean,
): void {
  const previousX = soldier.x;
  const previousY = soldier.y;
  const desired = normalize(dx, dy);
  const direction = applyAvoidance ? resolveMovementDirection(soldier, desired, obstacles, currentTime) : desired;
  if (direction.x !== 0 || direction.y !== 0) {
    soldier.facingX = direction.x; soldier.facingY = direction.y;
    soldier.aimX = null; soldier.aimY = null;
  }
  const baseSpeed = getSoldierMoveSpeed(soldier);
  const speed = soldier.state === "EMERGENCY_RETREAT" ? calculateRetreatMoveSpeed(baseSpeed, soldier) : baseSpeed;
  applyMovementDistance(soldier, direction, speed * deltaSeconds, obstacles);
  soldier.velocityX = soldier.x - previousX;
  soldier.velocityY = soldier.y - previousY;
}

function applyMovementDistance(
  soldier: Soldier,
  direction: Direction,
  distance: number,
  obstacles: readonly BattleObstacle[],
): void {
  const steps = Math.max(1, Math.ceil(distance / (SOLDIER_RADIUS / 2)));
  const stepDistance = distance / steps;
  for (let step = 0; step < steps; step += 1) {
    const nextX = Math.max(SOLDIER_RADIUS, Math.min(BATTLEFIELD_CONFIG.width - SOLDIER_RADIUS, soldier.x + direction.x * stepDistance));
    if (!obstacles.some((obstacle) => circleIntersectsObstacle(nextX, soldier.y, SOLDIER_RADIUS, obstacle))) soldier.x = nextX;
    const nextY = Math.max(SOLDIER_RADIUS, Math.min(BATTLEFIELD_CONFIG.height - SOLDIER_RADIUS, soldier.y + direction.y * stepDistance));
    if (!obstacles.some((obstacle) => circleIntersectsObstacle(soldier.x, nextY, SOLDIER_RADIUS, obstacle))) soldier.y = nextY;
  }
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
    moveBy(soldier, dx, dy, deltaSeconds, obstacles, 0, false);
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
      if (!isTrackableCombatTarget(soldier, selected)) clearStaleCombatTarget(soldier);
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
      ? soldiers.find((candidate) => candidate.id === soldier.targetId && isTrackableCombatTarget(soldier, candidate)) ?? null
      : null;
    if (soldier.state === "NORMAL" && soldier.unitType === "TEPPOU" && !chasingRetreatWindup) {
      const gunTarget = target ?? findGunTarget(soldier, soldiers);
      if (gunTarget && getGunMovementDecision(soldier, gunTarget) === "HOLD_IN_RANGE") {
        const dx = gunTarget.x - soldier.x; const dy = gunTarget.y - soldier.y; const length = Math.hypot(dx, dy);
        if (length > 0) { soldier.facingX = dx / length; soldier.facingY = dy / length; soldier.aimX = dx / length; soldier.aimY = dy / length; }
        continue;
      }
    }
    if (soldier.state === "NORMAL" && soldier.unitType === "ARCHER" && !chasingRetreatWindup) {
      const arrowTarget = target && getArrowMovementDecision(soldier, target) === "HOLD_IN_RANGE"
        ? target : findArrowTarget(soldier, soldiers);
      if (arrowTarget && getArrowMovementDecision(soldier, arrowTarget) === "HOLD_IN_RANGE") {
        const dx = arrowTarget.x - soldier.x; const dy = arrowTarget.y - soldier.y; const length = Math.hypot(dx, dy);
        if (length > 0) { soldier.facingX = dx / length; soldier.facingY = dy / length; soldier.aimX = dx / length; soldier.aimY = dy / length; }
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
        const contact = getBaseAttackContactSegment(enemyBase);
        const verticalInset = SOLDIER_RADIUS * 2;
        const minimumApproachY = Math.min(contact.maxY, contact.minY + verticalInset);
        const maximumApproachY = Math.max(contact.minY, contact.maxY - verticalInset);
        destination.y = Math.max(minimumApproachY, Math.min(maximumApproachY, destination.y));
        if (soldier.y < contact.minY || soldier.y > contact.maxY) {
          // First line up outside the base. A diagonal aimed directly through
          // the base rectangle is ejected by its top/bottom collider before it
          // can ever reach the narrow attack segment.
          destination.x = contact.x + (enemyBase.team === "enemy" ? -verticalInset : verticalInset);
        }
      }
    }
    // Engagements use their own SWF 24-unit spacing point. Applying the
    // destination tolerance on top of that spacing would stop short of contact.
    const stopDistance = target ? 2 : getArrivalToleranceWorld(soldier.stats.foot);
    if (distanceBetween(soldier, destination) <= stopDistance) continue;
    moveBy(soldier, destination.x - soldier.x, destination.y - soldier.y, deltaSeconds, obstacles, currentTime, true);
  }
}

export function resolveObstacleOverlaps(soldiers: Soldier[], obstacles: readonly BattleObstacle[]): void {
  for (const soldier of soldiers) {
    if (soldier.isDead) continue;
    for (const obstacle of obstacles) {
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

export function separateSoldiers(soldiers: Soldier[]): void {
  const minimumDistance = SOLDIER_RADIUS * 2;
  for (let i = 0; i < soldiers.length; i += 1) {
    const a = soldiers[i];
    if (a.isDead || a.state === "HEALING") continue;
    for (let j = i + 1; j < soldiers.length; j += 1) {
      const b = soldiers[j];
      if (b.isDead || b.state === "HEALING") continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let distance = Math.hypot(dx, dy);
      if (distance >= minimumDistance) continue;
      if (distance === 0) { dx = 1; dy = 0; distance = 1; }
      const overlap = minimumDistance - distance;
      const aContactLocked = a.baseContactLockTicks > 0;
      const bContactLocked = b.baseContactLockTicks > 0;
      if (aContactLocked && bContactLocked) continue;
      const aPush = bContactLocked ? overlap : aContactLocked ? 0 : overlap / 2;
      const bPush = aContactLocked ? overlap : bContactLocked ? 0 : overlap / 2;
      a.x -= (dx / distance) * aPush;
      a.y -= (dy / distance) * aPush;
      b.x += (dx / distance) * bPush;
      b.y += (dy / distance) * bPush;
    }
  }
  for (const soldier of soldiers) {
    if (soldier.isDead || soldier.state === "HEALING") continue;
    soldier.x = Math.max(SOLDIER_RADIUS, Math.min(BATTLEFIELD_CONFIG.width - SOLDIER_RADIUS, soldier.x));
    soldier.y = Math.max(SOLDIER_RADIUS, Math.min(BATTLEFIELD_CONFIG.height - SOLDIER_RADIUS, soldier.y));
  }
}
