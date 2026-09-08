import { describe, expect, it } from "vitest";
import { SOLDIER_RADIUS } from "../../src/game/config";
import { battlefieldSourcePointToWorld } from "../../src/game/battlefieldLayout";
import { createSoldier } from "../../src/game/entities/Soldier";
import type { Soldier } from "../../src/game/types";
import { captureSoldierPositions, resolveBaseMovementContacts } from "../../src/game/systems/baseContactSystem";
import { getBaseAttackSurfaceRect, getBaseRect } from "../../src/game/systems/battlefieldGeometry";
import { createBattleBases, getBaseForTeam, resolveBaseAccessCollisions } from "../../src/game/systems/baseSystem";
import { COMBAT_GAUGE_UPDATE_INTERVAL_MS } from "../../src/game/systems/combatGaugeSystem";
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
 * These tests describe the current reconstruction runtime only. They are not
 * SWF-conformance gates until the corresponding rule is promoted to confirmed.
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
    // Gauge banking remains intentionally unchanged because its SWF cap/carry-over
    // semantics are still unconfirmed. The confirmed eight-frame action span now
    // prevents the former four-shot ~150 ms dump.
    expect(arrows).toBe(1);
    expect(archer.combatGauge).toBe(800);
  });

  it("currently turns base re-entry during the contact lock into rectangle snapback without another hit", () => {
    const bases = createBattleBases();
    const base = getBaseForTeam(bases, "enemy");
    const surface = getBaseAttackSurfaceRect(base);
    const rect = getBaseRect(base);
    const attacker = unit("base-attacker", "player", 800);
    attacker.x = surface.x - SOLDIER_RADIUS - 1;
    attacker.y = surface.y + surface.height / 2;
    const crossing = captureSoldierPositions([attacker]);
    attacker.x = surface.x - SOLDIER_RADIUS + 1;

    resolveBaseMovementContacts([attacker], bases, crossing, 0, () => 0.99);
    const hpAfterFirstHit = base.hp;
    const lockAfterFirstHit = attacker.baseContactLockTicks;
    expect(lockAfterFirstHit).toBeGreaterThan(0);

    const beforeReentry = new Map([[attacker.id, { x: rect.x - SOLDIER_RADIUS, y: attacker.y }]]);
    attacker.x = rect.x + 1;
    resolveBaseMovementContacts([attacker], bases, beforeReentry, 1, () => 0.99);
    expect(base.hp).toBe(hpAfterFirstHit);
    expect(attacker.baseContactLockTicks).toBe(lockAfterFirstHit - 1);

    resolveBaseAccessCollisions([attacker], bases);
    expect(attacker.x).toBe(rect.x - SOLDIER_RADIUS);
  });

  it("currently traps off-core charge lanes in a no-damage base collision loop", () => {
    const bases = createBattleBases();
    const base = getBaseForTeam(bases, "enemy");
    const rect = getBaseRect(base);
    const surface = getBaseAttackSurfaceRect(base);
    const attacker = unit("off-core-attacker", "player", 800);

    attacker.y = surface.y - SOLDIER_RADIUS - 2;
    expect(attacker.y).toBeGreaterThan(rect.y);
    expect(attacker.y).toBeLessThan(rect.y + rect.height);

    const hpBefore = base.hp;
    for (let tick = 0; tick < 3; tick += 1) {
      attacker.x = rect.x - SOLDIER_RADIUS - 1;
      const previous = captureSoldierPositions([attacker]);
      attacker.x = rect.x + 1;
      resolveBaseMovementContacts([attacker], bases, previous, tick, () => 0.99);
      expect(base.hp).toBe(hpBefore);
      expect(attacker.baseContactLockTicks).toBe(0);

      resolveBaseAccessCollisions([attacker], bases);
      expect(attacker.x).toBe(rect.x - SOLDIER_RADIUS);
    }
  });
});
