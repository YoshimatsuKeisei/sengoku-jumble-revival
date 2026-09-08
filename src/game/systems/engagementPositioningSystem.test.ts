import { describe, expect, it } from "vitest";
import { battlefieldSourcePointToWorld, battlefieldWorldPointToSource } from "../battlefieldLayout";
import { createSoldier } from "../entities/Soldier";
import type { BattleObstacle } from "../types";
import { clearEngagement } from "./aiSystem";
import {
  clearApproachRuntime,
  getPreferredApproachPoint,
  getRawCloseEngagementPoint,
  isApproachPointValid,
  SWF_CLOSE_ENGAGEMENT_AXIS_THRESHOLD_UNITS,
} from "./engagementPositioningSystem";
import { SWF_APPROACH_SPACING_UNITS } from "./techniqueCombatProfiles";

function sourceSoldier(id: string, team: "player" | "enemy", x: number, y: number) {
  const point = battlefieldSourcePointToWorld({ x, y });
  return createSoldier(id, team, "ai", point.x, point.y, "charge");
}

describe("raw SWF close-engagement positioning", () => {
  it("uses strict <20 source-axis proximity and exactly 24 source units of spacing", () => {
    expect(SWF_CLOSE_ENGAGEMENT_AXIS_THRESHOLD_UNITS).toBe(20);
    expect(SWF_APPROACH_SPACING_UNITS).toBe(24);
    const soldier = sourceSoldier("s", "player", 500, 500);
    const target = sourceSoldier("t", "enemy", 518, 500);
    soldier.targetId = target.id;
    const point = getRawCloseEngagementPoint(soldier, target, []);
    expect(point).not.toBeNull();
    const source = battlefieldWorldPointToSource(point!);
    expect(source.x).toBeCloseTo(494);
    expect(source.y).toBeCloseTo(500);
    expect(Math.hypot(source.x - 518, source.y - 500)).toBeCloseTo(24);
  });

  it("does not create a persistent approach point at the strict 20-unit boundary or farther away", () => {
    const soldier = sourceSoldier("s", "player", 500, 500);
    const target = sourceSoldier("t", "enemy", 520, 500);
    soldier.targetId = target.id;
    expect(getRawCloseEngagementPoint(soldier, target, [])).toBeNull();
    expect(getPreferredApproachPoint(soldier, target, [soldier, target], [])).toBeNull();
    expect(soldier.preferredApproachAngle).toBeNull();
    expect(soldier.preferredApproachTargetId).toBeNull();
  });

  it("requires the SWF l-equivalent target relationship and never positions player control", () => {
    const soldier = sourceSoldier("s", "player", 500, 500);
    const target = sourceSoldier("t", "enemy", 518, 500);
    expect(getRawCloseEngagementPoint(soldier, target, [])).toBeNull();
    soldier.targetId = target.id;
    soldier.controller = "player";
    expect(getRawCloseEngagementPoint(soldier, target, [])).toBeNull();
  });

  it("rejects the 24-unit destination when a fixed obstacle occupies it", () => {
    const soldier = sourceSoldier("s", "player", 500, 500);
    const target = sourceSoldier("t", "enemy", 518, 500);
    soldier.targetId = target.id;
    const rawPoint = battlefieldSourcePointToWorld({ x: 494, y: 500 });
    const fence: BattleObstacle = { id: "f", type: "FENCE", x: rawPoint.x - 2, y: rawPoint.y - 2, width: 4, height: 4 };
    expect(isApproachPointValid(rawPoint, [fence])).toBe(false);
    expect(getRawCloseEngagementPoint(soldier, target, [fence])).toBeNull();
  });

  it("clears obsolete soft-positioning runtime rather than retaining a sector or jitter", () => {
    const soldier = sourceSoldier("s", "player", 500, 500);
    soldier.preferredApproachAngle = 1.2;
    soldier.preferredApproachTargetId = "old";
    clearApproachRuntime(soldier);
    expect(soldier.preferredApproachAngle).toBeNull();
    expect(soldier.preferredApproachTargetId).toBeNull();
    clearEngagement(soldier);
    expect(soldier.targetId).toBeNull();
  });
});
