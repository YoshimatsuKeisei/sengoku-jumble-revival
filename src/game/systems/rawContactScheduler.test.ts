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
import {
  isRawGenericContactImpulseActive,
  SWF_GENERIC_CONTACT_K_TICKS,
} from "./rawContactImpulseSystem";

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

  it("does not arbitrate again between 24 Hz ticks or while the raw k=3 contact response is active", () => {
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
    expect(calls).toBe(1);
    expect(isRawGenericContactImpulseActive(a)).toBe(true);
    expect(isRawGenericContactImpulseActive(b)).toBe(true);
  });

  it("retains phase 2A and first moves only the current roster soldier to the raw 24-unit spacing point", () => {
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

  it("rejects the phase-2A 24-unit correction when its candidate f cell already has a dynamic occupant", () => {
    const a = soldierAtSource("a", "player", 500, 500);
    const b = soldierAtSource("b", "enemy", 530, 500);
    const blocker = soldierAtSource("blocker", "player", 506, 500);
    const roster = [a, b, blocker];

    updateNormalCombatContests(roster, 0, () => 0);

    const sourceA = battlefieldWorldPointToSource(a);
    expect(sourceA.x).toBeCloseTo(500, 6);
    expect(sourceA.y).toBeCloseTo(500, 6);
  });

  it("allows each soldier to participate in at most one selected contact per logic tick", () => {
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

  it("applies exactly three decaying away-from-contact impulse ticks after the retained 24-unit correction", () => {
    const a = soldierAtSource("a", "player", 500, 500);
    const b = soldierAtSource("b", "enemy", 530, 500);
    a.stats.foot = 3;
    b.stats.foot = 3;
    const roster = [a, b];
    resetNormalContactScheduler(roster);

    updateNormalCombatContests(roster, 0, () => 0);
    expect(battlefieldWorldPointToSource(a).x).toBeCloseTo(506, 6);
    expect(battlefieldWorldPointToSource(b).x).toBeCloseTo(530, 6);

    for (let tick = 1; tick <= SWF_GENERIC_CONTACT_K_TICKS; tick += 1) {
      updateNormalCombatContests(roster, SWF_NORMAL_CONTACT_TICK_MS * tick + 0.01, () => 0);
    }

    const sourceA = battlefieldWorldPointToSource(a);
    const sourceB = battlefieldWorldPointToSource(b);
    const totalImpulse = 3 * (1 + 0.7 + 0.49);
    expect(sourceA.x).toBeCloseTo(506 - totalImpulse, 5);
    expect(sourceB.x).toBeCloseTo(530 + totalImpulse, 5);
    expect(sourceA.y).toBeCloseTo(500, 5);
    expect(sourceB.y).toBeCloseTo(500, 5);
    expect(isRawGenericContactImpulseActive(a)).toBe(true);
    expect(isRawGenericContactImpulseActive(b)).toBe(true);

    updateNormalCombatContests(roster, SWF_NORMAL_CONTACT_TICK_MS * (SWF_GENERIC_CONTACT_K_TICKS + 1) + 0.01, () => 0);
    expect(isRawGenericContactImpulseActive(a)).toBe(false);
    expect(isRawGenericContactImpulseActive(b)).toBe(false);
  });
});
