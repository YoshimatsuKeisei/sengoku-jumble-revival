import { describe, expect, it } from "vitest";
import { battlefieldSourcePointToWorld } from "../../src/game/battlefieldLayout";
import { createSoldier } from "../../src/game/entities/Soldier";
import type { Soldier } from "../../src/game/types";
import { findArrowTarget } from "../../src/game/systems/arrowAttackSystem";

function archer(id: string, sourceX = 520): Soldier {
  const point = battlefieldSourcePointToWorld({ x: sourceX, y: 450 });
  const soldier = createSoldier(id, "player", "ai", point.x, point.y);
  soldier.unitType = "ARCHER";
  soldier.technique = "ARCHER_ARROW";
  return soldier;
}

function enemy(id: string, sourceX: number): Soldier {
  const point = battlefieldSourcePointToWorld({ x: sourceX, y: 450 });
  return createSoldier(id, "enemy", "ai", point.x, point.y);
}

describe("SWF conformance: ranged target acquisition", () => {
  it("uses an existing l target for ordinary ranged activation", () => {
    const subject = archer("latched");
    const target = enemy("target", 600);
    subject.strategy = "charge";
    subject.targetId = target.id;

    expect(findArrowTarget(subject, [subject, target])?.id).toBe(target.id);
  });

  it("does not invent an unlatched target for a non-wait strategy", () => {
    const subject = archer("charge");
    const target = enemy("target", 590);
    subject.strategy = "charge";
    subject.targetId = null;

    expect(findArrowTarget(subject, [subject, target])).toBeNull();
  });

  it("allows the pp14/15 wait-state local f[][] scan without persisting l", () => {
    const subject = archer("wait");
    const target = enemy("target", 590);
    subject.strategy = "wait";
    subject.targetId = null;

    expect(findArrowTarget(subject, [subject, target])?.id).toBe(target.id);
    expect(subject.targetId).toBeNull();
  });

  it("uses raw grid coverage rather than radial range for the wait-state scan", () => {
    const subject = archer("wait-grid");
    const inside = enemy("inside", 590); // round(590/36)=16, inside cells 13..16.
    const radialButOutsideGrid = enemy("outside", 600); // distance 80 < tk108, but round(600/36)=17.
    subject.strategy = "wait";
    subject.targetId = null;

    expect(findArrowTarget(subject, [subject, radialButOutsideGrid])).toBeNull();
    expect(findArrowTarget(subject, [subject, inside])?.id).toBe(inside.id);
  });
});
