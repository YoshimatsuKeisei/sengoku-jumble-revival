import { describe, expect, it } from "vitest";
import { battlefieldSourcePointToWorld } from "../../src/game/battlefieldLayout";
import { createSoldier } from "../../src/game/entities/Soldier";
import type { Soldier } from "../../src/game/types";
import { createBattleBases } from "../../src/game/systems/baseSystem";
import { COMBAT_GAUGE_UPDATE_INTERVAL_MS } from "../../src/game/systems/combatGaugeSystem";
import { SWF_GENERAL_COMMAND_CALLBACK_ADVANCE_TICKS } from "../../src/game/systems/generalAttackSystem";
import { updateSpecialAttacks } from "../../src/game/systems/specialAttackSystem";
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

describe("general-forced ranged activation runtime invariants", () => {
  it("schedules kb but does not action-lock or fire when the later spl callback has no existing l", () => {
    const general = readyAtScd(unit("general", "player", 500));
    const archer = unit("archer", "player", 520);
    general.unitType = "GENERAL";
    general.technique = "GENERAL_COMMAND";
    archer.unitType = "ARCHER";
    archer.technique = "ARCHER_ARROW";
    archer.combatGauge = 0;
    archer.combatGaugeUpdatedAt = 1_000;
    const bases = createBattleBases();

    const issued = updateSpecialAttacks([general, archer], [], bases, 1_000, false, () => 1);
    const command = issued.find((event) => event.kind === "GENERAL" && event.attackerId === general.id);

    expect(command?.kind).toBe("GENERAL");
    if (command?.kind !== "GENERAL") throw new Error("expected GENERAL command event");
    expect(command.recipientIds).toContain(archer.id);
    expect(command.forcedAttackerIds).toContain(archer.id);
    expect(issued.some((event) => event.kind === "ARROW")).toBe(false);
    expect(archer.activeSpecialTechnique).toBeNull();
    expect(archer.specialLockUntil).toBeLessThanOrEqual(1_000);

    const callbackAt = 1_000 + swfLogicTicksToMs(SWF_GENERAL_COMMAND_CALLBACK_ADVANCE_TICKS);
    const callback = updateSpecialAttacks([archer], [], bases, callbackAt, false, () => 1);
    expect(callback.some((event) => event.kind === "ARROW")).toBe(false);
    expect(archer.activeSpecialTechnique).toBeNull();
    expect(archer.specialLockUntil).toBeLessThanOrEqual(callbackAt);
  });
});
