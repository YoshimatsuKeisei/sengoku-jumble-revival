import { describe, expect, it } from "vitest";
import { battlefieldSourcePointToWorld, battlefieldWorldPointToSource } from "../../src/game/battlefieldLayout";
import { createSoldier } from "../../src/game/entities/Soldier";
import type { Soldier } from "../../src/game/types";
import { createBattleBases } from "../../src/game/systems/baseSystem";
import { updateRecoveryStates } from "../../src/game/systems/recoverySystem";
import baseSpec from "../../swf-spec/rules/bases.json";

function retreating(id: string, team: "player" | "enemy", sourceX: number, sourceY: number): Soldier {
  const world = battlefieldSourcePointToWorld({ x: sourceX, y: sourceY });
  const soldier = createSoldier(id, team, "ai", world.x, world.y);
  soldier.state = "EMERGENCY_RETREAT";
  soldier.recoveryTargetKind = "BASE_GATE";
  soldier.recoveryHealerId = null;
  return soldier;
}

function sourceTarget(soldier: Soldier): { x: number; y: number } {
  expect(soldier.moveTargetX).not.toBeNull();
  expect(soldier.moveTargetY).not.toBeNull();
  return battlefieldWorldPointToSource({ x: soldier.moveTargetX!, y: soldier.moveTargetY! });
}

describe("SWF conformance: direct recovery entry states", () => {
  it("uses the original player p91 outer waypoints selected by source y=576", () => {
    const rule = baseSpec.rules.find((candidate) => candidate.id === "FRIENDLY_BASE_RETREAT_GATE_CONGESTION");
    expect(rule?.status).toBe("confirmed");

    const bases = createBattleBases();
    const upper = retreating("player-upper-route", "player", 500, 500);
    updateRecoveryStates([upper], 1 / 60, bases, () => 1, 1_000);
    const upperTarget = sourceTarget(upper);
    expect(upperTarget.x).toBeCloseTo(140, 6);
    expect(upperTarget.y).toBeCloseTo(249, 6);

    const lower = retreating("player-lower-route", "player", 500, 600);
    updateRecoveryStates([lower], 1 / 60, bases, () => 1, 1_000);
    const lowerTarget = sourceTarget(lower);
    expect(lowerTarget.x).toBeCloseTo(140, 6);
    expect(lowerTarget.y).toBeCloseTo(946, 6);
  });

  it("latches the original player p93 entry phase once source x is below 232", () => {
    const bases = createBattleBases();
    const soldier = retreating("player-entry-commit", "player", 231, 249);

    updateRecoveryStates([soldier], 1 / 60, bases, () => 1, 1_000);
    const target = sourceTarget(soldier);
    expect(target.x).toBeCloseTo(70, 6);
    expect(target.y).toBeCloseTo(580, 6);
    expect((soldier as Soldier & { recoveryEntryCommitted?: boolean }).recoveryEntryCommitted).toBe(true);
    expect(soldier.state).toBe("EMERGENCY_RETREAT");
  });

  it("latches the original enemy p94 entry phase once source x is above 1612", () => {
    const bases = createBattleBases();
    const soldier = retreating("enemy-entry-commit", "enemy", 1613, 249);

    updateRecoveryStates([soldier], 1 / 60, bases, () => 1, 1_000);
    const target = sourceTarget(soldier);
    expect(target.x).toBeCloseTo(1825, 6);
    expect(target.y).toBeCloseTo(580, 6);
    expect((soldier as Soldier & { recoveryEntryCommitted?: boolean }).recoveryEntryCommitted).toBe(true);
    expect(soldier.state).toBe("EMERGENCY_RETREAT");
  });

  it("enters player healing from confirmed recovery tile 999 without an alpha-gate-span check", () => {
    const bases = createBattleBases();
    const soldier = retreating("player-tile-999", "player", 216, 432);
    soldier.recoveryGate = "TOP";

    updateRecoveryStates([soldier], 1 / 60, bases, () => 0, 1_000);
    expect(soldier.state).toBe("HEALING");
    expect(soldier.recoveryGateEntered).toBe(true);
  });

  it("enters enemy healing from confirmed recovery tile 998", () => {
    const bases = createBattleBases();
    const soldier = retreating("enemy-tile-998", "enemy", 1620, 432);
    soldier.recoveryGate = "TOP";

    updateRecoveryStates([soldier], 1 / 60, bases, () => 0, 1_000);
    expect(soldier.state).toBe("HEALING");
    expect(soldier.recoveryGateEntered).toBe(true);
  });
});
