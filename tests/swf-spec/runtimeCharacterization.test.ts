import { describe, expect, it } from "vitest";
import { battlefieldSourcePointToWorld, battlefieldWorldPointToSource } from "../../src/game/battlefieldLayout";
import { createSoldier } from "../../src/game/entities/Soldier";
import type { Soldier } from "../../src/game/types";
import {
  getBaseRect,
  isPointInsideRect,
  isPointWithinBaseGateSpan,
} from "../../src/game/systems/battlefieldGeometry";
import { createBattleBases, getBaseForTeam, resolveBaseAccessCollisions } from "../../src/game/systems/baseSystem";
import { COMBAT_GAUGE_UPDATE_INTERVAL_MS } from "../../src/game/systems/combatGaugeSystem";
import { getSwfBaseCollisionCodeAtWorld } from "../../src/game/systems/swfBaseCollisionGrid";
import { updateSpecialAttacks } from "../../src/game/systems/specialAttackSystem";

function unit(id: string, team: "player" | "enemy", sourceX: number, sourceY = 450): Soldier {
  const world = battlefieldSourcePointToWorld({ x: sourceX, y: sourceY });
  return createSoldier(id, team, "ai", world.x, world.y);
}

function ready(soldier: Soldier): Soldier {
  soldier.combatGauge = 10_000;
  soldier.combatGaugeUpdatedAt = 1_000;
  return soldier;
}

/**
 * These tests describe the current reconstruction runtime only. Confirmed SWF
 * behavior is gated separately by swfConformance.test.ts.
 */
describe("runtime characterization for major combat bugs", () => {
  it("uses the confirmed ranged action lock to collapse two same-update general-forced shots into one", () => {
    const generalA = ready(unit("general-a", "player", 500));
    const generalB = ready(unit("general-b", "player", 510));
    const archer = unit("archer", "player", 520);
    const enemy = unit("enemy", "enemy", 600);
    generalA.unitType = generalB.unitType = "GENERAL";
    generalA.technique = generalB.technique = "GENERAL_COMMAND";
    archer.unitType = "ARCHER";
    archer.technique = "ARCHER_ARROW";
    archer.combatGauge = 0;
    archer.combatGaugeUpdatedAt = 1_000;

    const events = updateSpecialAttacks(
      [generalA, generalB, archer, enemy], [], createBattleBases(), 1_000, false, () => 1,
    );
    const arrows = events.filter((event) => event.kind === "ARROW" && event.projectile.shooterId === archer.id);
    expect(arrows).toHaveLength(1);
    expect(archer.specialLockUntil).toBeGreaterThan(1_000);
    expect(archer.activeSpecialTechnique).toBe("ARCHER_ARROW");
  });

  it("prevents a general-forced ranged shot and gauge-driven normal shot from firing in the same update", () => {
    const general = ready(unit("general", "player", 500));
    const archer = ready(unit("archer", "player", 520));
    const enemy = unit("enemy", "enemy", 600);
    general.unitType = "GENERAL";
    general.technique = "GENERAL_COMMAND";
    archer.unitType = "ARCHER";
    archer.technique = "ARCHER_ARROW";

    const gaugeBefore = archer.combatGauge;
    const events = updateSpecialAttacks(
      [general, archer, enemy], [], createBattleBases(), 1_000, false, () => 1,
    );
    const arrows = events.filter((event) => event.kind === "ARROW" && event.projectile.shooterId === archer.id);
    expect(arrows).toHaveLength(1);
    expect(archer.specialLockUntil).toBeGreaterThan(1_000);
    expect(archer.combatGauge).toBe(gaugeBefore);
  });

  it("keeps banked ranged gauge but no longer dumps it as a sub-cycle rapid burst", () => {
    const archer = unit("banked-archer", "player", 520);
    const enemy = unit("enemy", "enemy", 900);
    archer.unitType = "ARCHER";
    archer.technique = "ARCHER_ARROW";
    archer.stats.skill = 100;
    archer.combatGauge = 0;
    archer.combatGaugeUpdatedAt = 0;

    const bankedAt = COMBAT_GAUGE_UPDATE_INTERVAL_MS * 10 + 1;
    expect(updateSpecialAttacks([archer, enemy], [], createBattleBases(), bankedAt, false, () => 1)).toEqual([]);
    expect(archer.combatGauge).toBe(1_000);

    enemy.x = unit("range-marker", "enemy", 600).x;
    let arrows = 0;
    for (const offset of [0, 50, 100, 150, 200]) {
      const events = updateSpecialAttacks([archer, enemy], [], createBattleBases(), bankedAt + offset, false, () => 1);
      arrows += events.filter((event) => event.kind === "ARROW" && event.projectile.shooterId === archer.id).length;
    }
    expect(arrows).toBe(1);
    expect(archer.combatGauge).toBe(800);
  });

  it("no longer treats the reconstructed full base image rectangle as a generic collision body", () => {
    const bases = createBattleBases();
    const base = getBaseForTeam(bases, "enemy");
    const soldier = unit("visual-base-only", "player", 1600, 450);
    const before = { x: soldier.x, y: soldier.y };

    expect(isPointInsideRect(soldier, getBaseRect(base))).toBe(true);
    expect(getSwfBaseCollisionCodeAtWorld(soldier)).toBeNull();
    resolveBaseAccessCollisions([soldier], bases);
    expect({ x: soldier.x, y: soldier.y }).toEqual(before);
  });

  it("does not eject an own-base retreating soldier merely for leaving an alpha-derived visual gate span", () => {
    const bases = createBattleBases();
    const base = getBaseForTeam(bases, "player");
    const retreating = unit("visual-gate-span-only", "player", 180, 450);
    retreating.state = "EMERGENCY_RETREAT";
    retreating.recoveryGate = "TOP";
    const before = { x: retreating.x, y: retreating.y };

    expect(isPointInsideRect(retreating, getBaseRect(base))).toBe(true);
    expect(isPointWithinBaseGateSpan(retreating, base, "TOP")).toBe(false);
    expect(getSwfBaseCollisionCodeAtWorld(retreating)).toBeNull();
    resolveBaseAccessCollisions([retreating], bases);
    expect({ x: retreating.x, y: retreating.y }).toEqual(before);
  });

  it("applies the original +6 source-unit response when a non-retreater hits player recovery tile 999", () => {
    const bases = createBattleBases();
    const soldier = unit("player-recovery-wall", "player", 216, 432);
    expect(getSwfBaseCollisionCodeAtWorld(soldier)).toBe(999);
    const sourceBefore = battlefieldWorldPointToSource(soldier);

    resolveBaseAccessCollisions([soldier], bases);
    const sourceAfter = battlefieldWorldPointToSource(soldier);
    expect(sourceAfter.x - sourceBefore.x).toBeCloseTo(6, 6);
    expect(sourceAfter.y).toBeCloseTo(sourceBefore.y, 6);
    expect(soldier.baseContactLockTicks).toBe(10);
  });
});
