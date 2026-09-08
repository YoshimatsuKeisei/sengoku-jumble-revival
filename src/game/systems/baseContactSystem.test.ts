import { describe, expect, it } from "vitest";
import { BASE_CONTACT_CONFIG, BASE_CONFIG } from "../config";
import { battlefieldSourcePointToWorld } from "../battlefieldLayout";
import { createSoldier } from "../entities/Soldier";
import type { Soldier, Team } from "../types";
import { getBattleResult } from "./victorySystem";
import { getBaseAttackBounceDistance } from "./baseAttackBounceSystem";
import {
  captureSoldierPositions,
  isBaseHitBlockedByFortify,
  resolveBaseMovementContacts,
} from "./baseContactSystem";
import { createBattleBases, getBaseForTeam } from "./baseSystem";

function enterBaseDamageTile(attacker: Soldier, attackedTeam: Team) {
  const y = 540;
  const outside = battlefieldSourcePointToWorld({ x: attackedTeam === "enemy" ? 1595 : 237, y });
  const inside = battlefieldSourcePointToWorld({ x: attackedTeam === "enemy" ? 1605 : 215, y });
  Object.assign(attacker, outside);
  const previous = captureSoldierPositions([attacker]);
  Object.assign(attacker, inside);
  return previous;
}

function makeDefenders(count = 30): Soldier[] {
  return Array.from({ length: count }, (_, index) => createSoldier(`d-${index}`, "enemy", "ai", 2200, 300 + index, "wait"));
}

describe("SWF movement-contact base attacks", () => {
  it("requires entry into the confirmed base-damage tile but does not reject an existing targetId", () => {
    const bases = createBattleBases();
    const base = getBaseForTeam(bases, "enemy");
    const attacker = createSoldier("a", "player", "ai", 0, 0, "charge");
    attacker.targetId = "some-enemy";
    const previous = enterBaseDamageTile(attacker, "enemy");
    resolveBaseMovementContacts([attacker], bases, previous, 0, () => 0.99);
    expect(base.hp).toBe(base.maxHp - 1);

    const miss = createSoldier("miss", "player", "ai", 100, 100, "charge");
    const missPrevious = captureSoldierPositions([miss]);
    miss.x += 10;
    resolveBaseMovementContacts([miss], bases, missPrevious, 0, () => 0.99);
    expect(base.hp).toBe(base.maxHp - 1);
  });

  it("keeps contact independent from the soldier-vs-soldier attack state machine", () => {
    const bases = createBattleBases();
    const base = getBaseForTeam(bases, "enemy");
    const attacker = createSoldier("a", "player", "ai", 0, 0, "charge");
    attacker.combatActionState = "ATTACK_WINDUP";
    attacker.attackTargetKind = "SOLDIER";
    attacker.attackTargetId = "enemy-soldier";
    resolveBaseMovementContacts([attacker], bases, enterBaseDamageTile(attacker, "enemy"), 0, () => 0.99);
    expect(base.hp).toBe(base.maxHp - 1);
    expect(attacker.combatActionState).toBe("ATTACK_WINDUP");
  });

  it("applies normal=1 and 攻略(SIEGE)=2 damage", () => {
    for (const [abilities, damage] of [[[], 1], [["SIEGE"], 2]] as const) {
      const bases = createBattleBases();
      const base = getBaseForTeam(bases, "enemy");
      const attacker = createSoldier(`a-${damage}`, "player", "ai", 0, 0, "charge");
      attacker.specialAbilities = [...abilities];
      resolveBaseMovementContacts([attacker], bases, enterBaseDamageTile(attacker, "enemy"), 0, () => 0.99);
      expect(base.hp).toBe(base.maxHp - damage);
    }
  });

  it("uses two 30-slot FORTIFY draws and lets NINJA ignore the block", () => {
    const attacker = createSoldier("a", "player", "ai", 0, 0, "charge");
    const defenders = makeDefenders();
    defenders[0].specialAbilities = ["FORTIFY"];
    expect(isBaseHitBlockedByFortify(attacker, defenders, () => 0)).toBe(true);
    const secondAttempt = [0.99, 0, 0][Symbol.iterator]();
    expect(isBaseHitBlockedByFortify(attacker, defenders, () => secondAttempt.next().value ?? 0)).toBe(true);
    attacker.unitType = "NINJA";
    expect(isBaseHitBlockedByFortify(attacker, defenders, () => 0)).toBe(false);
  });

  it("bounces after either a successful or blocked contact using the dedicated FORTIFY distance", () => {
    for (const blocked of [false, true]) {
      const bases = createBattleBases();
      const base = getBaseForTeam(bases, "enemy");
      const attacker = createSoldier(`a-${blocked}`, "player", "ai", 0, 0, "charge");
      const defenders = makeDefenders();
      if (blocked) defenders[0].specialAbilities = ["FORTIFY"];
      const previous = enterBaseDamageTile(attacker, "enemy");
      const contactX = attacker.x;
      resolveBaseMovementContacts([attacker, ...defenders], bases, previous, 0, blocked ? () => 0 : () => 0.99);
      expect(attacker.x).toBeLessThan(contactX);
      expect(contactX - attacker.x).toBeCloseTo(getBaseAttackBounceDistance(defenders));
      expect(base.hp).toBe(blocked ? base.maxHp : base.maxHp - 1);
    }
  });

  it("locks exactly 10 subsequent logic updates before another contact can hit", () => {
    const bases = createBattleBases();
    const base = getBaseForTeam(bases, "enemy");
    const attacker = createSoldier("a", "player", "ai", 0, 0, "charge");
    resolveBaseMovementContacts([attacker], bases, enterBaseDamageTile(attacker, "enemy"), 0, () => 0.99);
    expect(attacker.baseContactLockTicks).toBe(BASE_CONTACT_CONFIG.lockLogicUpdates);
    for (let update = 1; update <= BASE_CONTACT_CONFIG.lockLogicUpdates; update += 1) {
      resolveBaseMovementContacts([attacker], bases, enterBaseDamageTile(attacker, "enemy"), update, () => 0.99);
      expect(base.hp).toBe(BASE_CONFIG.maxHp - 1);
    }
    resolveBaseMovementContacts([attacker], bases, enterBaseDamageTile(attacker, "enemy"), 11, () => 0.99);
    expect(base.hp).toBe(BASE_CONFIG.maxHp - 2);
  });

  it("aggros only combat-capable defend/intercept soldiers after successful damage", () => {
    const bases = createBattleBases();
    const base = getBaseForTeam(bases, "enemy");
    const attacker = createSoldier("a", "player", "ai", 0, 0, "charge");
    const defend = createSoldier("defend", "enemy", "ai", 2200, 400, "defend");
    const intercept = createSoldier("intercept", "enemy", "ai", 2200, 450, "intercept");
    const wait = createSoldier("wait", "enemy", "ai", 2200, 500, "wait");
    resolveBaseMovementContacts([attacker, defend, intercept, wait], bases, enterBaseDamageTile(attacker, "enemy"), 5, () => 0.99);
    expect(defend.targetId).toBe(attacker.id);
    expect(intercept.targetId).toBe(attacker.id);
    expect(wait.targetId).toBeNull();
  });

  it("connects base HP zero to the existing victory resolver", () => {
    const bases = createBattleBases();
    const base = getBaseForTeam(bases, "enemy");
    base.hp = 1;
    const attacker = createSoldier("a", "player", "ai", 0, 0, "charge");
    const livingEnemy = createSoldier("e", "enemy", "ai", 1000, 400, "wait");
    expect(resolveBaseMovementContacts([attacker, livingEnemy], bases, enterBaseDamageTile(attacker, "enemy"), 0, () => 0.99)).toBe("enemy");
    expect(getBattleResult([attacker, livingEnemy], bases)).toBe("VICTORY");
  });

  it("handles the PLAYER base damage tile symmetrically", () => {
    const bases = createBattleBases();
    const base = getBaseForTeam(bases, "player");
    const attacker = createSoldier("e", "enemy", "ai", 0, 0, "charge");
    const previous = enterBaseDamageTile(attacker, "player");
    resolveBaseMovementContacts([attacker], bases, previous, 0, () => 0.99);
    expect(base.hp).toBe(base.maxHp - 1);
  });
});
