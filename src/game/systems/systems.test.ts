import { describe, expect, it } from "vitest";
import { createSoldier } from "../entities/Soldier";
import { createArmy } from "../factories/createArmy";
import {
  findNearestEnemy,
  findNearestEnemyWithinRange,
  isAtAnchor,
  updateDefendAI,
  updateMeleeAI,
  updateWaitAI,
} from "./aiSystem";
import { applyDamage } from "./combatSystem";
import { getBattleResult } from "./victorySystem";

describe("battle systems", () => {
  it("assigns the configured team-wide default strategy", () => {
    const countStrategies = (team: ReturnType<typeof createArmy>) =>
      team.filter((unit) => unit.controller === "ai").reduce<Record<string, number>>((counts, unit) => {
        counts[unit.strategy] = (counts[unit.strategy] ?? 0) + 1;
        return counts;
      }, {});
    expect(countStrategies(createArmy("player"))).toEqual({ melee: 28, charge: 1 });
    expect(countStrategies(createArmy("enemy"))).toEqual({ melee: 29, charge: 1 });
  });

  it("finds the nearest living enemy", () => {
    const unit = createSoldier("p", "player", "player", 0, 0);
    const near = createSoldier("e1", "enemy", "ai", 10, 0);
    const far = createSoldier("e2", "enemy", "ai", 50, 0);
    expect(findNearestEnemy(unit, [unit, far, near])).toBe(near);
  });

  it("marks a soldier dead at zero HP", () => {
    const target = createSoldier("e", "enemy", "ai", 0, 0);
    applyDamage(target, 100);
    expect(target).toMatchObject({ hp: 0, isDead: true });
  });

  it("detects victory and defeat", () => {
    const player = createSoldier("p", "player", "player", 0, 0);
    const enemy = createSoldier("e", "enemy", "ai", 0, 0);
    expect(getBattleResult([player, enemy])).toBeNull();
    enemy.isDead = true;
    expect(getBattleResult([player, enemy])).toBe("VICTORY");
    enemy.isDead = false;
    player.isDead = true;
    expect(getBattleResult([player, enemy])).toBe("DEFEAT");
  });

  it("only finds enemies inside the requested recognition range", () => {
    const unit = createSoldier("p", "player", "ai", 0, 0, "wait");
    const enemy = createSoldier("e", "enemy", "ai", 120, 0);
    expect(findNearestEnemyWithinRange(unit, [unit, enemy], 100)).toBeNull();
    expect(findNearestEnemyWithinRange(unit, [unit, enemy], 120)).toBe(enemy);
  });

  it("keeps defenders home when an enemy is outside their zone", () => {
    const defender = createSoldier("p", "player", "ai", 100, 500, "defend");
    const enemy = createSoldier("e", "enemy", "ai", 100, 100);
    updateDefendAI(defender, [defender, enemy]);
    expect(defender.targetId).toBeNull();
    expect([defender.moveTargetX, defender.moveTargetY]).toEqual([defender.anchorX, defender.anchorY]);
  });

  it("does not let waiting soldiers chase distant enemies", () => {
    const waiting = createSoldier("p", "player", "ai", 100, 500, "wait");
    const enemy = createSoldier("e", "enemy", "ai", 100, 200);
    updateWaitAI(waiting, [waiting, enemy]);
    expect(waiting.targetId).toBeNull();
  });

  it("makes melee soldiers retain a living target and discard a dead one", () => {
    const melee = createSoldier("p", "player", "ai", 0, 0, "melee");
    const near = createSoldier("near", "enemy", "ai", 20, 0);
    const far = createSoldier("far", "enemy", "ai", 50, 0);
    updateMeleeAI(melee, [melee, near, far]);
    expect(melee.targetId).toBe("near");
    near.isDead = true;
    updateMeleeAI(melee, [melee, near, far]);
    expect(melee.targetId).toBe("far");
  });

  it("recognizes arrival at the stored anchor", () => {
    const unit = createSoldier("p", "player", "ai", 10, 20, "wait");
    expect(isAtAnchor(unit)).toBe(true);
    unit.x += 10;
    expect(isAtAnchor(unit)).toBe(false);
  });
});
