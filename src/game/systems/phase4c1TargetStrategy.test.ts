import { describe, expect, it } from "vitest";
import { createSoldier } from "../entities/Soldier";
import { clearStaleCombatTarget, invalidateCombatTargetForAll, isValidCombatTarget } from "./combatTargetSystem";
import { updateAiTargets, updateChargeAI, updateMeleeAI } from "./aiSystem";
import { moveAiSoldiers } from "./movementSystem";
import { createBattleBases } from "./baseSystem";

describe("combat target invalidation and strategy objectives", () => {
  it("accepts normal and retreat targets, rejects healing and battle-out", () => {
    const attacker = createSoldier("a", "player", "ai", 0, 0); const target = createSoldier("t", "enemy", "ai", 10, 0);
    expect(isValidCombatTarget(attacker, target)).toBe(true);
    target.state = "EMERGENCY_RETREAT"; expect(isValidCombatTarget(attacker, target)).toBe(true);
    target.state = "HEALING"; expect(isValidCombatTarget(attacker, target)).toBe(false);
    target.state = "NORMAL"; target.isDead = true; expect(isValidCombatTarget(attacker, target)).toBe(false);
  });

  it("invalidates every pursuer and clears stale destination and approach state", () => {
    const target = createSoldier("t", "enemy", "ai", 500, 400); target.state = "HEALING";
    const pursuers = [createSoldier("a", "player", "ai", 450, 400), createSoldier("b", "player", "ai", 440, 400)];
    for (const pursuer of pursuers) Object.assign(pursuer, { targetId: target.id, moveTargetX: target.x, moveTargetY: target.y,
      preferredApproachTargetId: target.id, preferredApproachAngle: 1 });
    invalidateCombatTargetForAll(target.id, [...pursuers, target]);
    for (const pursuer of pursuers) {
      expect(pursuer.targetId).toBeNull(); expect(pursuer.moveTargetX).toBeNull();
      expect(pursuer.preferredApproachTargetId).toBeNull(); expect(pursuer.preferredApproachAngle).toBeNull();
    }
  });

  it("movement refuses a stale healing target before using its interior position", () => {
    const pursuer = createSoldier("a", "player", "ai", 400, 400); const target = createSoldier("t", "enemy", "ai", 100, 100);
    target.state = "HEALING"; pursuer.targetId = target.id; pursuer.moveTargetX = target.x; pursuer.moveTargetY = target.y;
    const before = { x: pursuer.x, y: pursuer.y }; moveAiSoldiers([pursuer, target], 1, [], 0, createBattleBases());
    expect(pursuer.targetId).toBeNull(); expect(pursuer.moveTargetX).toBeNull(); expect({ x: pursuer.x, y: pursuer.y }).toEqual(before);
  });

  it("melee uses a random roaming objective instead of an enemy-base fallback after an invalid slot", () => {
    const melee = createSoldier("m", "player", "ai", 500, 400, "melee");
    const enemy = createSoldier("n", "enemy", "ai", 600, 400);
    enemy.state = "HEALING";
    updateMeleeAI(melee, [melee, enemy], 0, () => 0);
    expect(melee.targetId).toBeNull();
    expect(melee.strategyObjectiveKind).toBe("RANDOM_ROAM");
  });

  it("charge ignores nearby enemies and keeps an enemy-side objective", () => {
    const charge = createSoldier("c", "player", "ai", 500, 400, "charge");
    const nearby = createSoldier("near", "enemy", "ai", 501, 400);
    updateChargeAI(charge, [charge, nearby], 0);
    expect(charge.targetId).toBeNull();
    expect(charge.strategyObjectiveKind).toBe("ENEMY_SIDE");
  });

  it("shared cleanup does not alter unrelated recovery movement", () => {
    const retreating = createSoldier("r", "player", "ai", 500, 400); retreating.state = "EMERGENCY_RETREAT";
    retreating.moveTargetX = 100; retreating.moveTargetY = 300;
    invalidateCombatTargetForAll("some-enemy", [retreating]);
    expect(retreating.moveTargetX).toBe(100); expect(retreating.moveTargetY).toBe(300);
  });

  it("player-controlled soldiers are not changed by strategy target updates", () => {
    const player = createSoldier("p", "player", "player", 500, 400, "charge"); const enemy = createSoldier("e", "enemy", "ai", 510, 400);
    clearStaleCombatTarget(player);
    updateAiTargets([player, enemy], 0);
    expect(player.targetId).toBeNull(); expect(player.x).toBe(500);
  });
});
