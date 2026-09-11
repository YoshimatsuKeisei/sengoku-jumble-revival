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

function captureStarts(units: ReturnType<typeof soldier>[]): Map<string, { x: number; y: number }> {
  return new Map(units.map((unit) => [unit.id, { x: unit.x, y: unit.y }]));
}

function setRawProposal(unit: ReturnType<typeof soldier>, rawX: number, rawY: number): void {
  const next = battlefieldSwfPointToWorld({ x: rawX, y: rawY });
  unit.x = next.x;
  unit.y = next.y;
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
    const units = [protagonist, ally];
    const starts = captureStarts(units);

    const result = resolveSequentialSwfSoldierContacts(units, starts);

    expect(result.dynamicContacts).toBe(0);
    expect(battlefieldWorldPointToSwf(protagonist).x).toBeCloseTo(800, 6);
    expect(battlefieldWorldPointToSwf(protagonist).y).toBeCloseTo(500, 6);
    expect(battlefieldWorldPointToSwf(ally).x).toBeCloseTo(820, 6);
    expect(battlefieldWorldPointToSwf(ally).y).toBeCloseTo(520, 6);
  });

  it("selects only the occupant of the mover's proposed 36-unit cell", () => {
    const protagonist = soldier("player-0", "player", 800, 500);
    const ally = soldier("player-1", "player", 820, 500);
    const units = [protagonist, ally];
    const starts = captureStarts(units);
    setRawProposal(protagonist, 814, 500);

    const result = resolveSequentialSwfSoldierContacts(units, starts);
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
    const units = [protagonist, ally];
    const starts = captureStarts(units);
    setRawProposal(protagonist, 804, 500);

    const result = resolveSequentialSwfSoldierContacts(units, starts);
    const raw = battlefieldWorldPointToSwf(protagonist);

    expect(result.dynamicContacts).toBe(0);
    expect(raw.x).toBeCloseTo(804, 6);
    expect(raw.y).toBeCloseTo(500, 6);
  });

  it("keeps opposing-team displacement owned by the existing combat path", () => {
    const protagonist = soldier("player-0", "player", 800, 500);
    const enemy = soldier("enemy-0", "enemy", 820, 500);
    const units = [protagonist, enemy];
    const starts = captureStarts(units);
    setRawProposal(protagonist, 814, 500);

    const result = resolveSequentialSwfSoldierContacts(units, starts);
    const raw = battlefieldWorldPointToSwf(protagonist);

    expect(result.dynamicContacts).toBe(1);
    expect(result.spacingCorrections).toBe(0);
    expect(raw.x).toBeCloseTo(800, 6);
  });
});
