import { describe, expect, it } from "vitest";
import {
  battlefieldSourcePointToWorld,
  battlefieldWorldPointToSource,
} from "../battlefieldLayout";
import { createSoldier } from "../entities/Soldier";
import {
  getRawContactGridCell,
  resetNormalContactScheduler,
  SWF_NORMAL_CONTACT_TICK_MS,
  updateNormalCombatContests,
} from "./normalCombatSystem";

function soldierAtSource(
  id: string,
  team: "player" | "enemy",
  sourceX: number,
  sourceY: number,
) {
  const world = battlefieldSourcePointToWorld({ x: sourceX, y: sourceY });
  return createSoldier(id, team, "ai", world.x, world.y, "melee");
}

describe("raw contact scheduler probe", () => {
  it("quantizes revival positions through the raw 36-unit f-grid", () => {
    const world = battlefieldSourcePointToWorld({ x: 72, y: 108 });
    expect(getRawContactGridCell(world)).toEqual({ x: 2, y: 3 });
  });

  it("runs contact arbitration at no more than the SWF 24 Hz cadence", () => {
    const a = soldierAtSource("a", "player", 500, 500);
    const b = soldierAtSource("b", "enemy", 530, 500);
    const roster = [a, b];
    resetNormalContactScheduler(roster);

    let calls = 0;
    const random = () => { calls += 1; return 0; };

    updateNormalCombatContests(roster, 0, random);
    expect(calls).toBe(1);
    updateNormalCombatContests(roster, SWF_NORMAL_CONTACT_TICK_MS * 0.5, random);
    expect(calls).toBe(1);
    updateNormalCombatContests(roster, SWF_NORMAL_CONTACT_TICK_MS + 0.01, random);
    expect(calls).toBe(2);
  });

  it("moves only the current roster soldier to the raw 24-unit spacing point when its f cell is free", () => {
    const a = soldierAtSource("a", "player", 500, 500);
    const b = soldierAtSource("b", "enemy", 530, 500);
    const roster = [a, b];

    updateNormalCombatContests(roster, 0, () => 0);

    const sourceA = battlefieldWorldPointToSource(a);
    const sourceB = battlefieldWorldPointToSource(b);
    expect(sourceA.x).toBeCloseTo(506, 6);
    expect(sourceA.y).toBeCloseTo(500, 6);
    expect(sourceB.x).toBeCloseTo(530, 6);
    expect(sourceB.y).toBeCloseTo(500, 6);
    expect(Math.hypot(sourceB.x - sourceA.x, sourceB.y - sourceA.y)).toBeCloseTo(24, 6);
  });

  it("rejects the 24-unit correction when its candidate f cell already has a dynamic occupant", () => {
    const a = soldierAtSource("a", "player", 500, 500);
    const b = soldierAtSource("b", "enemy", 530, 500);
    const blocker = soldierAtSource("blocker", "player", 506, 500);
    const roster = [a, b, blocker];

    updateNormalCombatContests(roster, 0, () => 0);

    const sourceA = battlefieldWorldPointToSource(a);
    expect(sourceA.x).toBeCloseTo(500, 6);
    expect(sourceA.y).toBeCloseTo(500, 6);
  });

  it("allows each soldier to participate in at most one contact per logic tick", () => {
    const a = soldierAtSource("a", "player", 500, 500);
    const b = soldierAtSource("b", "enemy", 530, 500);
    const c = soldierAtSource("c", "enemy", 500, 530);
    const roster = [a, b, c];

    let calls = 0;
    updateNormalCombatContests(roster, 0, () => { calls += 1; return 0; });

    expect(calls).toBe(1);
    const started = roster.filter((soldier) => soldier.combatActionState === "ATTACK_WINDUP");
    expect(started).toHaveLength(1);
  });
});
