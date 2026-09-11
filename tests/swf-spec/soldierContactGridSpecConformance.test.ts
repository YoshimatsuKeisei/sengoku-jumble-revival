import { describe, expect, it } from "vitest";
import movementSpec from "../../swf-spec/rules/movement.json";

describe("raw SWF soldier contact gating", () => {
  it("keeps the 32/24 geometry behind the sequential f[][] contact gate", () => {
    const rule = movementSpec.rules.find((candidate) => candidate.id === "UNIT_CONTACT_SPACING");
    expect(rule?.status).toBe("confirmed");
    expect(rule?.expected.gridSizeSourceUnits).toBe(36);
    expect(rule?.expected.dynamicSoldierCollisionCodes).toEqual({ minInclusive: 1, maxInclusive: 200 });
    expect(rule?.expected.oldCellClearedBeforeOwnMovement).toBe(true);
    expect(rule?.expected.newCellWrittenAfterOwnMovement).toBe(true);
    expect(rule?.expected.freeProposedCellMovesDirectly).toBe(true);
    expect(rule?.expected.unconditionalAllPairsPostPass).toBe(false);
    expect(rule?.expected.frameUpdateOrder).toEqual(["m200", "m1..m59 ascending"]);
    expect(rule?.expected.m200EnterFrameCallsDThenAl).toBe(true);
    expect(rule?.expected.alNormalRouteCallsD).toBe(true);
    expect(rule?.expected.forcedCurrentTargetAxisThresholdExclusiveSourceUnits).toBe(20);
    expect(rule?.expected.forcedCurrentTargetOverridesGridCandidate).toBe(true);
    expect(rule?.expected.pairCorrectionAxisThresholdExclusiveSourceUnits).toBe(32);
    expect(rule?.expected.pairCorrectionSpacingSourceUnits).toBe(24);
    expect(rule?.expected.pairCorrectionDestinationRequiresGridCode).toBe(0);
    expect(rule?.expected.pairCorrectionMovesOnlyCurrentUnitImmediately).toBe(true);
    expect(rule?.expected.collisionImpulseTicks).toBe(3);
    expect(rule?.expected.collisionImpulseDecayPerTick).toBe(0.7);
    expect(rule?.expected.collisionImpulseUsesOppositeDirections).toBe(true);
  });
});
