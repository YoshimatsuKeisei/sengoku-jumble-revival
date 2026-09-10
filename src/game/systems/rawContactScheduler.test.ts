import { afterEach, describe, expect, it } from "vitest";
import { battlefieldSourcePointToWorld } from "../battlefieldLayout";
import { createSoldier } from "../entities/Soldier";
import {
  getRawContactGridCell,
  resetNormalContactScheduler,
  SWF_NORMAL_CONTACT_TICK_MS,
  updateNormalCombatContests,
} from "./normalCombatSystem";
import {
  beginRawAiMovementContactGate,
  beginRawSoldierMovementStep,
  endRawAiMovementContactGate,
  finishRawSoldierMovementStep,
  getRawAiMovementStepDecision,
  resetRawMovementContactEvents,
} from "./rawMovementContactGateSystem";

function soldierAtSource(
  id: string,
  team: "player" | "enemy",
  sourceX: number,
  sourceY: number,
) {
  const world = battlefieldSourcePointToWorld({ x: sourceX, y: sourceY });
  return createSoldier(id, team, "ai", world.x, world.y, "melee");
}

afterEach(() => {
  endRawAiMovementContactGate();
  resetRawMovementContactEvents();
});

describe("raw contact scheduler probe", () => {
  it("quantizes revival positions through the raw 36-unit f-grid", () => {
    const world = battlefieldSourcePointToWorld({ x: 72, y: 108 });
    expect(getRawContactGridCell(world)).toEqual({ x: 2, y: 3 });
  });

  it("runs contact arbitration at no more than the SWF 24 Hz cadence", () => {
    const a = soldierAtSource("a", "player", 500, 500);
    const b = soldierAtSource("b", "enemy", 510, 500);
    a.targetId = b.id;
    b.targetId = a.id;
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

  it("does not modify soldier coordinates while arbitrating contact", () => {
    const a = soldierAtSource("a", "player", 500, 500);
    const b = soldierAtSource("b", "enemy", 510, 505);
    const roster = [a, b];
    const before = roster.map((soldier) => ({ x: soldier.x, y: soldier.y }));

    updateNormalCombatContests(roster, 0, () => 0);

    expect(roster.map((soldier) => ({ x: soldier.x, y: soldier.y }))).toEqual(before);
  });

  it("allows each soldier to participate in at most one contact per logic tick", () => {
    const a = soldierAtSource("a", "player", 500, 500);
    const b = soldierAtSource("b", "enemy", 510, 500);
    const c = soldierAtSource("c", "enemy", 505, 510);
    const roster = [a, b, c];

    let calls = 0;
    updateNormalCombatContests(roster, 0, () => { calls += 1; return 0; });

    expect(calls).toBe(1);
    const started = roster.filter((soldier) => soldier.combatActionState === "ATTACK_WINDUP");
    expect(started).toHaveLength(1);
  });

  it("retains a movement-detected pair until the next 24 Hz combat tick", () => {
    const a = soldierAtSource("a", "player", 500, 500);
    const b = soldierAtSource("b", "enemy", 540, 500);
    const roster = [a, b];
    resetNormalContactScheduler(roster);

    updateNormalCombatContests(roster, 0, () => 0);
    expect(a.combatActionState).toBe("IDLE");

    beginRawAiMovementContactGate(roster);
    beginRawSoldierMovementStep(a);
    const crossing = battlefieldSourcePointToWorld({ x: 509, y: 500 });
    expect(getRawAiMovementStepDecision(a, crossing)).toBe("MOVE_AND_STOP");
    a.x = crossing.x;
    a.y = crossing.y;
    finishRawSoldierMovementStep(a);
    endRawAiMovementContactGate();

    updateNormalCombatContests(roster, SWF_NORMAL_CONTACT_TICK_MS * 0.5, () => 0);
    expect(a.combatActionState).toBe("IDLE");

    updateNormalCombatContests(roster, SWF_NORMAL_CONTACT_TICK_MS + 0.01, () => 0);
    expect(a.combatActionState).toBe("ATTACK_WINDUP");
    expect(a.attackTargetId).toBe(b.id);
  });

  it("prioritizes the enemy that actually blocked movement over a nearer fallback neighbor", () => {
    const a = soldierAtSource("a", "player", 500, 500);
    const b = soldierAtSource("b", "enemy", 533, 500);
    const c = soldierAtSource("c", "enemy", 525, 500);
    const roster = [a, b, c];
    resetNormalContactScheduler(roster);

    beginRawAiMovementContactGate([a, b]);
    beginRawSoldierMovementStep(a);
    const crossing = battlefieldSourcePointToWorld({ x: 502, y: 500 });
    expect(getRawAiMovementStepDecision(a, crossing)).toBe("MOVE_AND_STOP");
    a.x = crossing.x;
    a.y = crossing.y;
    finishRawSoldierMovementStep(a);
    endRawAiMovementContactGate();

    updateNormalCombatContests(roster, 0, () => 0);

    expect(a.combatActionState).toBe("ATTACK_WINDUP");
    expect(a.attackTargetId).toBe(b.id);
    expect(c.combatActionState).toBe("IDLE");
  });
});
