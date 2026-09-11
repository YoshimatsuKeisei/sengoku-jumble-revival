import { describe, expect, it } from "vitest";
import { battlefieldSourcePointToWorld, battlefieldWorldPointToSource } from "../../src/game/battlefieldLayout";
import { createSoldier } from "../../src/game/entities/Soldier";
import type { Soldier } from "../../src/game/types";
import { executeGunAttack } from "../../src/game/systems/gunAttackSystem";
import { updateReactions } from "../../src/game/systems/reactionSystem";
import { swfLogicTicksToMs } from "../../src/game/systems/techniqueCombatProfiles";

function unit(id: string, team: "player" | "enemy", sourceX: number, sourceY = 500): Soldier {
  const world = battlefieldSourcePointToWorld({ x: sourceX, y: sourceY });
  return createSoldier(id, team, "ai", world.x, world.y);
}

function gunner(): Soldier {
  const soldier = unit("gun", "player", 500);
  soldier.unitType = "TEPPOU";
  soldier.technique = "TEPPOU_SHOOTING";
  return soldier;
}

describe("raw ranged target impulse", () => {
  it("moves an ordinary ranged-hit target 10 source units toward the shooter on the first raw tick", () => {
    const gun = gunner();
    const target = unit("target", "enemy", 700);
    target.stats.defense = 0;
    const targetBefore = battlefieldWorldPointToSource(target);
    const gunBefore = battlefieldWorldPointToSource(gun);

    expect(executeGunAttack(gun, target, 0, () => 1, false, [gun, target])).not.toBeNull();
    expect(target.reactionState).toBe("HIT_STUN");
    expect(target.abilityActionLockUntil).toBeGreaterThanOrEqual(swfLogicTicksToMs(10));
    updateReactions([gun, target], [], swfLogicTicksToMs(1), swfLogicTicksToMs(1));

    const targetAfter = battlefieldWorldPointToSource(target);
    const gunAfter = battlefieldWorldPointToSource(gun);
    expect(targetAfter.x - targetBefore.x).toBeCloseTo(-10, 6);
    expect(targetAfter.y - targetBefore.y).toBeCloseTo(0, 6);
    expect(gunAfter.x).toBeCloseTo(gunBefore.x, 6);
    expect(gunAfter.y).toBeCloseTo(gunBefore.y, 6);
  });

  it("keeps the full 10-unit target impulse on an IRON_WALL guard and gives the shooter no recoil", () => {
    const gun = gunner();
    const target = unit("target", "enemy", 700);
    target.stats.defense = 200;
    target.specialAbilities = ["IRON_WALL"];
    const targetBefore = battlefieldWorldPointToSource(target);
    const gunBefore = battlefieldWorldPointToSource(gun);

    expect(executeGunAttack(gun, target, 0, () => 0, false, [gun, target])).not.toBeNull();
    expect(target.combatFeedbackMarker).toBe("S");
    updateReactions([gun, target], [], swfLogicTicksToMs(1), swfLogicTicksToMs(1));

    const targetAfter = battlefieldWorldPointToSource(target);
    const gunAfter = battlefieldWorldPointToSource(gun);
    expect(targetAfter.x - targetBefore.x).toBeCloseTo(-10, 6);
    expect(targetAfter.y - targetBefore.y).toBeCloseTo(0, 6);
    expect(gunAfter.x).toBeCloseTo(gunBefore.x, 6);
    expect(gunAfter.y).toBeCloseTo(gunBefore.y, 6);
  });
});
