import { describe, expect, it } from "vitest";
import { BATTLE_OBSTACLES } from "../config";
import { battlefieldSwfPointToWorld, battlefieldWorldPointToSwf } from "../battlefieldLayout";
import { createSoldier } from "../entities/Soldier";
import {
  getSwfFenceRoutingDirection,
  moveAiSoldiers,
  movePlayer,
  resolveMovementDirection,
  SWF_FENCE_IMPACT_TICKS,
  SWF_FENCE_ROUTE_TICKS,
} from "./movementSystem";
import { swfLogicTicksToMs } from "./techniqueCombatProfiles";

const FIXED_STATS = { maxHp: 60, skill: 50, foot: 3, combat: 50, defense: 50 } as const;

describe("raw SWF fence routing", () => {
  it("does not invent pre-contact steering when no raw fence collision has happened", () => {
    const start = battlefieldSwfPointToWorld({ x: 490, y: 540 });
    const unit = createSoldier("unit", "player", "ai", start.x, start.y, "melee", FIXED_STATS);
    expect(resolveMovementDirection(unit, { x: 1, y: 0 }, BATTLE_OBSTACLES, 0)).toEqual({ x: 1, y: 0 });
  });

  it("reproduces vc3's +/-1.5-radian turn choice around fence 901", () => {
    const upper = battlefieldSwfPointToWorld({ x: 510, y: 540 });
    const lower = battlefieldSwfPointToWorld({ x: 510, y: 620 });
    const upUnit = createSoldier("up", "player", "ai", upper.x, upper.y, "melee", FIXED_STATS);
    const downUnit = createSoldier("down", "player", "ai", lower.x, lower.y, "melee", FIXED_STATS);
    const up = getSwfFenceRoutingDirection(upUnit, { x: 1, y: 0 }, 901);
    const down = getSwfFenceRoutingDirection(downUnit, { x: 1, y: 0 }, 901);
    expect(up.y).toBeLessThan(0);
    expect(down.y).toBeGreaterThan(0);
    expect(up.x).toBeCloseTo(Math.cos(1.5), 6);
    expect(Math.abs(up.y)).toBeCloseTo(Math.sin(1.5), 6);
  });

  it("records the raw k=10/t=20 fence response instead of speculative look-ahead", () => {
    expect(swfLogicTicksToMs(SWF_FENCE_IMPACT_TICKS)).toBeCloseTo(1000 * 10 / 24);
    expect(swfLogicTicksToMs(SWF_FENCE_ROUTE_TICKS)).toBeCloseTo(1000 * 20 / 24);
    const start = battlefieldSwfPointToWorld({ x: 500, y: 540 });
    const player = createSoldier("player", "player", "player", start.x, start.y, "melee", FIXED_STATS);
    for (let tick = 0; tick < 10; tick += 1) {
      movePlayer(player, 1, 0, 1 / 24, BATTLE_OBSTACLES, false, tick * 1000 / 24);
    }
    const raw = battlefieldWorldPointToSwf(player);
    expect(raw.x).toBeLessThan(522);
    expect(player.avoidanceObstacleId).toBe("player-vanguard");
    expect(player.avoidanceUntil).toBeGreaterThan(9 * 1000 / 24);
  });

  it("routes AI around the full fence instead of oscillating indefinitely on its face", () => {
    const start = battlefieldSwfPointToWorld({ x: 490, y: 540 });
    const goal = battlefieldSwfPointToWorld({ x: 850, y: 540 });
    const unit = createSoldier("routing-unit", "player", "ai", start.x, start.y, "melee", FIXED_STATS);
    unit.moveTargetX = goal.x;
    unit.moveTargetY = goal.y;
    for (let tick = 0; tick < 240; tick += 1) {
      moveAiSoldiers([unit], 1 / 24, BATTLE_OBSTACLES, tick * 1000 / 24, []);
    }
    expect(battlefieldWorldPointToSwf(unit).x).toBeGreaterThan(650);
  });

  it("crosses raw x=900 and the revival world center without an invisible blocking line", () => {
    const start = battlefieldSwfPointToWorld({ x: 850, y: 700 });
    const goal = battlefieldSwfPointToWorld({ x: 1200, y: 700 });
    const unit = createSoldier("center-cross", "player", "ai", start.x, start.y, "charge", FIXED_STATS);
    unit.moveTargetX = goal.x;
    unit.moveTargetY = goal.y;
    const positions = [unit.x];
    for (let tick = 0; tick < 180; tick += 1) {
      moveAiSoldiers([unit], 1 / 24, BATTLE_OBSTACLES, tick * 1000 / 24, []);
      positions.push(unit.x);
    }
    expect(battlefieldWorldPointToSwf(unit).x).toBeGreaterThan(900);
    expect(unit.x).toBeGreaterThan(1200);
    expect(positions.slice(1).every((x, index) => x >= positions[index] - 1e-6)).toBe(true);
  });
});
