import { describe, expect, it } from "vitest";
import {
  battlefieldSwfPointToWorld,
  battlefieldWorldPointToSwf,
} from "../../src/game/battlefieldLayout";
import { createSoldier } from "../../src/game/entities/Soldier";
import { captureSoldierPositions } from "../../src/game/systems/baseContactSystem";
import { separateSoldiers } from "../../src/game/systems/movementSystem";

const STATS = { maxHp: 60, skill: 50, foot: 3, combat: 50, defense: 50 } as const;

function unit(id: string, team: "player" | "enemy", rawX: number, rawY = 500) {
  const point = battlefieldSwfPointToWorld({ x: rawX, y: rawY });
  return createSoldier(id, team, id === "player-0" ? "player" : "ai", point.x, point.y, "melee", STATS);
}

function setRawPosition(soldier: ReturnType<typeof unit>, rawX: number, rawY = 500): void {
  const next = battlefieldSwfPointToWorld({ x: rawX, y: rawY });
  soldier.x = next.x;
  soldier.y = next.y;
}

describe("BattleScene movement snapshot -> SWF contact integration", () => {
  it("does not drag the protagonist merely because a nearby ally exists", () => {
    const protagonist = unit("player-0", "player", 800);
    const ally = unit("player-1", "player", 820);
    const soldiers = [protagonist, ally];
    captureSoldierPositions(soldiers);
    setRawPosition(protagonist, 804);

    separateSoldiers(soldiers);

    expect(battlefieldWorldPointToSwf(protagonist).x).toBeCloseTo(804, 6);
    expect(battlefieldWorldPointToSwf(ally).x).toBeCloseTo(820, 6);
  });

  it("applies 32/24 correction only when the proposed 36-unit cell is occupied", () => {
    const protagonist = unit("player-0", "player", 800);
    const ally = unit("player-1", "player", 820);
    const soldiers = [protagonist, ally];
    captureSoldierPositions(soldiers);
    setRawPosition(protagonist, 814);

    separateSoldiers(soldiers);

    expect(battlefieldWorldPointToSwf(protagonist).x).toBeCloseTo(796, 0);
    // Later raw-order ally observes its newly armed k=3 in the same update.
    expect(battlefieldWorldPointToSwf(ally).x).toBeCloseTo(823, 6);
  });

  it("preserves a base-contact bounce already resolved before soldier contact", () => {
    const protagonist = unit("player-0", "player", 800);
    const ally = unit("player-1", "player", 820);
    const soldiers = [protagonist, ally];
    captureSoldierPositions(soldiers);
    setRawPosition(protagonist, 770);
    protagonist.baseContactLockTicks = 10;

    separateSoldiers(soldiers);

    expect(battlefieldWorldPointToSwf(protagonist).x).toBeCloseTo(770, 6);
  });

  it("does not erase pre-capture player reaction velocity when no ordinary movement occurred", () => {
    const protagonist = unit("player-0", "player", 800);
    const ally = unit("player-1", "player", 900);
    protagonist.velocityX = -7;
    protagonist.velocityY = 2;
    const soldiers = [protagonist, ally];
    captureSoldierPositions(soldiers);

    separateSoldiers(soldiers);

    expect(protagonist.velocityX).toBe(-7);
    expect(protagonist.velocityY).toBe(2);
  });
});
