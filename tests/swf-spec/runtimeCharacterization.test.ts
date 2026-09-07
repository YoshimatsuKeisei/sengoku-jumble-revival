import { describe, expect, it } from "vitest";
import { battlefieldSourcePointToWorld } from "../../src/game/battlefieldLayout";
import { createSoldier } from "../../src/game/entities/Soldier";
import type { Soldier } from "../../src/game/types";
import { createBattleBases } from "../../src/game/systems/baseSystem";
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
  it("currently allows two same-update generals to force the same ranged recipient twice", () => {
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
    expect(arrows).toHaveLength(2);
    expect(archer.specialLockUntil).toBe(0);
    expect(archer.activeSpecialTechnique).toBeNull();
  });

  it("currently permits a forced ranged shot and a gauge-driven normal shot in the same update", () => {
    const general = ready(unit("general", "player", 500));
    const archer = ready(unit("archer", "player", 520));
    const enemy = unit("enemy", "enemy", 600);
    general.unitType = "GENERAL";
    general.technique = "GENERAL_COMMAND";
    archer.unitType = "ARCHER";
    archer.technique = "ARCHER_ARROW";

    const events = updateSpecialAttacks(
      [general, archer, enemy], [], createBattleBases(), 1_000, false, () => 1,
    );
    const arrows = events.filter((event) => event.kind === "ARROW" && event.projectile.shooterId === archer.id);
    expect(arrows).toHaveLength(2);
    expect(archer.specialLockUntil).toBeGreaterThan(1_000);
  });
});
