import { describe, expect, it } from "vitest";
import {
  battlefieldSwfPointToWorld,
  battlefieldWorldPointToSwf,
} from "../../src/game/battlefieldLayout";
import { createSoldier } from "../../src/game/entities/Soldier";
import {
  getSwfSoldierUpdateOrder,
  resolveSequentialSwfSoldierContacts,
} from "../../src/game/systems/swfSoldierContactSystem";

const STATS = { maxHp: 60, skill: 50, foot: 3, combat: 50, defense: 50 } as const;

function soldier(id: string, team: "player" | "enemy", rawX: number, rawY: number) {
  const point = battlefieldSwfPointToWorld({ x: rawX, y: rawY });
  return createSoldier(id, team, id === "player-0" ? "player" : "ai", point.x, point.y, "melee", STATS);
}

function setRawProposal(unit: ReturnType<typeof soldier>, rawX: number, rawY: number): void {
  const previous = { x: unit.x, y: unit.y };
  const next = battlefieldSwfPointToWorld({ x: rawX, y: rawY });
  unit.x = next.x;
  unit.y = next.y;
  unit.velocityX = next.x - previous.x;
  unit.velocityY = next.y - previous.y;
}

describe("sequential raw SWF soldier contact replay", () => {
  it("orders m200 first and then m1..m59", () => {
    const units = [
      soldier("enemy-1", "enemy", 1200, 500),
      soldier("player-2", "player", 400, 500),
      soldier("enemy-0", "enemy", 1100, 500),
      soldier("player-0", "player", 300, 500),
      soldier("player-1", "player", 350, 500),
    ];
    expect(getSwfSoldierUpdateOrder(units).map((unit) => unit.id)).toEqual([
      "player-0",
      "player-1",
      "player-2",
      "enemy-0",
      "enemy-1",
    ]);
  });

  it("does not apply 32/24 correction merely because two allies are nearby", () => {
    const protagonist = soldier("player-0", "player", 800, 500);
    const ally = soldier("player-1", "player", 820, 520);
    const before = [
      { x: protagonist.x, y: protagonist.y },
      { x: ally.x, y: ally.y },
    ];

    const result = resolveSequentialSwfSoldierContacts([protagonist, ally]);

    expect(result.dynamicContacts).toBe(0);
    expect(protagonist.x).toBeCloseTo(before[0].x, 8);
    expect(protagonist.y).toBeCloseTo(before[0].y, 8);
    expect(ally.x).toBeCloseTo(before[1].x, 8);
    expect(ally.y).toBeCloseTo(before[1].y, 8);
  });

  it("selects only the occupant of the mover's proposed 36-unit cell", () => {
    const protagonist = soldier("player-0", "player", 800, 500);
    const ally = soldier("player-1", "player", 820, 500);
    setRawProposal(protagonist, 810, 500);

    const result = resolveSequentialSwfSoldierContacts([protagonist, ally]);
    const raw = battlefieldWorldPointToSwf(protagonist);

    expect(result.dynamicContacts).toBe(1);
    expect(result.spacingCorrections).toBe(1);
    expect(raw.x).toBeCloseTo(796, 0);
    expect(raw.y).toBeCloseTo(500, 0);
    expect(battlefieldWorldPointToSwf(ally).x).toBeCloseTo(820, 6);
  });

  it("does not drag the protagonist when its proposed cell is free", () => {
    const protagonist = soldier("player-0", "player", 800, 500);
    const ally = soldier("player-1", "player", 820, 500);
    setRawProposal(protagonist, 802, 500);

    const result = resolveSequentialSwfSoldierContacts([protagonist, ally]);
    const raw = battlefieldWorldPointToSwf(protagonist);

    expect(result.dynamicContacts).toBe(0);
    expect(raw.x).toBeCloseTo(802, 6);
    expect(raw.y).toBeCloseTo(500, 6);
  });

  it("keeps opposing-team displacement owned by the existing combat path", () => {
    const protagonist = soldier("player-0", "player", 800, 500);
    const enemy = soldier("enemy-0", "enemy", 820, 500);
    setRawProposal(protagonist, 810, 500);

    const result = resolveSequentialSwfSoldierContacts([protagonist, enemy]);
    const raw = battlefieldWorldPointToSwf(protagonist);

    expect(result.dynamicContacts).toBe(1);
    expect(result.spacingCorrections).toBe(0);
    expect(raw.x).toBeCloseTo(800, 6);
  });
});
