import { describe, expect, it } from "vitest";
import { CLOSE_COMBAT_POSITIONING_CONFIG } from "../config";
import { createSoldier } from "../entities/Soldier";
import type { BattleObstacle } from "../types";
import { clearEngagement, startEngagement } from "./aiSystem";
import {
  chooseApproachAngle,
  clearApproachRuntime,
  computeApproachPoint,
  getPreferredApproachPoint,
  isApproachPointValid,
} from "./engagementPositioningSystem";
import { moveAiSoldiers } from "./movementSystem";
import { startHitReaction, updateReactions } from "./reactionSystem";

function engagement() {
  const attacker = createSoldier("attacker", "player", "ai", 100, 200, "charge");
  const target = createSoldier("target", "enemy", "ai", 200, 200);
  attacker.targetId = target.id;
  return { attacker, target, soldiers: [attacker, target] };
}

describe("soft engagement positioning", () => {
  it("does not create an approach without a Combat Target", () => {
    const { attacker, target, soldiers } = engagement();
    attacker.targetId = null;
    expect(getPreferredApproachPoint(attacker, target, soldiers, [])).toBeNull();
  });

  it("creates a preferred point inside attack range", () => {
    const { attacker, target, soldiers } = engagement();
    const point = getPreferredApproachPoint(attacker, target, soldiers, []);
    expect(point).not.toBeNull();
    expect(Math.hypot(point!.x - target.x, point!.y - target.y)).toBeLessThan(attacker.attackRange);
    expect(attacker.preferredApproachTargetId).toBe(target.id);
  });

  it("prefers a candidate near the soldier's current side", () => {
    const { attacker, target, soldiers } = engagement();
    const point = getPreferredApproachPoint(attacker, target, soldiers, []);
    expect(point!.x).toBeLessThan(target.x);
  });

  it("penalizes an already occupied approach and spreads allies", () => {
    const { attacker: first, target } = engagement();
    const second = createSoldier("second", "player", "ai", 100, 201);
    first.targetId = target.id;
    second.targetId = target.id;
    const soldiers = [first, second, target];
    const firstPoint = getPreferredApproachPoint(first, target, soldiers, [])!;
    const secondPoint = getPreferredApproachPoint(second, target, soldiers, [])!;
    expect(Math.hypot(firstPoint.x - secondPoint.x, firstPoint.y - secondPoint.y)).toBeGreaterThan(1);
  });

  it("rejects candidates outside world bounds", () => {
    const attacker = createSoldier("a", "player", "ai", 100, 100);
    const target = createSoldier("t", "enemy", "ai", 10, 10);
    attacker.targetId = target.id;
    const point = getPreferredApproachPoint(attacker, target, [attacker, target], [])!;
    expect(isApproachPointValid(point, [])).toBe(true);
    expect(point.x).toBeGreaterThanOrEqual(8);
    expect(point.y).toBeGreaterThanOrEqual(8);
  });

  it("does not choose a preferred point inside an obstacle", () => {
    const { attacker, target, soldiers } = engagement();
    const fence: BattleObstacle = { id: "f", type: "FENCE", x: 160, y: 175, width: 35, height: 50 };
    const point = getPreferredApproachPoint(attacker, target, soldiers, [fence])!;
    expect(isApproachPointValid(point, [fence])).toBe(true);
  });

  it("uses a deterministic tie-break for identical IDs and positions", () => {
    const target = createSoldier("target", "enemy", "ai", 200, 200);
    const first = createSoldier("same", "player", "ai", 200, 100);
    const second = createSoldier("same", "player", "ai", 200, 100);
    first.targetId = target.id;
    second.targetId = target.id;
    expect(chooseApproachAngle(first, target, [first, target], [])).toBe(chooseApproachAngle(second, target, [second, target], []));
  });

  it("holds the chosen angle throughout the same engagement", () => {
    const { attacker, target, soldiers } = engagement();
    getPreferredApproachPoint(attacker, target, soldiers, []);
    const angle = attacker.preferredApproachAngle;
    const crowd = createSoldier("crowd", "player", "ai", 100, 200);
    crowd.targetId = target.id;
    getPreferredApproachPoint(attacker, target, [...soldiers, crowd], []);
    expect(attacker.preferredApproachAngle).toBe(angle);
  });

  it("reselects when the Combat Target changes", () => {
    const { attacker, target, soldiers } = engagement();
    getPreferredApproachPoint(attacker, target, soldiers, []);
    const next = createSoldier("next", "enemy", "ai", 200, 300);
    startEngagement(attacker, next, 100);
    getPreferredApproachPoint(attacker, next, [attacker, target, next], []);
    expect(attacker.preferredApproachTargetId).toBe(next.id);
  });

  it("clears approach runtime with Engagement", () => {
    const { attacker, target, soldiers } = engagement();
    getPreferredApproachPoint(attacker, target, soldiers, []);
    clearEngagement(attacker);
    expect(attacker.preferredApproachAngle).toBeNull();
    expect(attacker.preferredApproachTargetId).toBeNull();
  });

  it("moves the world-space approach point with its target", () => {
    const { attacker, target, soldiers } = engagement();
    const first = getPreferredApproachPoint(attacker, target, soldiers, [])!;
    target.x += 15;
    target.y += 7;
    const second = getPreferredApproachPoint(attacker, target, soldiers, [])!;
    expect(second.x - first.x).toBeCloseTo(15);
    expect(second.y - first.y).toBeCloseTo(7);
  });

  it("stops inside attack range without orbiting toward the preferred point", () => {
    const { attacker, target, soldiers } = engagement();
    attacker.x = target.x - attacker.attackRange + 1;
    const before = { x: attacker.x, y: attacker.y };
    moveAiSoldiers(soldiers, 0.1);
    expect({ x: attacker.x, y: attacker.y }).toEqual(before);
    expect(attacker.preferredApproachAngle).toBeNull();
  });

  it("does not position during Attack states", () => {
    for (const state of ["ATTACK_WINDUP", "ATTACK_RECOVERY"] as const) {
      const { attacker, soldiers } = engagement();
      attacker.combatActionState = state;
      moveAiSoldiers(soldiers, 0.1);
      expect(attacker.preferredApproachAngle).toBeNull();
      expect(attacker.x).toBe(100);
    }
  });

  it("does not position during HIT_STUN and resumes afterward", () => {
    const { attacker, target, soldiers } = engagement();
    const hitter = createSoldier("hitter", "enemy", "ai", 90, 200);
    startHitReaction(attacker, hitter, 0);
    moveAiSoldiers(soldiers, 0.1);
    expect(attacker.preferredApproachAngle).toBeNull();
    updateReactions([attacker], [], 180, 180);
    moveAiSoldiers(soldiers, 0.1);
    expect(attacker.preferredApproachTargetId).toBe(target.id);
  });

  it("does not position during Recovery or TemporaryOrder", () => {
    const { attacker, soldiers } = engagement();
    attacker.state = "EMERGENCY_RETREAT";
    attacker.moveTargetX = 50;
    attacker.moveTargetY = 50;
    moveAiSoldiers(soldiers, 0.1);
    expect(attacker.preferredApproachAngle).toBeNull();
    attacker.state = "NORMAL";
    attacker.temporaryOrder = { type: "ADVANCE", issuedAt: 0, expiresAt: 1_000, sourceX: 0, sourceY: 0 };
    moveAiSoldiers(soldiers, 0.1);
    expect(attacker.preferredApproachAngle).toBeNull();
  });

  it("does not change Strategy, Combat Target, or Engagement origin", () => {
    const { attacker, target, soldiers } = engagement();
    attacker.engagementStartedAt = 10;
    attacker.engagementOriginX = 90;
    attacker.engagementOriginY = 190;
    getPreferredApproachPoint(attacker, target, soldiers, []);
    expect(attacker.strategy).toBe("charge");
    expect(attacker.targetId).toBe(target.id);
    expect([attacker.engagementStartedAt, attacker.engagementOriginX, attacker.engagementOriginY]).toEqual([10, 90, 190]);
  });

  it("feeds its desired direction into existing obstacle avoidance", () => {
    const { attacker, soldiers } = engagement();
    const fence: BattleObstacle = { id: "front", type: "FENCE", x: 125, y: 180, width: 12, height: 40 };
    moveAiSoldiers(soldiers, 0.1, [fence], 0);
    expect(attacker.avoidanceSide).not.toBeNull();
  });

  it("never applies automatic positioning to the player-controlled soldier", () => {
    const { attacker, target, soldiers } = engagement();
    attacker.controller = "player";
    expect(getPreferredApproachPoint(attacker, target, soldiers, [])).toBeNull();
  });

  it("allows enemy AI to position around a player target", () => {
    const player = createSoldier("player", "player", "player", 200, 200);
    const enemy = createSoldier("enemy", "enemy", "ai", 100, 200);
    enemy.targetId = player.id;
    expect(getPreferredApproachPoint(enemy, player, [enemy, player], [])).not.toBeNull();
  });

  it("disperses several attackers without strict slot reservation", () => {
    const target = createSoldier("target", "enemy", "ai", 300, 300);
    const attackers = Array.from({ length: 6 }, (_, index) => {
      const unit = createSoldier(`a-${index}`, "player", "ai", 150, 294 + index * 2);
      unit.targetId = target.id;
      return unit;
    });
    const soldiers = [...attackers, target];
    const points = attackers.map((unit) => getPreferredApproachPoint(unit, target, soldiers, [])!);
    const unique = new Set(points.map((point) => `${Math.round(point.x)},${Math.round(point.y)}`));
    expect(unique.size).toBeGreaterThan(2);
    for (let frame = 0; frame < 50; frame += 1) moveAiSoldiers(soldiers, 0.05, [], frame * 50);
    const positions = new Set(attackers.map((unit) => `${Math.round(unit.x)},${Math.round(unit.y)}`));
    expect(positions.size).toBeGreaterThan(2);
  });

  it("keeps configured candidates soft rather than reserving a fixed slot", () => {
    expect(CLOSE_COMBAT_POSITIONING_CONFIG.sectorCount).toBe(8);
    const { attacker } = engagement();
    clearApproachRuntime(attacker);
    expect(attacker.preferredApproachAngle).toBeNull();
  });
});
