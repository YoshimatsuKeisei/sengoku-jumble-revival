import { describe, expect, it } from "vitest";
import { battlefieldSourcePointToWorld } from "../../src/game/battlefieldLayout";
import { createSoldier } from "../../src/game/entities/Soldier";
import type { Soldier } from "../../src/game/types";
import { createBattleBases } from "../../src/game/systems/baseSystem";
import { COMBAT_GAUGE_UPDATE_INTERVAL_MS } from "../../src/game/systems/combatGaugeSystem";
import { SWF_GENERAL_COMMAND_CALLBACK_ADVANCE_TICKS } from "../../src/game/systems/generalAttackSystem";
import { updateSpecialAttacks } from "../../src/game/systems/specialAttackSystem";
import { swfLogicTicksToMs } from "../../src/game/systems/techniqueCombatProfiles";
import commandSpec from "../../swf-spec/rules/commands.json";

function unit(id: string, team: "player" | "enemy", sourceX: number, sourceY = 450): Soldier {
  const point = battlefieldSourcePointToWorld({ x: sourceX, y: sourceY });
  return createSoldier(id, team, "ai", point.x, point.y);
}

function readyGeneral(id: string, sourceX: number): Soldier {
  const general = unit(id, "player", sourceX);
  general.unitType = "GENERAL";
  general.technique = "GENERAL_COMMAND";
  general.combatGauge = 10_000;
  general.combatGaugeUpdatedAt = 1_000 - COMBAT_GAUGE_UPDATE_INTERVAL_MS;
  return general;
}

function archerWithTarget(enemy: Soldier, gauge = 0): Soldier {
  const archer = unit("archer", "player", 520);
  archer.unitType = "ARCHER";
  archer.technique = "ARCHER_ARROW";
  archer.stats.skill = 100;
  archer.combatGauge = gauge;
  archer.combatGaugeUpdatedAt = gauge > 0 ? 1_000 - COMBAT_GAUGE_UPDATE_INTERVAL_MS : 1_000;
  archer.targetId = enemy.id;
  return archer;
}

describe("SWF conformance: GENERAL_COMMAND kb callback timing", () => {
  it("records frame-13 spl() as a non-immediate callback after 12 child-frame advances", () => {
    const rule = commandSpec.rules.find((candidate) => candidate.id === "GENERAL_SAME_TICK_DEDUPE");
    expect(rule?.status).toBe("confirmed");
    expect(rule?.expected).toMatchObject({
      effectSelectorSpriteId: 800,
      effectSelectorLabel: "kb",
      forcedCallbackSpriteId: 671,
      forcedCallbackFrame: 13,
      forcedCallbackFrameAdvanceTicks: 12,
      forcedCallbackFunction: "spl",
      playerControlledRecipientGaugeFloor: 99,
      forcedCallbackIsImmediate: false,
    });
    expect(SWF_GENERAL_COMMAND_CALLBACK_ADVANCE_TICKS).toBe(12);
  });

  it("collapses two same-update commands to one delayed callback instead of firing immediately", () => {
    const generalA = readyGeneral("general-a", 500);
    const generalB = readyGeneral("general-b", 510);
    const enemy = unit("enemy", "enemy", 600);
    const archer = archerWithTarget(enemy);
    const bases = createBattleBases();

    const issued = updateSpecialAttacks([generalA, generalB, archer, enemy], [], bases, 1_000, false, () => 1);
    expect(issued.filter((event) => event.kind === "ARROW")).toHaveLength(0);
    const scheduledIds = issued.flatMap((event) => event.kind === "GENERAL" ? event.forcedAttackerIds : []);
    expect(scheduledIds.filter((id) => id === archer.id)).toHaveLength(1);

    const beforeCallback = updateSpecialAttacks(
      [archer, enemy], [], bases,
      1_000 + swfLogicTicksToMs(SWF_GENERAL_COMMAND_CALLBACK_ADVANCE_TICKS - 1), false, () => 1,
    );
    expect(beforeCallback.filter((event) => event.kind === "ARROW")).toHaveLength(0);

    const callbackAt = 1_000 + swfLogicTicksToMs(SWF_GENERAL_COMMAND_CALLBACK_ADVANCE_TICKS);
    const callback = updateSpecialAttacks([archer, enemy], [], bases, callbackAt, false, () => 1);
    expect(callback.filter((event) => event.kind === "ARROW" && event.projectile.shooterId === archer.id)).toHaveLength(1);
    expect(archer.specialLockUntil).toBe(callbackAt + swfLogicTicksToMs(10));
  });

  it("allows a normal ranged shot at command issue and a second command shot after the later kb callback", () => {
    const general = readyGeneral("general", 500);
    const enemy = unit("enemy", "enemy", 600);
    const archer = archerWithTarget(enemy, 200);
    const bases = createBattleBases();

    const issued = updateSpecialAttacks([general, archer, enemy], [], bases, 1_000, false, () => 1);
    expect(issued.filter((event) => event.kind === "ARROW" && event.projectile.shooterId === archer.id)).toHaveLength(1);
    expect(archer.combatGauge).toBe(100);
    expect(archer.specialLockUntil).toBe(1_000 + swfLogicTicksToMs(10));

    const callbackAt = 1_000 + swfLogicTicksToMs(SWF_GENERAL_COMMAND_CALLBACK_ADVANCE_TICKS);
    const callback = updateSpecialAttacks([archer, enemy], [], bases, callbackAt, false, () => 1);
    expect(callback.filter((event) => event.kind === "ARROW" && event.projectile.shooterId === archer.id)).toHaveLength(1);
    expect(archer.combatGauge).toBe(100);
    expect(archer.specialLockUntil).toBe(callbackAt + swfLogicTicksToMs(10));
  });
});
