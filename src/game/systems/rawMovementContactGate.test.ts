import { afterEach, describe, expect, it } from "vitest";
import { battlefieldSourcePointToWorld, battlefieldWorldPointToSource } from "../battlefieldLayout";
import { createSoldier } from "../entities/Soldier";
import { moveAiSoldiers, movePlayer } from "./movementSystem";
import {
  beginRawAiMovementContactGate,
  beginRawSoldierMovementStep,
  drainRawMovementContactEvents,
  endRawAiMovementContactGate,
  finishRawSoldierMovementStep,
  getRawAiMovementStepDecision,
  getRawMovementGateCell,
  resetRawMovementContactEvents,
} from "./rawMovementContactGateSystem";

function soldierAtSource(
  id: string,
  team: "player" | "enemy",
  sourceX: number,
  sourceY: number,
  controller: "ai" | "player" = "ai",
) {
  const world = battlefieldSourcePointToWorld({ x: sourceX, y: sourceY });
  return createSoldier(id, team, controller, world.x, world.y, "melee");
}

afterEach(() => {
  endRawAiMovementContactGate();
  resetRawMovementContactEvents();
});

describe("raw pre-move enemy contact gate probe", () => {
  it("quantizes candidate positions on the raw 36-unit spatial grid", () => {
    const world = battlefieldSourcePointToWorld({ x: 72, y: 108 });
    expect(getRawMovementGateCell(world)).toEqual({ x: 2, y: 3 });
  });

  it("commits only the first step that enters normal contact", () => {
    const mover = soldierAtSource("mover", "player", 500, 500);
    const enemy = soldierAtSource("enemy", "enemy", 533, 500);
    beginRawAiMovementContactGate([mover, enemy]);
    beginRawSoldierMovementStep(mover);

    const outside = battlefieldSourcePointToWorld({ x: 501, y: 500 });
    const crossing = battlefieldSourcePointToWorld({ x: 502, y: 500 });
    expect(getRawAiMovementStepDecision(mover, outside)).toBe("MOVE");
    expect(getRawAiMovementStepDecision(mover, crossing)).toBe("MOVE_AND_STOP");

    finishRawSoldierMovementStep(mover);
  });

  it("records the exact enemy that caused the pre-move stop", () => {
    const mover = soldierAtSource("mover", "player", 500, 500);
    const enemy = soldierAtSource("enemy", "enemy", 533, 500);
    const otherEnemy = soldierAtSource("other", "enemy", 529, 500);
    beginRawAiMovementContactGate([mover, enemy, otherEnemy]);
    beginRawSoldierMovementStep(mover);

    const crossing = battlefieldSourcePointToWorld({ x: 502, y: 500 });
    expect(getRawAiMovementStepDecision(mover, crossing)).toBe("MOVE_AND_STOP");
    finishRawSoldierMovementStep(mover);
    endRawAiMovementContactGate();

    expect(drainRawMovementContactEvents()).toEqual([
      { moverId: mover.id, opponentId: enemy.id },
    ]);
  });

  it("blocks a step that moves deeper into an already active enemy contact", () => {
    const mover = soldierAtSource("mover", "player", 500, 500);
    const enemy = soldierAtSource("enemy", "enemy", 530, 500);
    beginRawAiMovementContactGate([mover, enemy]);
    beginRawSoldierMovementStep(mover);

    const closer = battlefieldSourcePointToWorld({ x: 501, y: 500 });
    const farther = battlefieldSourcePointToWorld({ x: 499, y: 500 });
    expect(getRawAiMovementStepDecision(mover, closer)).toBe("STOP");
    expect(getRawAiMovementStepDecision(mover, farther)).toBe("MOVE");

    finishRawSoldierMovementStep(mover);
  });

  it("does not gate same-team movement in this isolated probe", () => {
    const mover = soldierAtSource("mover", "player", 500, 500);
    const ally = soldierAtSource("ally", "player", 530, 500);
    beginRawAiMovementContactGate([mover, ally]);
    beginRawSoldierMovementStep(mover);

    const closer = battlefieldSourcePointToWorld({ x: 501, y: 500 });
    expect(getRawAiMovementStepDecision(mover, closer)).toBe("MOVE");

    finishRawSoldierMovementStep(mover);
  });

  it("stops an AI movement frame at the first sub-step that enters enemy contact", () => {
    const mover = soldierAtSource("mover", "player", 500, 500);
    const enemy = soldierAtSource("enemy", "enemy", 533, 500);
    const destination = battlefieldSourcePointToWorld({ x: 700, y: 500 });
    mover.moveTargetX = destination.x;
    mover.moveTargetY = destination.y;

    moveAiSoldiers([mover, enemy], 0.25, [], 0, []);

    const sourceMover = battlefieldWorldPointToSource(mover);
    const sourceEnemy = battlefieldWorldPointToSource(enemy);
    const separation = sourceEnemy.x - sourceMover.x;
    expect(sourceMover.x).toBeGreaterThan(500);
    expect(sourceMover.x).toBeLessThan(sourceEnemy.x);
    expect(separation).toBeGreaterThan(20);
    expect(separation).toBeLessThan(32);
  });

  it("leaves player movement unchanged because the probe is scoped to the AI pass", () => {
    const player = soldierAtSource("player", "player", 500, 500, "player");
    const before = battlefieldWorldPointToSource(player);
    movePlayer(player, 1, 0, 0.1, [], false, 0);
    const after = battlefieldWorldPointToSource(player);
    expect(after.x).toBeGreaterThan(before.x);
  });
});
