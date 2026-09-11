import { describe, expect, it } from "vitest";
import { BATTLE_OBSTACLES } from "../../src/game/config";
import {
  BATTLEFIELD_BASE_GATE_SOURCE_RECTS,
  BATTLEFIELD_BASE_SOURCE_RECTS,
  BATTLEFIELD_FIXED_FENCE_SOURCE_RECTS,
  BATTLEFIELD_SWF_BITMAP_ORIGIN,
  battlefieldBitmapPointToWorld,
  battlefieldSwfPointToBitmap,
  battlefieldSwfPointToWorld,
  battlefieldWorldPointToBitmap,
  battlefieldWorldPointToSwf,
} from "../../src/game/battlefieldLayout";
import { createSoldier } from "../../src/game/entities/Soldier";
import { createBattleBases, resolveBaseAccessCollisions } from "../../src/game/systems/baseSystem";
import { moveAiSoldiers, separateSoldiers } from "../../src/game/systems/movementSystem";
import {
  getSwfHealingSlotPosition,
  startEmergencyRetreat,
  updateEmergencyRetreat,
} from "../../src/game/systems/recoverySystem";
import {
  SWF_FENCE_GRID_DEFINITIONS,
  getSwfBaseCollisionCodeAtWorld,
  getSwfFenceCollisionRect,
} from "../../src/game/systems/swfBaseCollisionGrid";

const FIXED_STATS = { maxHp: 60, skill: 50, foot: 3, combat: 50, defense: 50 } as const;

function intersectionArea(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): number {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height;
}

describe("raw SWF battle-space to bitmap/world coordinates", () => {
  it("maps the Bitmap 226 SWF placement origin to bitmap/world zero", () => {
    expect(BATTLEFIELD_SWF_BITMAP_ORIGIN).toEqual({ x: 53, y: 149 });
    expect(battlefieldSwfPointToBitmap({ x: 53, y: 149 })).toEqual({ x: 0, y: 0 });
    expect(battlefieldSwfPointToWorld({ x: 53, y: 149 })).toEqual({ x: 0, y: 0 });
    expect(battlefieldWorldPointToSwf({ x: 0, y: 0 })).toEqual({ x: 53, y: 149 });
  });

  it("keeps bitmap-local asset coordinates separate from raw AVM1 coordinates", () => {
    const raw = { x: 193, y: 600 };
    const bitmap = battlefieldSwfPointToBitmap(raw);
    expect(bitmap).toEqual({ x: 140, y: 451 });
    expect(battlefieldWorldPointToBitmap(battlefieldSwfPointToWorld(raw))).toEqual(bitmap);
    expect(battlefieldBitmapPointToWorld(bitmap)).toEqual(battlefieldSwfPointToWorld(raw));
  });
});

describe("shk2 collision grid matches the reconstructed battlefield art", () => {
  it("places all six 901..906 fence columns over their extracted alpha components", () => {
    for (const definition of SWF_FENCE_GRID_DEFINITIONS) {
      const rawRect = getSwfFenceCollisionRect(definition.code);
      const topLeft = battlefieldSwfPointToBitmap({ x: rawRect.x, y: rawRect.y });
      const gridRect = { x: topLeft.x, y: topLeft.y, width: rawRect.width, height: rawRect.height };
      const alpha = BATTLEFIELD_FIXED_FENCE_SOURCE_RECTS.find((candidate) => candidate.id === definition.id)!;
      const overlap = intersectionArea(gridRect, alpha);
      const smallerArea = Math.min(gridRect.width * gridRect.height, alpha.width * alpha.height);
      expect(overlap / smallerArea).toBeGreaterThan(0.87);
      expect(Math.abs(gridRect.x - alpha.x)).toBeLessThanOrEqual(2);
    }
  });

  it("maps the player and enemy upper/lower recovery cells onto the visible headquarters fence bands", () => {
    const samples = [
      { team: "player" as const, x: 216, topY: 432, bottomY: 756, code: 999 },
      { team: "enemy" as const, x: 1620, topY: 432, bottomY: 756, code: 998 },
    ];
    for (const sample of samples) {
      for (const [gate, rawY] of [["TOP", sample.topY], ["BOTTOM", sample.bottomY]] as const) {
        const world = battlefieldSwfPointToWorld({ x: sample.x, y: rawY });
        const bitmap = battlefieldWorldPointToBitmap(world);
        const visual = BATTLEFIELD_BASE_GATE_SOURCE_RECTS[sample.team][gate];
        expect(bitmap.x).toBeGreaterThanOrEqual(visual.x);
        expect(bitmap.x).toBeLessThanOrEqual(visual.x + visual.width);
        expect(bitmap.y).toBeGreaterThanOrEqual(visual.y);
        expect(bitmap.y).toBeLessThanOrEqual(visual.y + visual.height);
        expect(getSwfBaseCollisionCodeAtWorld(world)).toBe(sample.code);
      }
    }
  });

  it("keeps every deterministic p97/p98 healing slot inside the visible base crop", () => {
    for (const team of ["player", "enemy"] as const) {
      const base = BATTLEFIELD_BASE_SOURCE_RECTS[team];
      for (let index = 0; index < 30; index += 1) {
        const soldier = createSoldier(`${team}-${index}`, team, "ai", 0, 0, "melee", FIXED_STATS);
        const bitmap = battlefieldWorldPointToBitmap(getSwfHealingSlotPosition(soldier));
        expect(bitmap.x).toBeGreaterThanOrEqual(base.x);
        expect(bitmap.x).toBeLessThanOrEqual(base.x + base.width);
        expect(bitmap.y).toBeGreaterThanOrEqual(base.y);
        expect(bitmap.y).toBeLessThanOrEqual(base.y + base.height);
      }
    }
  });
});

describe("raw fence routing and crowd movement", () => {
  it("routes through all six 901..906 fixed-fence cells without a permanent deadlock", () => {
    for (const definition of SWF_FENCE_GRID_DEFINITIONS) {
      const rawRect = getSwfFenceCollisionRect(definition.code);
      const start = battlefieldSwfPointToWorld({ x: rawRect.x - 30, y: definition.routeCenterY + 36 });
      const goal = battlefieldSwfPointToWorld({ x: rawRect.x + rawRect.width + 260, y: definition.routeCenterY + 36 });
      const unit = createSoldier(`route-${definition.code}`, "player", "ai", start.x, start.y, "melee", FIXED_STATS);
      unit.moveTargetX = goal.x;
      unit.moveTargetY = goal.y;
      for (let tick = 0; tick < 300; tick += 1) {
        moveAiSoldiers([unit], 1 / 24, BATTLE_OBSTACLES, tick * 1000 / 24, []);
      }
      const source = battlefieldWorldPointToSwf(unit);
      expect(source.x, `fence ${definition.code}`).toBeGreaterThan(rawRect.x + rawRect.width + 40);
    }
  });

  it("routes a live-target pursuit around a 901 fence without dropping the target or deadlocking", () => {
    const start = battlefieldSwfPointToWorld({ x: 490, y: 540 });
    const goal = battlefieldSwfPointToWorld({ x: 850, y: 540 });
    const pursuer = createSoldier("pursuer", "player", "ai", start.x, start.y, "melee", FIXED_STATS);
    const target = createSoldier("target", "enemy", "ai", goal.x, goal.y, "wait", FIXED_STATS);
    pursuer.targetId = target.id;

    for (let tick = 0; tick < 240; tick += 1) {
      moveAiSoldiers([pursuer, target], 1 / 24, BATTLE_OBSTACLES, tick * 1000 / 24, []);
    }

    const source = battlefieldWorldPointToSwf(pursuer);
    expect(source.x).toBeGreaterThan(650);
    expect(pursuer.targetId).toBe(target.id);
  });

  it("lets an emergency retreat complete the real obstacle route and reach its 999 healing cell", () => {
    const start = battlefieldSwfPointToWorld({ x: 1000, y: 500 });
    const soldier = createSoldier("player-5", "player", "ai", start.x, start.y, "melee", FIXED_STATS);
    const bases = createBattleBases();
    startEmergencyRetreat(soldier, bases, [soldier], 0);

    for (let tick = 0; tick < 720 && soldier.state !== "HEALING"; tick += 1) {
      const time = tick * 1000 / 24;
      updateEmergencyRetreat(soldier, bases, () => 0.99, [soldier], time);
      moveAiSoldiers([soldier], 1 / 24, BATTLE_OBSTACLES, time, bases);
      resolveBaseAccessCollisions([soldier], bases);
    }

    expect(soldier.state).toBe("HEALING");
    const bitmap = battlefieldWorldPointToBitmap(soldier);
    const base = BATTLEFIELD_BASE_SOURCE_RECTS.player;
    expect(bitmap.x).toBeGreaterThanOrEqual(base.x);
    expect(bitmap.x).toBeLessThanOrEqual(base.x + base.width);
    expect(bitmap.y).toBeGreaterThanOrEqual(base.y);
    expect(bitmap.y).toBeLessThanOrEqual(base.y + base.height);
  });

  it("does not replay the raw <32 / 24 contact branch as an unconditional all-pairs separator", () => {
    const first = battlefieldSwfPointToWorld({ x: 800, y: 500 });
    const second = battlefieldSwfPointToWorld({ x: 820, y: 520 });
    const a = createSoldier("a", "player", "ai", first.x, first.y, "melee", FIXED_STATS);
    const b = createSoldier("b", "player", "ai", second.x, second.y, "melee", FIXED_STATS);
    const beforeA = { x: a.x, y: a.y };
    const beforeB = { x: b.x, y: b.y };

    const rawA = battlefieldWorldPointToSwf(a);
    const rawB = battlefieldWorldPointToSwf(b);
    expect(Math.abs(rawB.x - rawA.x)).toBeLessThan(32);
    expect(Math.abs(rawB.y - rawA.y)).toBeLessThan(32);
    expect(Math.round(rawA.x / 36)).not.toBe(Math.round(rawB.x / 36));

    separateSoldiers([a, b]);

    expect(a.x).toBeCloseTo(beforeA.x, 8);
    expect(a.y).toBeCloseTo(beforeA.y, 8);
    expect(b.x).toBeCloseTo(beforeB.x, 8);
    expect(b.y).toBeCloseTo(beforeB.y, 8);
  });
});