import { describe, expect, it } from "vitest";
import {
  battlefieldSwfPointToWorld,
  battlefieldWorldPointToSwf,
} from "../../src/game/battlefieldLayout";
import { createSoldier } from "../../src/game/entities/Soldier";
import { captureSoldierPositions } from "../../src/game/systems/baseContactSystem";
import { separateSoldiers } from "../../src/game/systems/movementSystem";

const STATS = { maxHp: 60, skill: 50, foot: 3, combat: 50, defense: 50 } as const;

function unit(id: string, rawX: number, rawY: number) {
  const point = battlefieldSwfPointToWorld({ x: rawX, y: rawY });
  return createSoldier(id, "player", id === "player-0" ? "player" : "ai", point.x, point.y, "melee", STATS);
}

function moveRawX(soldier: ReturnType<typeof unit>, rawDeltaX: number): void {
  const raw = battlefieldWorldPointToSwf(soldier);
  const next = battlefieldSwfPointToWorld({ x: raw.x + rawDeltaX, y: raw.y });
  soldier.x = next.x;
  soldier.y = next.y;
}

describe("multi-frame crowd regression for the former all-pairs contact bug", () => {
  it("keeps a commanded protagonist moving forward without passive-allies causing circular or sideways drift", () => {
    const protagonist = unit("player-0", 720, 500);
    const allies = [
      unit("player-1", 760, 464),
      unit("player-2", 760, 536),
      unit("player-3", 800, 464),
      unit("player-4", 800, 536),
      unit("player-5", 840, 464),
      unit("player-6", 840, 536),
      unit("player-7", 880, 464),
      unit("player-8", 880, 536),
      unit("player-9", 920, 464),
      unit("player-10", 920, 536),
    ];
    const soldiers = [protagonist, ...allies];
    const start = battlefieldWorldPointToSwf(protagonist);
    let previousX = start.x;
    let backwardFrames = 0;
    let maximumVerticalDrift = 0;

    for (let frame = 0; frame < 30; frame += 1) {
      captureSoldierPositions(soldiers);
      moveRawX(protagonist, 4);
      separateSoldiers(soldiers);
      const raw = battlefieldWorldPointToSwf(protagonist);
      if (raw.x < previousX - 0.01) backwardFrames += 1;
      previousX = raw.x;
      maximumVerticalDrift = Math.max(maximumVerticalDrift, Math.abs(raw.y - start.y));
    }

    const end = battlefieldWorldPointToSwf(protagonist);
    expect(end.x).toBeGreaterThan(start.x + 100);
    expect(backwardFrames).toBe(0);
    expect(maximumVerticalDrift).toBeLessThan(1);

    for (const ally of allies) {
      expect(Math.abs(ally.velocityY)).toBeLessThan(1e-9);
    }
  });

  it("does not move passive nearby allies when only the protagonist receives movement proposals", () => {
    const protagonist = unit("player-0", 800, 500);
    const allies = [
      unit("player-1", 820, 536),
      unit("player-2", 784, 536),
      unit("player-3", 820, 464),
      unit("player-4", 784, 464),
    ];
    const soldiers = [protagonist, ...allies];
    const before = new Map(allies.map((ally) => [ally.id, battlefieldWorldPointToSwf(ally)]));

    for (let frame = 0; frame < 20; frame += 1) {
      captureSoldierPositions(soldiers);
      moveRawX(protagonist, 2);
      separateSoldiers(soldiers);
    }

    for (const ally of allies) {
      const raw = battlefieldWorldPointToSwf(ally);
      const original = before.get(ally.id)!;
      expect(raw.x).toBeCloseTo(original.x, 6);
      expect(raw.y).toBeCloseTo(original.y, 6);
    }
  });
});
