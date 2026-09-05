import { describe, expect, it } from "vitest";
import { createSoldier } from "../entities/Soldier";
import type { BattleObstacle } from "../types";
import {
  circleIntersectsObstacle,
  moveAiSoldiers,
  movePlayer,
  resolveMovementDirection,
} from "./movementSystem";

const frontFence: BattleObstacle = { id: "front", type: "FENCE", x: 125, y: 80, width: 12, height: 40 };

describe("local obstacle avoidance", () => {
  it("leaves desired movement unchanged when no obstacle is ahead", () => {
    const unit = createSoldier("unit", "player", "ai", 100, 100);
    expect(resolveMovementDirection(unit, { x: 1, y: 0 }, [], 0)).toEqual({ x: 1, y: 0 });
  });

  it("generates a sideways component when an obstacle is ahead", () => {
    const unit = createSoldier("unit", "player", "ai", 100, 100);
    const result = resolveMovementDirection(unit, { x: 1, y: 0 }, [frontFence], 0);
    expect(Math.abs(result.y)).toBeGreaterThan(0);
    expect(unit.avoidanceSide).not.toBeNull();
  });

  it("chooses RIGHT when the LEFT probe is more obstructed", () => {
    const unit = createSoldier("unit", "player", "ai", 100, 100);
    const leftBlocker: BattleObstacle = { id: "left", type: "FENCE", x: 90, y: 112, width: 35, height: 12 };
    resolveMovementDirection(unit, { x: 1, y: 0 }, [frontFence, leftBlocker], 0);
    expect(unit.avoidanceSide).toBe("RIGHT");
  });

  it("chooses LEFT when the RIGHT probe is more obstructed", () => {
    const unit = createSoldier("unit", "player", "ai", 100, 100);
    const rightBlocker: BattleObstacle = { id: "right", type: "FENCE", x: 90, y: 76, width: 35, height: 12 };
    resolveMovementDirection(unit, { x: 1, y: 0 }, [frontFence, rightBlocker], 0);
    expect(unit.avoidanceSide).toBe("LEFT");
  });

  it("uses a deterministic soldier-id tie break", () => {
    const first = createSoldier("stable-id", "player", "ai", 100, 100);
    const second = createSoldier("stable-id", "player", "ai", 100, 100);
    resolveMovementDirection(first, { x: 1, y: 0 }, [frontFence], 0);
    resolveMovementDirection(second, { x: 1, y: 0 }, [frontFence], 0);
    expect(first.avoidanceSide).toBe(second.avoidanceSide);
  });

  it("keeps the selected side during its commitment window", () => {
    const unit = createSoldier("unit", "player", "ai", 100, 100);
    resolveMovementDirection(unit, { x: 1, y: 0 }, [frontFence], 0);
    const side = unit.avoidanceSide;
    resolveMovementDirection(unit, { x: 1, y: 0 }, [frontFence], 100);
    expect(unit.avoidanceSide).toBe(side);
  });

  it("returns to the original desired direction after clearing the obstacle", () => {
    const unit = createSoldier("unit", "player", "ai", 100, 100);
    resolveMovementDirection(unit, { x: 1, y: 0 }, [frontFence], 0);
    expect(resolveMovementDirection(unit, { x: 1, y: 0 }, [], 100)).toEqual({ x: 1, y: 0 });
  });

  it("does not alter combat target, strategy, or temporary order", () => {
    const unit = createSoldier("unit", "player", "ai", 100, 100, "defend");
    unit.targetId = "enemy";
    unit.temporaryOrder = { type: "ADVANCE", issuedAt: 0, expiresAt: 1_000, sourceX: 0, sourceY: 0 };
    resolveMovementDirection(unit, { x: 1, y: 0 }, [frontFence], 0);
    expect(unit.targetId).toBe("enemy");
    expect(unit.strategy).toBe("defend");
    expect(unit.temporaryOrder.type).toBe("ADVANCE");
  });

  it("applies avoidance during TemporaryOrder movement", () => {
    const unit = createSoldier("unit", "player", "ai", 100, 100);
    unit.temporaryOrder = { type: "ADVANCE", issuedAt: 0, expiresAt: 1_000, sourceX: 0, sourceY: 0 };
    unit.moveTargetX = 300;
    unit.moveTargetY = 100;
    moveAiSoldiers([unit], 0.1, [frontFence], 0);
    expect(unit.y).not.toBe(100);
  });

  it("applies avoidance during emergency retreat without changing state", () => {
    const unit = createSoldier("unit", "player", "player", 100, 100);
    unit.state = "EMERGENCY_RETREAT";
    unit.moveTargetX = 300;
    unit.moveTargetY = 100;
    moveAiSoldiers([unit], 0.1, [frontFence], 0);
    expect(unit.y).not.toBe(100);
    expect(unit.state).toBe("EMERGENCY_RETREAT");
  });

  it("rejects a world-bounds avoidance candidate", () => {
    const unit = createSoldier("unit", "player", "ai", 100, 9);
    const fence: BattleObstacle = { id: "edge", type: "FENCE", x: 125, y: 0, width: 12, height: 30 };
    resolveMovementDirection(unit, { x: 1, y: 0 }, [fence], 0);
    expect(unit.avoidanceSide).toBe("LEFT");
  });

  it("blocks the player physically without applying automatic steering", () => {
    const player = createSoldier("player", "player", "player", 110, 100);
    movePlayer(player, 1, 0, 0.1, [frontFence]);
    expect(player.x).toBeGreaterThan(110);
    expect(player.x).toBeLessThanOrEqual(frontFence.x - 8);
    expect(player.avoidanceSide).toBeNull();
    expect(circleIntersectsObstacle(player.x, player.y, 8, frontFence)).toBe(false);
  });

  it("locally routes an AI soldier around a fence over repeated updates", () => {
    const unit = createSoldier("routing-unit", "player", "ai", 100, 150);
    unit.stats.foot = 3;
    const fence: BattleObstacle = { id: "wall", type: "FENCE", x: 150, y: 100, width: 20, height: 100 };
    unit.moveTargetX = 260;
    unit.moveTargetY = 150;
    for (let frame = 0; frame < 80; frame += 1) moveAiSoldiers([unit], 0.05, [fence], frame * 50);
    expect(unit.x).toBeGreaterThan(fence.x + fence.width + 8);
    expect(circleIntersectsObstacle(unit.x, unit.y, 8, fence)).toBe(false);
  });
});
