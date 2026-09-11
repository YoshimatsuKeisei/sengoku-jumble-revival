import { describe, expect, it } from "vitest";
import { battlefieldSourcePointToWorld, battlefieldWorldPointToSource } from "../../src/game/battlefieldLayout";
import { createSoldier } from "../../src/game/entities/Soldier";
import type { Soldier } from "../../src/game/types";
import {
  getBaseRect,
  isPointInsideRect,
} from "../../src/game/systems/battlefieldGeometry";
import { createBattleBases, getBaseForTeam, resolveBaseAccessCollisions } from "../../src/game/systems/baseSystem";
import { COMBAT_GAUGE_UPDATE_INTERVAL_MS } from "../../src/game/systems/combatGaugeSystem";
import { getSwfBaseCollisionCodeAtWorld } from "../../src/game/systems/swfBaseCollisionGrid";
import {
  SWF_GENERAL_COMMAND_CALLBACK_DELAY_TICKS,
  updateSpecialAttacks,
} from "../../src/game/systems/specialAttackSystem";
import { swfLogicTicksToMs } from "../../src/game/systems/techniqueCombatProfiles";

function unit(id: string, team: "player" | "enemy", sourceX: number, sourceY = 450): Soldier {
  const world = battlefieldSourcePointToWorld({ x: sourceX, y: sourceY });
  return createSoldier(id, team, "ai", world.x, world.y);
}

function readyAtScd(soldier: Soldier): Soldier {
  soldier.combatGauge = 10_000;
  soldier.combatGaugeUpdatedAt = 1_000 - COMBAT_GAUGE_UPDATE_INTERVAL_MS;
  return soldier;
}

/**
 * These tests describe reconstruction runtime choices after the direct SWF rules
 * have been established in the dedicated conformance files.
 */
describe("runtime characterization for major combat bugs", () => {
  it("collapses two same-update general commands into one delayed ranged callback", () => {
    const generalA = readyAtScd(unit("general-a", "player", 500));
    const generalB = readyAtScd(unit("general-b", "player", 510));
    const archer = unit("archer", "player", 520);
    const enemy = unit("enemy", "enemy", 600);
    generalA.unitType = generalB.unitType = "GENERAL";
    generalA.technique = generalB.technique = "GENERAL_COMMAND";
    archer.unitType = "ARCHER";
    archer.technique = "ARCHER_ARROW";
    archer.combatGauge = 0;
    archer.combatGaugeUpdatedAt = 1_000;
    archer.targetId = enemy.id;

    const commandTick = updateSpecialAttacks(
      [generalA, generalB, archer, enemy], [], createBattleBases(), 1_000, false, () => 1,
    );
    expect(commandTick.filter((event) => event.kind === "ARROW" && event.projectile.shooterId === archer.id)).toHaveLength(0);

    const dueAt = 1_000 + swfLogicTicksToMs(SWF_GENERAL_COMMAND_CALLBACK_DELAY_TICKS);
    const callbackTick = updateSpecialAttacks(
      [generalA, generalB, archer, enemy], [], createBattleBases(), dueAt, false, () => 1,
    );
    const arrows = callbackTick.filter((event) => event.kind === "ARROW" && event.projectile.shooterId === archer.id);
    expect(arrows).toHaveLength(1);
    expect(archer.specialLockUntil).toBeGreaterThan(dueAt);
    expect(archer.activeSpecialTechnique).toBe("ARCHER_ARROW");
  });

  it("lets a command-selected ranged soldier wait for the kb callback instead of firing synchronously", () => {
    const general = readyAtScd(unit("general", "player", 500));
    const archer = unit("archer", "player", 520);
    const enemy = unit("enemy", "enemy", 600);
    general.unitType = "GENERAL";
    general.technique = "GENERAL_COMMAND";
    archer.unitType = "ARCHER";
    archer.technique = "ARCHER_ARROW";
    archer.combatGauge = 10_000;
    archer.combatGaugeUpdatedAt = 1_000;
    archer.targetId = enemy.id;

    const gaugeBefore = archer.combatGauge;
    const commandTick = updateSpecialAttacks(
      [general, archer, enemy], [], createBattleBases(), 1_000, false, () => 1,
    );
    expect(commandTick.filter((event) => event.kind === "ARROW" && event.projectile.shooterId === archer.id)).toHaveLength(0);
    expect(archer.combatGauge).toBe(gaugeBefore);

    const dueAt = 1_000 + swfLogicTicksToMs(SWF_GENERAL_COMMAND_CALLBACK_DELAY_TICKS);
    const callbackTick = updateSpecialAttacks(
      [general, archer, enemy], [], createBattleBases(), dueAt, false, () => 1,
    );
    expect(callbackTick.filter((event) => event.kind === "ARROW" && event.projectile.shooterId === archer.id)).toHaveLength(1);
    expect(archer.specialLockUntil).toBeGreaterThan(dueAt);
  });

  it("rolls idle ranged gauge at each confirmed threshold opportunity instead of banking it for a later burst", () => {
    const archer = unit("banked-archer", "player", 520);
    const enemy = unit("enemy", "enemy", 900);
    archer.unitType = "ARCHER";
    archer.technique = "ARCHER_ARROW";
    archer.stats.skill = 100;
    archer.combatGauge = 0;
    archer.combatGaugeUpdatedAt = 0;

    const bankedAt = COMBAT_GAUGE_UPDATE_INTERVAL_MS * 10 + 1;
    expect(updateSpecialAttacks([archer, enemy], [], createBattleBases(), bankedAt, false, () => 1)).toEqual([]);
    expect(archer.combatGauge).toBe(200);

    enemy.x = unit("range-marker", "enemy", 600).x;
    // Ordinary ranged scd() does not invent a new l. This models the strategy
    // layer establishing the engagement before the next firing opportunity.
    archer.targetId = enemy.id;
    const beforeNextGaugeStep = updateSpecialAttacks(
      [archer, enemy], [], createBattleBases(), bankedAt + 200, false, () => 1,
    );
    expect(beforeNextGaugeStep.filter((event) => event.kind === "ARROW")).toHaveLength(0);
    expect(archer.combatGauge).toBe(200);

    const nextGaugeStep = COMBAT_GAUGE_UPDATE_INTERVAL_MS * 11 + 1;
    const events = updateSpecialAttacks([archer, enemy], [], createBattleBases(), nextGaugeStep, false, () => 1);
    expect(events.filter((event) => event.kind === "ARROW" && event.projectile.shooterId === archer.id)).toHaveLength(1);
    expect(archer.combatGauge).toBe(100);
  });

  it("restores the 2026-09-07 visual-base access guard for zero-code gaps", () => {
    const bases = createBattleBases();
    const base = getBaseForTeam(bases, "enemy");
    const soldier = unit("visual-base-only", "player", 1600, 450);
    const before = { x: soldier.x, y: soldier.y };

    expect(isPointInsideRect(soldier, getBaseRect(base))).toBe(true);
    expect(getSwfBaseCollisionCodeAtWorld(soldier)).toBeNull();
    resolveBaseAccessCollisions([soldier], bases);
    expect(isPointInsideRect(soldier, getBaseRect(base))).toBe(false);
    expect({ x: soldier.x, y: soldier.y }).not.toEqual(before);
  });

  it("preserves an entry-committed own-base retreat while the visual guard blocks normal soldiers", () => {
    const bases = createBattleBases();
    const base = getBaseForTeam(bases, "player");
    const retreating = unit("committed-retreat", "player", 180, 450);
    retreating.state = "EMERGENCY_RETREAT";
    retreating.recoveryGate = "TOP";
    (retreating as Soldier & { recoveryEntryCommitted?: boolean }).recoveryEntryCommitted = true;
    const before = { x: retreating.x, y: retreating.y };

    expect(isPointInsideRect(retreating, getBaseRect(base))).toBe(true);
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
