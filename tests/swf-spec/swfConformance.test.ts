import { describe, expect, it } from "vitest";
import { battlefieldSourcePointToWorld } from "../../src/game/battlefieldLayout";
import { createSoldier } from "../../src/game/entities/Soldier";
import type { Soldier } from "../../src/game/types";
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
});

describe("SWF conformance: pending evidence", () => {
  it("does not silently promote inferred/unconfirmed major-bug rules", () => {
    expect(baseSpec.rules[0].status).toBe("inferred");
    expect(commandSpec.rules[0].status).toBe("inferred");
    expect(combatSpec.rules[0].status).toBe("unconfirmed");
  });

  it.todo("BASE_CONTACT_BOUNCE_SEQUENCE: add a gating scenario after SWF ordering/re-arm evidence is confirmed");
  it.todo("GENERAL_SAME_TICK_DEDUPE: add a gating same-update overlap scenario after SWF evidence is confirmed");
  it.todo("RANGED_ATTACK_CYCLE_SINGLE_LAUNCH: add a gating projectile-count scenario after SWF cadence is confirmed");
});
