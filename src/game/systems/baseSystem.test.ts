import { describe, expect, it } from "vitest";
import { BASE_CONFIG, COMBAT_TIMING_CONFIG, RECOVERY_CONFIG } from "../config";
import { createSoldier } from "../entities/Soldier";
import type { Soldier } from "../types";
import {
  canAttackEnemyBase,
  createBattleBases,
  damageBase,
  distanceToBaseEdge,
  getBaseForTeam,
} from "./baseSystem";
import { updateAttackStates } from "./attackSystem";
import { updateRecoveryStates } from "./recoverySystem";
import { getBattleResult } from "./victorySystem";
import { moveAiSoldiers } from "./movementSystem";

function attackerAtEnemyBase(controller: "player" | "ai" = "ai"): { attacker: Soldier; bases: ReturnType<typeof createBattleBases> } {
  const bases = createBattleBases();
  const base = getBaseForTeam(bases, "enemy");
  const attacker = createSoldier("attacker", "player", controller, base.x - base.width / 2 - BASE_CONFIG.attackRange, base.y, "charge");
  return { attacker, bases };
}

function completeBaseAttack(soldiers: Soldier[], bases: ReturnType<typeof createBattleBases>, currentTime: number, battleEnded = false) {
  updateAttackStates(soldiers, bases, currentTime, battleEnded);
  return updateAttackStates(soldiers, bases, currentTime + 180, battleEnded);
}

describe("battle base system", () => {
  it("creates one PLAYER and one ENEMY base from config", () => {
    const bases = createBattleBases();
    expect(bases.map((base) => base.team)).toEqual(["player", "enemy"]);
    expect(bases.every((base) => base.hp === BASE_CONFIG.maxHp && base.maxHp === BASE_CONFIG.maxHp)).toBe(true);
  });

  it("does not allow base attacks outside attack range", () => {
    const { attacker, bases } = attackerAtEnemyBase();
    const base = getBaseForTeam(bases, "enemy");
    attacker.y = base.y + base.height * 0.2;
    expect(distanceToBaseEdge(attacker, base)).toBeGreaterThan(BASE_CONFIG.attackRange);
    expect(canAttackEnemyBase(attacker, base)).toBe(false);
  });

  it("deals configured damage inside range and never goes below zero", () => {
    const { attacker, bases } = attackerAtEnemyBase();
    const base = getBaseForTeam(bases, "enemy");
    completeBaseAttack([attacker], bases, 0);
    expect(base.hp).toBe(BASE_CONFIG.maxHp - BASE_CONFIG.damagePerHit);
    damageBase(base, 1_000);
    expect(base.hp).toBe(0);
    expect(base.isDestroyed).toBe(true);
  });

  it("prioritizes an existing Combat Target over the base", () => {
    const { attacker, bases } = attackerAtEnemyBase();
    const base = getBaseForTeam(bases, "enemy");
    attacker.targetId = "enemy-soldier";
    completeBaseAttack([attacker], bases, 0);
    expect(base.hp).toBe(base.maxHp);
  });

  it("can attack a base while other enemy soldiers remain alive", () => {
    const { attacker, bases } = attackerAtEnemyBase();
    const livingEnemy = createSoldier("enemy", "enemy", "ai", 900, 300);
    completeBaseAttack([attacker, livingEnemy], bases, 0);
    expect(getBaseForTeam(bases, "enemy").hp).toBe(BASE_CONFIG.maxHp - 1);
    expect(livingEnemy.isDead).toBe(false);
  });

  it("never places a base ID in targetId or creates Engagement Runtime", () => {
    const { attacker, bases } = attackerAtEnemyBase();
    completeBaseAttack([attacker], bases, 0);
    expect(attacker.targetId).toBeNull();
    expect(attacker.engagementStartedAt).toBeNull();
    expect(attacker.engagementOriginX).toBeNull();
  });

  it("allows NORMAL and ADVANCE soldiers to attack", () => {
    for (const order of [null, "ADVANCE"] as const) {
      const { attacker, bases } = attackerAtEnemyBase();
      if (order) attacker.temporaryOrder = { type: order, issuedAt: 0, expiresAt: 2_000, sourceX: 0, sourceY: 0 };
      completeBaseAttack([attacker], bases, 0);
      expect(getBaseForTeam(bases, "enemy").hp).toBe(BASE_CONFIG.maxHp - 1);
    }
  });

  it("blocks RETREAT and RALLY soldiers from attacking", () => {
    for (const order of ["DEFEND_ORDER", "RALLY"] as const) {
      const { attacker, bases } = attackerAtEnemyBase();
      attacker.temporaryOrder = { type: order, issuedAt: 0, expiresAt: 2_000, sourceX: 0, sourceY: 0 };
      completeBaseAttack([attacker], bases, 0);
      expect(getBaseForTeam(bases, "enemy").hp).toBe(BASE_CONFIG.maxHp);
    }
  });

  it("blocks every Recovery State from attacking", () => {
    for (const state of ["EMERGENCY_RETREAT", "HEALING", "REJOINING"] as const) {
      const { attacker, bases } = attackerAtEnemyBase();
      attacker.state = state;
      completeBaseAttack([attacker], bases, 0);
      expect(getBaseForTeam(bases, "enemy").hp).toBe(BASE_CONFIG.maxHp);
    }
  });

  it("lets recovery interrupt a base opportunity at dangerous HP", () => {
    const { attacker, bases } = attackerAtEnemyBase();
    attacker.hp = attacker.maxHp * RECOVERY_CONFIG.dangerHpRatio;
    updateRecoveryStates([attacker], 0);
    completeBaseAttack([attacker], bases, 0);
    expect(attacker.state).toBe("EMERGENCY_RETREAT");
    expect(getBaseForTeam(bases, "enemy").hp).toBe(BASE_CONFIG.maxHp);
  });

  it("shares the normal attack cooldown", () => {
    const { attacker, bases } = attackerAtEnemyBase();
    const base = getBaseForTeam(bases, "enemy");
    const attackX = attacker.x;
    completeBaseAttack([attacker], bases, 0);
    updateAttackStates([attacker], bases, COMBAT_TIMING_CONFIG.attackWindupMs + COMBAT_TIMING_CONFIG.attackRecoveryMs);
    updateAttackStates([attacker], bases, attacker.attackCooldownMs - 1);
    expect(base.hp).toBe(BASE_CONFIG.maxHp - 1);
    // Phase 4I: a second attack requires re-entering after the base bounce.
    attacker.x = attackX;
    updateAttackStates([attacker], bases, attacker.attackCooldownMs);
    updateAttackStates([attacker], bases, attacker.attackCooldownMs + COMBAT_TIMING_CONFIG.attackWindupMs);
    expect(base.hp).toBe(BASE_CONFIG.maxHp - 2);
  });

  it("allows the player-controlled soldier to auto-attack a base", () => {
    const { attacker, bases } = attackerAtEnemyBase("player");
    completeBaseAttack([attacker], bases, 0);
    expect(getBaseForTeam(bases, "enemy").hp).toBe(BASE_CONFIG.maxHp - 1);
  });

  it("stops an AI soldier instead of moving through a base attack position", () => {
    const { attacker, bases } = attackerAtEnemyBase();
    attacker.moveTargetX = getBaseForTeam(bases, "enemy").x;
    attacker.moveTargetY = getBaseForTeam(bases, "enemy").y;
    const before = { x: attacker.x, y: attacker.y };
    moveAiSoldiers([attacker], 0.1, [], 0, bases);
    expect({ x: attacker.x, y: attacker.y }).toEqual(before);
  });

  it("returns VICTORY immediately when the enemy base reaches zero with enemies alive", () => {
    const bases = createBattleBases();
    const player = createSoldier("p", "player", "player", 0, 0);
    const enemy = createSoldier("e", "enemy", "ai", 0, 0);
    damageBase(getBaseForTeam(bases, "enemy"), BASE_CONFIG.maxHp);
    expect(getBattleResult([player, enemy], bases)).toBe("VICTORY");
  });

  it("returns DEFEAT immediately when the player base reaches zero", () => {
    const bases = createBattleBases();
    const player = createSoldier("p", "player", "player", 0, 0);
    const enemy = createSoldier("e", "enemy", "ai", 0, 0);
    damageBase(getBaseForTeam(bases, "player"), BASE_CONFIG.maxHp);
    expect(getBattleResult([player, enemy], bases)).toBe("DEFEAT");
  });

  it("does not apply additional base damage after battle end", () => {
    const { attacker, bases } = attackerAtEnemyBase();
    const base = getBaseForTeam(bases, "enemy");
    completeBaseAttack([attacker], bases, 0, true);
    expect(base.hp).toBe(base.maxHp);
  });

  it("accepts only the first base destruction in one update", () => {
    const bases = createBattleBases();
    const enemyBase = getBaseForTeam(bases, "enemy");
    const playerBase = getBaseForTeam(bases, "player");
    enemyBase.hp = 1;
    playerBase.hp = 1;
    const player = createSoldier("p", "player", "ai", enemyBase.x - enemyBase.width / 2, enemyBase.y);
    const enemy = createSoldier("e", "enemy", "ai", playerBase.x + playerBase.width / 2, playerBase.y);
    expect(completeBaseAttack([player, enemy], bases, 0)).toBe("enemy");
    expect(enemyBase.hp).toBe(0);
    expect(playerBase.hp).toBe(1);
  });
});
