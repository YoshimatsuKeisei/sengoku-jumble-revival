import { describe, expect, it } from "vitest";
import { battlefieldSourcePointToWorld } from "../../src/game/battlefieldLayout";
import { createSoldier } from "../../src/game/entities/Soldier";
import type { Soldier } from "../../src/game/types";
import { createBattleBases } from "../../src/game/systems/baseSystem";
import { updateSpecialAttacks } from "../../src/game/systems/specialAttackSystem";
import { swfLogicTicksToMs } from "../../src/game/systems/techniqueCombatProfiles";
import { updateInvaderTrapMovement } from "../../src/game/systems/trapAbilitySystem";
import movementSpec from "../../swf-spec/rules/movement.json";
import abilitySpec from "../../swf-spec/rules/abilities.json";
import baseSpec from "../../swf-spec/rules/bases.json";
import commandSpec from "../../swf-spec/rules/commands.json";
import combatSpec from "../../swf-spec/rules/combat.json";

function unit(id: string, team: "player" | "enemy", sourceX: number, sourceY = 450): Soldier {
  const world = battlefieldSourcePointToWorld({ x: sourceX, y: sourceY });
  return createSoldier(id, team, "ai", world.x, world.y);
}

function trapRoster(): Soldier[] {
  return Array.from({ length: 30 }, (_, index) => {
    const defender = unit(`enemy-${index}`, "enemy", 1200, 450 + index);
    if (index === 0) defender.specialAbilities = ["TRAP"];
    return defender;
  });
}

describe("SWF conformance: confirmed rules", () => {
  it("keeps the TRAP half boundary in SWF source coordinates", () => {
    expect(movementSpec.rules[0].status).toBe("confirmed");
    expect(movementSpec.rules[0].expected.sourceCenterX).toBe(900);

    const defenders = trapRoster();
    const safe = unit("safe", "player", 899);
    const safePrev = new Map([[safe.id, { x: safe.x - 1, y: safe.y }]]);
    expect(updateInvaderTrapMovement([safe, ...defenders], safePrev, 100, () => 0)).toEqual([]);

    const invader = unit("invader", "player", 901);
    const invadedPrev = new Map([[invader.id, { x: invader.x - 1, y: invader.y }]]);
    expect(updateInvaderTrapMovement([invader, ...defenders], invadedPrev, 100, () => 0)).toEqual([invader.id]);
  });

  it("does not redraw TRAP while the confirmed trap state is active", () => {
    expect(abilitySpec.rules[0].status).toBe("confirmed");
    const defenders = trapRoster();
    const invader = unit("invader", "player", 901);
    const firstPrev = new Map([[invader.id, { x: invader.x - 1, y: invader.y }]]);
    expect(updateInvaderTrapMovement([invader, ...defenders], firstPrev, 100, () => 0)).toEqual([invader.id]);

    const xBeforeSecondMove = invader.x;
    invader.x += 1;
    const secondPrev = new Map([[invader.id, { x: xBeforeSecondMove, y: invader.y }]]);
    expect(updateInvaderTrapMovement([invader, ...defenders], secondPrev, 101, () => 0)).toEqual([]);
  });

  it("caps one successful DOUBLE_SPECIAL occurrence at two total activations", () => {
    const rule = abilitySpec.rules.find((candidate) => candidate.id === "DOUBLE_SPECIAL_MAX_TWO_ACTIVATIONS");
    expect(rule?.status).toBe("confirmed");
    expect(rule?.expected.maxTotalActivationsPerSuccessfulProc).toBe(2);

    const archer = unit("double-archer", "player", 520);
    const enemy = unit("enemy", "enemy", 600);
    archer.unitType = "ARCHER";
    archer.technique = "ARCHER_ARROW";
    archer.specialAbilities = ["DOUBLE_SPECIAL"];
    archer.combatGauge = 250;
    archer.combatGaugeUpdatedAt = 1_000;

    let launches = 0;
    for (const time of [1_000, 1_050, 1_100]) {
      const events = updateSpecialAttacks([archer, enemy], [], createBattleBases(), time, false, () => 0);
      launches += events.filter((event) => event.kind === "ARROW" && event.projectile.shooterId === archer.id).length;
    }
    expect(launches).toBeLessThanOrEqual(2);
  });

  it("holds a fresh ranged activation for the confirmed SWF frames 41-48 interval", () => {
    const rule = combatSpec.rules.find((candidate) => candidate.id === "RANGED_ACTION_FRAME_LOCK");
    expect(rule?.status).toBe("confirmed");
    expect(rule?.expected.sourceFrameCount).toBe(8);
    expect(rule?.expected.swfFps).toBe(24);

    const archer = unit("cycle-archer", "player", 520);
    const enemy = unit("enemy", "enemy", 600);
    archer.unitType = "ARCHER";
    archer.technique = "ARCHER_ARROW";
    archer.combatGauge = 1_000;
    archer.combatGaugeUpdatedAt = 1_000;

    const first = updateSpecialAttacks([archer, enemy], [], createBattleBases(), 1_000, false, () => 1);
    expect(first.filter((event) => event.kind === "ARROW")).toHaveLength(1);

    const beforeCycleEnd = updateSpecialAttacks(
      [archer, enemy], [], createBattleBases(), 1_000 + swfLogicTicksToMs(7), false, () => 1,
    );
    expect(beforeCycleEnd.filter((event) => event.kind === "ARROW")).toHaveLength(0);

    const atCycleEnd = updateSpecialAttacks(
      [archer, enemy], [], createBattleBases(), 1_000 + swfLogicTicksToMs(8), false, () => 1,
    );
    expect(atCycleEnd.filter((event) => event.kind === "ARROW")).toHaveLength(1);
  });

  it("puts a GENERAL_COMMAND-forced ranged activation into the same confirmed SWF action interval", () => {
    const rule = combatSpec.rules.find((candidate) => candidate.id === "RANGED_ACTION_FRAME_LOCK");
    expect(rule?.status).toBe("confirmed");

    const generalA = unit("general-a", "player", 500);
    const generalB = unit("general-b", "player", 510);
    const archer = unit("forced-archer", "player", 520);
    const enemy = unit("enemy", "enemy", 600);
    generalA.unitType = generalB.unitType = "GENERAL";
    generalA.technique = generalB.technique = "GENERAL_COMMAND";
    generalA.combatGauge = generalB.combatGauge = 10_000;
    generalA.combatGaugeUpdatedAt = generalB.combatGaugeUpdatedAt = 1_000;
    archer.unitType = "ARCHER";
    archer.technique = "ARCHER_ARROW";
    archer.combatGauge = 0;
    archer.combatGaugeUpdatedAt = 1_000;

    const events = updateSpecialAttacks(
      [generalA, generalB, archer, enemy], [], createBattleBases(), 1_000, false, () => 1,
    );
    const arrows = events.filter((event) => event.kind === "ARROW" && event.projectile.shooterId === archer.id);
    expect(arrows).toHaveLength(1);
    expect(archer.specialLockUntil).toBe(1_000 + swfLogicTicksToMs(8));
    expect(archer.activeSpecialTechnique).toBe("ARCHER_ARROW");
  });
});

describe("SWF conformance: pending evidence", () => {
  it("does not silently promote inferred/unconfirmed major-bug rules", () => {
    expect(baseSpec.rules.find((candidate) => candidate.id === "BASE_CONTACT_BOUNCE_SEQUENCE")?.status).toBe("inferred");
    expect(baseSpec.rules.find((candidate) => candidate.id === "BASE_ATTACK_SURFACE_VERTICAL_SPAN")?.status).toBe("unconfirmed");
    expect(baseSpec.rules.find((candidate) => candidate.id === "BASE_ATTACK_OFF_CENTER_LANES_EXIST")?.status).toBe("inferred");
    expect(baseSpec.rules.find((candidate) => candidate.id === "FRIENDLY_BASE_RETREAT_GATE_CONGESTION")?.status).toBe("inferred");
    expect(commandSpec.rules.find((candidate) => candidate.id === "GENERAL_SAME_TICK_DEDUPE")?.status).toBe("inferred");
    expect(combatSpec.rules.find((candidate) => candidate.id === "RANGED_ATTACK_CYCLE_SINGLE_LAUNCH")?.status).toBe("unconfirmed");
    expect(combatSpec.rules.find((candidate) => candidate.id === "RANGED_GAUGE_BANKING_LIMIT")?.status).toBe("unconfirmed");
  });

  it.todo("BASE_CONTACT_BOUNCE_SEQUENCE: add a gating scenario after SWF ordering/re-arm evidence is confirmed");
  it.todo("BASE_ATTACK_OFF_CENTER_LANES_EXIST: promote only after direct SWF hit-test evidence defines the attackable span");
  it.todo("FRIENDLY_BASE_RETREAT_GATE_CONGESTION: promote only after direct SWF gate-entry/collision evidence is recovered");
  it.todo("GENERAL_SAME_TICK_DEDUPE: add a gating same-update overlap scenario after SWF evidence is confirmed");
  it.todo("RANGED_ATTACK_CYCLE_SINGLE_LAUNCH: add a gating projectile-count scenario after SWF cadence is confirmed");
});
