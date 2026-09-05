import { describe, expect, it } from "vitest";
import { BATTLEFIELD_CONFIG, STRATEGY_ENGAGEMENT_CONFIG } from "../config";
import { createSoldier } from "../entities/Soldier";
import { clearStaleCombatTarget, invalidateCombatTargetForAll, isValidCombatTarget } from "./combatTargetSystem";
import { updateAiTargets, updateChargeAI, updateMeleeAI } from "./aiSystem";
import { moveAiSoldiers } from "./movementSystem";
import { createBattleBases } from "./baseSystem";
import { getBaseCenter } from "./battlefieldGeometry";

describe("Phase 4C.1 combat target invalidation and base objectives", () => {
  it("accepts normal and retreat targets, rejects healing and battle-out, then accepts battlefield return", () => {
    const attacker = createSoldier("a", "player", "ai", 0, 0); const target = createSoldier("t", "enemy", "ai", 10, 0);
    expect(isValidCombatTarget(attacker, target)).toBe(true);
    target.state = "EMERGENCY_RETREAT"; expect(isValidCombatTarget(attacker, target)).toBe(true);
    target.state = "HEALING"; expect(isValidCombatTarget(attacker, target)).toBe(false);
    target.state = "NORMAL"; target.isDead = true; expect(isValidCombatTarget(attacker, target)).toBe(false);
    target.isDead = false; target.state = "NORMAL"; expect(isValidCombatTarget(attacker, target)).toBe(true);
  });
  it("invalidates every pursuer and clears stale destination and soft approach state", () => {
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
  it("melee engages a nearby valid enemy but falls back to enemy base when only healing enemies exist", () => {
    const melee = createSoldier("m", "player", "ai", 500, 400, "melee");
    const nearby = createSoldier("n", "enemy", "ai", 500 + STRATEGY_ENGAGEMENT_CONFIG.melee.detectionRange - 1, 400);
    updateMeleeAI(melee, [melee, nearby], 0); expect(melee.targetId).toBe(nearby.id);
    nearby.state = "HEALING"; updateMeleeAI(melee, [melee, nearby], 1);
    expect(melee.targetId).toBeNull(); expect(melee.strategyObjectiveKind).toBe("ENEMY_SIDE");
    expect(melee.moveTargetX).toBe(getBaseCenter("enemy").x);
  });
  it("charge ignores far off-path enemies, interrupts for very near enemies, and returns to base when invalid", () => {
    const charge = createSoldier("c", "player", "ai", 500, 400, "charge");
    const far = createSoldier("far", "enemy", "ai", 700, 100);
    updateChargeAI(charge, [charge, far], 0); expect(charge.targetId).toBeNull(); expect(charge.strategyObjectiveKind).toBe("ENEMY_SIDE");
    const blocking = createSoldier("near", "enemy", "ai", 500 + STRATEGY_ENGAGEMENT_CONFIG.charge.detectionRange - 1, 400);
    updateChargeAI(charge, [charge, blocking], 1); expect(charge.targetId).toBe(blocking.id);
    blocking.state = "HEALING"; updateChargeAI(charge, [charge, blocking], 2);
    expect(charge.targetId).toBeNull(); expect(charge.moveTargetX).toBe(getBaseCenter("enemy").x);
  });
  it("the shared cleanup does not alter recovery movement unless it came from combat pursuit", () => {
    const retreating = createSoldier("r", "player", "ai", 500, 400); retreating.state = "EMERGENCY_RETREAT";
    retreating.moveTargetX = 100; retreating.moveTargetY = 300;
    invalidateCombatTargetForAll("some-enemy", [retreating]);
    expect(retreating.moveTargetX).toBe(100); expect(retreating.moveTargetY).toBe(300);
  });
  it("player-controlled soldiers are not moved by strategy target updates", () => {
    const player = createSoldier("p", "player", "player", 500, 400, "charge"); const enemy = createSoldier("e", "enemy", "ai", 510, 400);
    updateAiTargets([player, enemy], 0); expect(player.targetId).toBeNull(); expect(player.x).toBe(500);
  });
});
