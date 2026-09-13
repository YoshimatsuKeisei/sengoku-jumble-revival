import { describe, expect, it } from "vitest";
import { COMBAT_TIMING_CONFIG } from "../../src/game/config";
import { battlefieldSourcePointToWorld } from "../../src/game/battlefieldLayout";
import { createSoldier } from "../../src/game/entities/Soldier";
import type { Soldier } from "../../src/game/types";
import { startSoldierAttack, updateAttackStates } from "../../src/game/systems/attackSystem";
import { createBattleBases } from "../../src/game/systems/baseSystem";
import combatSpec from "../../swf-spec/rules/combat.json";

function unit(id: string, team: "player" | "enemy", sourceX: number, sourceY: number): Soldier {
  const world = battlefieldSourcePointToWorld({ x: sourceX, y: sourceY });
  return createSoldier(id, team, "ai", world.x, world.y, "melee");
}

function resolveNormalAttack(attacker: Soldier, target: Soldier, random: () => number): void {
  attacker.targetId = target.id;
  expect(startSoldierAttack(attacker, target, 0)).toBe(true);
  updateAttackStates(
    [attacker, target],
    createBattleBases(),
    COMBAT_TIMING_CONFIG.attackWindupMs,
    false,
    random,
  );
}

describe("raw normal melee facing", () => {
  it("records the confirmed defender-facing rule before defense resolution", () => {
    const rule = combatSpec.rules.find((entry) => entry.id === "NORMAL_MELEE_FACING");
    expect(rule?.status).toBe("confirmed");
    expect(rule?.expected).toMatchObject({
      atckMode: 0,
      defenderFacesAttackerBeforeDefenseResolution: true,
      appliesOnHit: true,
      appliesOnGuard: true,
      directionCount: 8,
      continuousAngleFacing: false,
    });
  });

  it("faces a successfully hit defender toward the attacker using raw fi", () => {
    const attacker = unit("attacker", "player", 500, 500);
    const target = unit("target", "enemy", 518, 500);
    target.stats.defense = 0;
    target.facingX = 1;
    target.facingY = 0;

    resolveNormalAttack(attacker, target, () => 1);

    expect(target.combatFeedbackMarker).toBe("H");
    expect(target.reactionState).toBe("HIT_STUN");
    expect(target.facingX).toBeCloseTo(-1, 6);
    expect(target.facingY).toBeCloseTo(0, 6);
  });

  it("faces a guarding defender toward the attacker before the S branch", () => {
    const attacker = unit("attacker", "player", 500, 500);
    const target = unit("target", "enemy", 518, 500);
    target.stats.defense = 200;
    target.facingX = 1;
    target.facingY = 0;
    const hpBefore = target.hp;

    resolveNormalAttack(attacker, target, () => 0);

    expect(target.combatFeedbackMarker).toBe("S");
    expect(target.hp).toBe(hpBefore);
    expect(target.reactionState).toBe("NONE");
    expect(target.facingX).toBeCloseTo(-1, 6);
    expect(target.facingY).toBeCloseTo(0, 6);
  });

  it("uses the SWF eight-way quantization for diagonal melee facing", () => {
    const attacker = unit("attacker", "player", 500, 500);
    const target = unit("target", "enemy", 518, 518);
    target.stats.defense = 0;
    target.facingX = 1;
    target.facingY = 0;

    resolveNormalAttack(attacker, target, () => 1);

    expect(target.combatFeedbackMarker).toBe("H");
    expect(target.facingX).toBeCloseTo(-0.6, 6);
    expect(target.facingY).toBeCloseTo(-0.6, 6);
  });
});
