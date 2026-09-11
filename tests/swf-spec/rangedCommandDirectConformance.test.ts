import { describe, expect, it } from "vitest";
import { battlefieldSourcePointToWorld } from "../../src/game/battlefieldLayout";
import { createSoldier } from "../../src/game/entities/Soldier";
import type { Soldier } from "../../src/game/types";
import { createBattleBases } from "../../src/game/systems/baseSystem";
import { beginTechniqueAction, COMBAT_GAUGE_UPDATE_INTERVAL_MS } from "../../src/game/systems/combatGaugeSystem";
import { SWF_GENERAL_COMMAND_CALLBACK_ADVANCE_TICKS } from "../../src/game/systems/generalAttackSystem";
import { updateSpecialAttacks } from "../../src/game/systems/specialAttackSystem";
import { swfLogicTicksToMs } from "../../src/game/systems/techniqueCombatProfiles";
import commandSpec from "../../swf-spec/rules/commands.json";
import combatSpec from "../../swf-spec/rules/combat.json";

function unit(id: string, team: "player" | "enemy", sourceX: number, sourceY = 450): Soldier {
  const point = battlefieldSourcePointToWorld({ x: sourceX, y: sourceY });
  return createSoldier(id, team, "ai", point.x, point.y);
}

describe("SWF conformance: direct ranged and general-command AVM1", () => {
  it("records the direct SWF command callback and ranged launch metadata as confirmed", () => {
    const command = commandSpec.rules.find((rule) => rule.id === "GENERAL_SAME_TICK_DEDUPE");
    expect(command?.status).toBe("confirmed");
    expect(command?.expected).toMatchObject({
      maxForcedActivationsPerSoldierPerTick: 1,
      swfMode: 4,
      recipientGeneralCharacterCodeExcluded: 3,
      recipientRequiresSpZero: true,
      effectSelectorSpriteId: 800,
      effectSelectorLabel: "kb",
      forcedCallbackSpriteId: 671,
      forcedCallbackFrame: 13,
      forcedCallbackFrameAdvanceTicks: 12,
      forcedCallbackFunction: "spl",
      forcedCallbackIsImmediate: false,
    });

    const launch = combatSpec.rules.find((rule) => rule.id === "RANGED_ATTACK_CYCLE_SINGLE_LAUNCH");
    expect(launch?.status).toBe("confirmed");
    expect(launch?.expected).toMatchObject({
      projectileLaunchesPerAttackCycle: 1,
      attackResolutionCallsPerSuccessfulSpl: 1,
      projectileChildSpriteId: 1002,
      projectileInstanceName: "ya",
      projectileChildInstancesPerDirectionalPose: 1,
      projectileChildTimelineFrames: 5,
      projectileChildLoops: false,
    });
  });

  it("uses the direct SWF k=10 ranged action lock rather than treating direction frames 41-48 as elapsed time", () => {
    const rule = combatSpec.rules.find((candidate) => candidate.id === "RANGED_ACTION_FRAME_LOCK");
    expect(rule?.status).toBe("confirmed");
    expect(rule?.expected).toMatchObject({
      directionPoseSourceFrameStart: 41,
      directionPoseSourceFrameEnd: 48,
      directionPoseCount: 8,
      directionPoseSelection: "gotoAndStop(fi + 40)",
      mustNotInterpretDirectionFramesAsSequentialCadence: true,
      actionLockVariable: "k",
      actionLockLogicTicks: 10,
      minimumFreshActivationIntervalTicks: 10,
    });

    const archer = unit("k10-archer", "player", 520);
    const enemy = unit("enemy", "enemy", 600);
    archer.unitType = "ARCHER";
    archer.technique = "ARCHER_ARROW";
    archer.stats.skill = 100;
    archer.combatGauge = 200;
    archer.combatGaugeUpdatedAt = 1_000 - COMBAT_GAUGE_UPDATE_INTERVAL_MS;
    // Raw normal ranged scd() uses the already-established l target.
    archer.targetId = enemy.id;

    const first = updateSpecialAttacks([archer, enemy], [], createBattleBases(), 1_000, false, () => 1);
    expect(first.filter((event) => event.kind === "ARROW")).toHaveLength(1);
    expect(archer.specialLockUntil).toBe(1_000 + swfLogicTicksToMs(10));
    expect(beginTechniqueAction(archer, 1_000 + swfLogicTicksToMs(9), () => 1, false)).toBe(false);
    expect(beginTechniqueAction(archer, 1_000 + swfLogicTicksToMs(10), () => 1, false)).toBe(true);
  });

  it("emits one ranged launch event for one fresh ranged spl-equivalent activation with an existing l target", () => {
    const archer = unit("single-archer", "player", 520);
    const enemy = unit("single-enemy", "enemy", 600);
    archer.unitType = "ARCHER";
    archer.technique = "ARCHER_ARROW";
    archer.stats.skill = 100;
    archer.combatGauge = 200;
    archer.combatGaugeUpdatedAt = 1_000 - COMBAT_GAUGE_UPDATE_INTERVAL_MS;
    archer.targetId = enemy.id;

    const events = updateSpecialAttacks([archer, enemy], [], createBattleBases(), 1_000, false, () => 1);
    expect(events.filter((event) => event.kind === "ARROW" && event.projectile.shooterId === archer.id)).toHaveLength(1);
    expect(archer.combatGauge).toBe(100);
  });

  it("collapses two same-update general commands to one delayed kb callback for a non-ranged recipient", () => {
    const generalA = unit("general-a", "player", 500);
    const generalB = unit("general-b", "player", 510);
    const spear = unit("spear", "player", 520);
    generalA.unitType = generalB.unitType = "GENERAL";
    generalA.technique = generalB.technique = "GENERAL_COMMAND";
    generalA.combatGauge = generalB.combatGauge = 10_000;
    generalA.combatGaugeUpdatedAt = generalB.combatGaugeUpdatedAt = 1_000 - COMBAT_GAUGE_UPDATE_INTERVAL_MS;
    spear.unitType = "ASHIGARU";
    spear.technique = "ASHIGARU_SPEAR_STRIKE";
    spear.combatGauge = 0;
    spear.combatGaugeUpdatedAt = 1_000;
    const bases = createBattleBases();

    const issued = updateSpecialAttacks([generalA, generalB, spear], [], bases, 1_000, false, () => 1);
    expect(issued.filter((event) => event.kind === "SPEAR" && event.attackerId === spear.id)).toHaveLength(0);
    const scheduled = issued.flatMap((event) => event.kind === "GENERAL" ? event.forcedAttackerIds : []);
    expect(scheduled.filter((id) => id === spear.id)).toHaveLength(1);

    const callbackAt = 1_000 + swfLogicTicksToMs(SWF_GENERAL_COMMAND_CALLBACK_ADVANCE_TICKS);
    const callback = updateSpecialAttacks([spear], [], bases, callbackAt, false, () => 1);
    expect(callback.filter((event) => event.kind === "SPEAR" && event.attackerId === spear.id)).toHaveLength(1);
  });
});
