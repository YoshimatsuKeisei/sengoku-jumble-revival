import { describe, expect, it } from "vitest";
import { battlefieldSourcePointToWorld, battlefieldWorldPointToSource } from "../../src/game/battlefieldLayout";
import { createSoldier } from "../../src/game/entities/Soldier";
import { createBattleBases, resolveBaseAccessCollisions } from "../../src/game/systems/baseSystem";
import { getSwfBaseCollisionCodeAtWorld } from "../../src/game/systems/swfBaseCollisionGrid";
import baseSpec from "../../swf-spec/rules/bases.json";

describe("SWF conformance: complete 996..999 headquarters barrier", () => {
  it("records that 996/997 collide before the team-gated damage branch", () => {
    const rule = baseSpec.rules.find((candidate) => candidate.id === "BASE_CONTACT_BOUNCE_SEQUENCE");
    expect(rule?.status).toBe("confirmed");
    expect(rule?.expected.collisionResponseOccursBeforeTeamDamageGate).toBe(true);
    expect(rule?.expected.friendlyOrIneligibleUnitsStillCollideWith996997).toBe(true);
    expect(rule?.expected.fullBitmapRectangleColliderIsOriginalMechanism).toBe(false);
  });

  it.each([
    ["player", 216, 540, 997, 10],
    ["enemy", 1620, 540, 996, -10],
  ] as const)("prevents a same-side %s soldier from walking through its own central base wall", (team, sourceX, sourceY, code, expectedDeltaX) => {
    const point = battlefieldSourcePointToWorld({ x: sourceX, y: sourceY });
    const soldier = createSoldier(`${team}-friendly-wall`, team, "ai", point.x, point.y);
    const bases = createBattleBases();
    expect(getSwfBaseCollisionCodeAtWorld(soldier)).toBe(code);
    const before = battlefieldWorldPointToSource(soldier);

    resolveBaseAccessCollisions([soldier], bases);

    const after = battlefieldWorldPointToSource(soldier);
    expect(after.x - before.x).toBeCloseTo(expectedDeltaX, 6);
    expect(soldier.baseContactLockTicks).toBe(10);

    // Raw k=10 locks the collision response. The 10-unit fx response can still
    // leave the center in the same rounded 36-unit cell, but it must not be
    // applied repeatedly while the lock is active.
    const locked = { x: soldier.x, y: soldier.y };
    resolveBaseAccessCollisions([soldier], bases);
    expect({ x: soldier.x, y: soldier.y }).toEqual(locked);
    expect(soldier.baseContactLockTicks).toBe(10);
  });

  it("keeps recovery-wall admission exclusive to the matching retreat state", () => {
    const point = battlefieldSourcePointToWorld({ x: 216, y: 432 });
    const normal = createSoldier("player-normal", "player", "ai", point.x, point.y);
    const retreat = createSoldier("player-retreat", "player", "ai", point.x, point.y);
    retreat.state = "EMERGENCY_RETREAT";
    const normalBefore = battlefieldWorldPointToSource(normal);
    const retreatBefore = { x: retreat.x, y: retreat.y };

    resolveBaseAccessCollisions([normal, retreat], createBattleBases());

    const normalAfter = battlefieldWorldPointToSource(normal);
    expect(normalAfter.x - normalBefore.x).toBeCloseTo(6, 6);
    expect({ x: retreat.x, y: retreat.y }).toEqual(retreatBefore);
  });
});
