import { describe, expect, it } from "vitest";
import { BASE_CONFIG, SOLDIER_RADIUS } from "../config";
import { createSoldier } from "../entities/Soldier";
import { getBaseAttackSurfaceRect } from "./battlefieldGeometry";
import { canAttackEnemyBase, createBattleBases, damageBase, getBaseForTeam } from "./baseSystem";
import { getBattleResult } from "./victorySystem";

describe("battle base state and contact surface", () => {
  it("creates one PLAYER and one ENEMY base with the existing 30 HP", () => {
    const bases = createBattleBases();
    expect(bases.map((base) => base.team)).toEqual(["player", "enemy"]);
    expect(bases.every((base) => base.hp === BASE_CONFIG.maxHp && base.maxHp === BASE_CONFIG.maxHp)).toBe(true);
    expect(BASE_CONFIG.maxHp).toBe(30);
  });

  it("exposes only the narrow front contact surface as proximity-eligible", () => {
    const base = getBaseForTeam(createBattleBases(), "enemy");
    const surface = getBaseAttackSurfaceRect(base);
    const attacker = createSoldier("a", "player", "ai", surface.x - SOLDIER_RADIUS, surface.y + surface.height / 2);
    expect(canAttackEnemyBase(attacker, base)).toBe(true);
    attacker.y = surface.y - SOLDIER_RADIUS - 1;
    expect(canAttackEnemyBase(attacker, base)).toBe(false);
  });

  it("the compatibility proximity helper does not reject an existing soldier target", () => {
    const base = getBaseForTeam(createBattleBases(), "enemy");
    const surface = getBaseAttackSurfaceRect(base);
    const attacker = createSoldier("a", "player", "ai", surface.x - SOLDIER_RADIUS, surface.y + surface.height / 2);
    attacker.targetId = "enemy-soldier";
    expect(canAttackEnemyBase(attacker, base)).toBe(true);
  });

  it("applies direct base damage and preserves the existing victory resolver", () => {
    const bases = createBattleBases();
    const player = createSoldier("p", "player", "player", 0, 0);
    const enemy = createSoldier("e", "enemy", "ai", 0, 0);
    const enemyBase = getBaseForTeam(bases, "enemy");
    damageBase(enemyBase, 1_000);
    expect(enemyBase.hp).toBe(0);
    expect(enemyBase.isDestroyed).toBe(true);
    expect(getBattleResult([player, enemy], bases)).toBe("VICTORY");
  });

  it("returns DEFEAT through the unchanged resolver when the PLAYER base reaches zero", () => {
    const bases = createBattleBases();
    const player = createSoldier("p", "player", "player", 0, 0);
    const enemy = createSoldier("e", "enemy", "ai", 0, 0);
    damageBase(getBaseForTeam(bases, "player"), BASE_CONFIG.maxHp);
    expect(getBattleResult([player, enemy], bases)).toBe("DEFEAT");
  });
});
