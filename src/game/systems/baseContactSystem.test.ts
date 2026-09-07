import { describe, expect, it } from "vitest";
import { BASE_CONTACT_CONFIG, BASE_CONFIG, SOLDIER_RADIUS } from "../config";
import { createSoldier } from "../entities/Soldier";
import type { BattleBase, Soldier } from "../types";
import { getBattleResult } from "./victorySystem";
import { getBaseAttackBounceDistance } from "./baseAttackBounceSystem";
import {
  captureSoldierPositions,
  isBaseHitBlockedByFortify,
  resolveBaseMovementContacts,
} from "./baseContactSystem";
import { getBaseAttackSurfaceRect } from "./battlefieldGeometry";
import { createBattleBases, getBaseForTeam } from "./baseSystem";

function crossEnemySurface(attacker: Soldier, base: BattleBase) {
  const surface = getBaseAttackSurfaceRect(base);
  attacker.x = surface.x - SOLDIER_RADIUS - 1;
  attacker.y = surface.y + surface.height / 2;
  const previous = captureSoldierPositions([attacker]);
  attacker.x = surface.x - SOLDIER_RADIUS + 1;
  return previous;
}

function makeDefenders(count = 30): Soldier[] {
  return Array.from({ length: count }, (_, index) => createSoldier(`d-${index}`, "enemy", "ai", 2200, 300 + index, "wait"));
}

describe("SWF movement-contact base attacks", () => {
  it("requires physical surface crossing but does not reject an existing targetId", () => {
    const bases = createBattleBases();
    const base = getBaseForTeam(bases, "enemy");
    const attacker = createSoldier("a", "player", "ai", 0, 0, "charge");
    attacker.targetId = "some-enemy";
    const previous = crossEnemySurface(attacker, base);
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
    resolveBaseMovementContacts([attacker], bases, crossEnemySurface(attacker, base), 0, () => 0.99);
    expect(base.hp).toBe(base.maxHp - 1);
    expect(attacker.combatActionState).toBe("ATTACK_WINDUP");
  });

  it("applies normal=1 and 攻略(SIEGE)=2 damage", () => {
    for (const [abilities, damage] of [[[], 1], [["SIEGE"], 2]] as const) {
      const bases = createBattleBases();
      const base = getBaseForTeam(bases, "enemy");
      const attacker = createSoldier(`a-${damage}`, "player", "ai", 0, 0, "charge");
      attacker.specialAbilities = [...abilities];
      resolveBaseMovementContacts([attacker], bases, crossEnemySurface(attacker, base), 0, () => 0.99);
      expect(base.hp).toBe(base.maxHp - damage);
      expect(attacker.merits.baseDamage).toBe(1);
    }
  });

  it("adds the separate +2 merit when the base capture branch is reached", () => {
    const bases = createBattleBases();
    const base = getBaseForTeam(bases, "enemy");
    base.hp = 1;
    const attacker = createSoldier("capture", "player", "ai", 0, 0, "charge");
    resolveBaseMovementContacts([attacker], bases, crossEnemySurface(attacker, base), 0, () => 0.99);
    expect(base.isDestroyed).toBe(true);
    expect(attacker.merits.baseDamage).toBe(3);
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
      const previous = crossEnemySurface(attacker, base);
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
    resolveBaseMovementContacts([attacker], bases, crossEnemySurface(attacker, base), 0, () => 0.99);
    expect(attacker.baseContactLockTicks).toBe(BASE_CONTACT_CONFIG.lockLogicUpdates);
    for (let update = 1; update <= BASE_CONTACT_CONFIG.lockLogicUpdates; update += 1) {
      resolveBaseMovementContacts([attacker], bases, crossEnemySurface(attacker, base), update, () => 0.99);
      expect(base.hp).toBe(BASE_CONFIG.maxHp - 1);
    }
    resolveBaseMovementContacts([attacker], bases, crossEnemySurface(attacker, base), 11, () => 0.99);
    expect(base.hp).toBe(BASE_CONFIG.maxHp - 2);
  });

  it("aggros only combat-capable defend/intercept soldiers after successful damage", () => {
    const bases = createBattleBases();
    const base = getBaseForTeam(bases, "enemy");
    const attacker = createSoldier("a", "player", "ai", 0, 0, "charge");
    const defend = createSoldier("defend", "enemy", "ai", 2200, 400, "defend");
    const intercept = createSoldier("intercept", "enemy", "ai", 2200, 450, "intercept");
    const wait = createSoldier("wait", "enemy", "ai", 2200, 500, "wait");
    resolveBaseMovementContacts([attacker, defend, intercept, wait], bases, crossEnemySurface(attacker, base), 5, () => 0.99);
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
    expect(resolveBaseMovementContacts([attacker, livingEnemy], bases, crossEnemySurface(attacker, base), 0, () => 0.99)).toBe("enemy");
    expect(getBattleResult([attacker, livingEnemy], bases)).toBe("VICTORY");
  });

  it("handles the PLAYER base contact surface symmetrically", () => {
    const bases = createBattleBases();
    const base = getBaseForTeam(bases, "player");
    const surface = getBaseAttackSurfaceRect(base);
    const attacker = createSoldier("e", "enemy", "ai", surface.x + surface.width + SOLDIER_RADIUS + 1, base.y, "charge");
    const previous = captureSoldierPositions([attacker]);
    attacker.x = surface.x + surface.width + SOLDIER_RADIUS - 1;
    resolveBaseMovementContacts([attacker], bases, previous, 0, () => 0.99);
    expect(base.hp).toBe(base.maxHp - 1);
  });
});
