import { describe, expect, it } from "vitest";
import {
  BASE_CONTACT_CONFIG,
  BATTLEFIELD_CONFIG,
  BATTLE_OBSTACLES,
  REACTION_CONFIG,
  SOLDIER_RADIUS,
} from "../config";
import { createSoldier } from "../entities/Soldier";
import type { ControllerType, Soldier, Team } from "../types";
import {
  captureSoldierPositions,
  resolveBaseMovementContacts,
} from "./baseContactSystem";
import { getBaseAttackContactSegment } from "./battlefieldGeometry";
import {
  createBattleBases,
  getBaseForTeam,
  resolveBaseAccessCollisions,
} from "./baseSystem";
import { moveAiSoldiers, movePlayer } from "./movementSystem";
import { separateSoldiers } from "./movementSystem";
import {
  SWF_TRAP_ACTION_LOCK_TICKS,
  SWF_TRAP_STATE_TICKS,
  updateEnemyFenceTrapContacts,
} from "./trapAbilitySystem";
import { swfLogicTicksToMs } from "./techniqueCombatProfiles";

function makeTrapRoster(team: Team): Soldier[] {
  return Array.from({ length: 30 }, (_, index) => {
    const soldier = createSoldier(`${team}-${index}`, team, "ai", team === "player" ? 200 : 2200, 100 + index * 2);
    if (index === 0) soldier.specialAbilities = ["TRAP"];
    return soldier;
  });
}

const FIXED_MOVEMENT_STATS = {
  maxHp: 60,
  skill: 50,
  foot: 3,
  combat: 50,
  defense: 50,
} as const;

function moveControlledSoldier(
  soldier: Soldier,
  soldiers: Soldier[],
  controller: ControllerType,
  directionX: number,
  currentTime: number,
): void {
  if (controller === "player") {
    movePlayer(soldier, directionX, 0, 1 / 60, [], false, currentTime);
    return;
  }
  soldier.moveTargetX = directionX > 0
    ? BATTLEFIELD_CONFIG.width - SOLDIER_RADIUS
    : SOLDIER_RADIUS;
  soldier.moveTargetY = soldier.y;
  moveAiSoldiers(soldiers, 1 / 60, [], currentTime, []);
}

describe("normal movement regression coverage", () => {
  it.each(["player", "ai"] as const)(
    "%s movement crosses the world center and remains monotonic for three seconds",
    (controller) => {
      const mover = createSoldier(`mover-${controller}`, "player", controller, 1100, 450, "charge",
        FIXED_MOVEMENT_STATS);
      const soldiers = [mover, ...makeTrapRoster("enemy")];
      const positions: number[] = [mover.x];
      let randomDraws = 0;

      for (let frame = 1; frame <= 180; frame += 1) {
        const time = frame * 1000 / 60;
        moveControlledSoldier(mover, soldiers, controller, 1, time);
        updateEnemyFenceTrapContacts(soldiers, BATTLE_OBSTACLES, time, () => {
          randomDraws += 1;
          return 0;
        });
        positions.push(mover.x);
      }

      expect(mover.x).toBeGreaterThan(BATTLEFIELD_CONFIG.centerX);
      expect(positions.slice(1).every((x, index) => x > positions[index])).toBe(true);
      expect(randomDraws).toBe(0);
      expect(mover.abilityActionLockUntil).toBe(0);
      expect(mover.trapStateUntil).toBe(0);
    },
  );

  it.each(["player", "ai"] as const)(
    "%s receives one TRAP per new enemy-fence contact and unlocks at the SWF times",
    (controller) => {
      const fence = BATTLE_OBSTACLES.find((candidate) => candidate.id === "enemy-upper")!;
      const mover = createSoldier(`trapped-${controller}`, "player", controller,
        fence.x - SOLDIER_RADIUS, fence.y + fence.height / 2, "charge");
      const soldiers = [mover, ...makeTrapRoster("enemy")];
      const firstContactX = mover.x;
      const firstTime = 100;

      expect(updateEnemyFenceTrapContacts(soldiers, BATTLE_OBSTACLES, firstTime, () => 0)).toEqual([mover.id]);
      expect(mover.x).toBeCloseTo(firstContactX - REACTION_CONFIG.knockbackDistance);
      expect(mover.abilityActionLockUntil).toBeCloseTo(firstTime + swfLogicTicksToMs(SWF_TRAP_ACTION_LOCK_TICKS));
      expect(mover.trapStateUntil).toBeCloseTo(firstTime + swfLogicTicksToMs(SWF_TRAP_STATE_TICKS));
      const hpAfterFirstContact = mover.hp;

      // Simulate remaining on the same contact after the lock: no second draw or hit.
      mover.x = firstContactX;
      expect(updateEnemyFenceTrapContacts(soldiers, BATTLE_OBSTACLES, mover.trapStateUntil + 1, () => 0)).toEqual([]);
      expect(mover.hp).toBe(hpAfterFirstContact);

      // Leaving the fence clears contact state; merely moving in enemy territory does not trigger TRAP.
      mover.x = 1400;
      updateEnemyFenceTrapContacts(soldiers, BATTLE_OBSTACLES, mover.trapStateUntil + 2, () => 0);
      const beforeMove = mover.x;
      moveControlledSoldier(mover, soldiers, controller, 1, mover.trapStateUntil + 3);
      expect(mover.x).toBeGreaterThan(beforeMove);
      expect(updateEnemyFenceTrapContacts(soldiers, BATTLE_OBSTACLES, mover.trapStateUntil + 3, () => 0)).toEqual([]);
      expect(mover.hp).toBe(hpAfterFirstContact);

      // A later, genuinely new contact with the enemy-owned fence is eligible again.
      mover.x = firstContactX;
      expect(updateEnemyFenceTrapContacts(soldiers, BATTLE_OBSTACLES, mover.trapStateUntil + 4, () => 0)).toEqual([mover.id]);
      expect(mover.hp).toBe(hpAfterFirstContact - 1);
    },
  );

  it("does not re-roll a missed TRAP while the same enemy-fence contact continues", () => {
    const fence = BATTLE_OBSTACLES.find((candidate) => candidate.id === "enemy-upper")!;
    const mover = createSoldier("missed-trap", "player", "player",
      fence.x - SOLDIER_RADIUS, fence.y + fence.height / 2);
    const soldiers = [mover, ...makeTrapRoster("enemy")];
    let draws = 0;
    const missSlotZero = () => {
      draws += 1;
      return 0.99;
    };

    expect(updateEnemyFenceTrapContacts(soldiers, BATTLE_OBSTACLES, 0, missSlotZero)).toEqual([]);
    expect(draws).toBe(2);
    expect(updateEnemyFenceTrapContacts(soldiers, BATTLE_OBSTACLES, 1, missSlotZero)).toEqual([]);
    expect(draws).toBe(2);

    mover.x = 1400;
    updateEnemyFenceTrapContacts(soldiers, BATTLE_OBSTACLES, 2, missSlotZero);
    mover.x = fence.x - SOLDIER_RADIUS;
    updateEnemyFenceTrapContacts(soldiers, BATTLE_OBSTACLES, 3, missSlotZero);
    expect(draws).toBe(4);
  });

  it.each(["player", "ai"] as const)(
    "%s base contact stays outside the shared boundary during its lock and resumes afterward",
    (controller) => {
      const bases = createBattleBases();
      const enemyBase = getBaseForTeam(bases, "enemy");
      const contact = getBaseAttackContactSegment(enemyBase);
      const attacker = createSoldier(`base-${controller}`, "player", controller,
        contact.x - 4, (contact.minY + contact.maxY) / 2, "charge");
      const soldiers = [attacker];
      let time = 0;

      for (let frame = 0; frame < 12 && enemyBase.hp === enemyBase.maxHp; frame += 1) {
        time += 1000 / 60;
        const previous = captureSoldierPositions(soldiers);
        moveControlledSoldier(attacker, soldiers, controller, 1, time);
        resolveBaseMovementContacts(soldiers, bases, previous, time, () => 0.99);
        resolveBaseAccessCollisions(soldiers, bases);
      }

      expect(enemyBase.hp).toBe(enemyBase.maxHp - 1);
      expect(attacker.x).toBeLessThan(contact.x);
      expect(attacker.baseContactLockTicks).toBe(BASE_CONTACT_CONFIG.lockLogicUpdates);
      const lockedX = attacker.x;

      for (let update = 0; update < BASE_CONTACT_CONFIG.lockLogicUpdates; update += 1) {
        time += 1000 / 60;
        const previous = captureSoldierPositions(soldiers);
        moveControlledSoldier(attacker, soldiers, controller, 1, time);
        resolveBaseMovementContacts(soldiers, bases, previous, time, () => 0.99);
        resolveBaseAccessCollisions(soldiers, bases);
        expect(attacker.x).toBeCloseTo(lockedX);
        expect(attacker.x).toBeLessThan(contact.x);
      }

      expect(attacker.baseContactLockTicks).toBe(0);
      time += 1000 / 60;
      const previous = captureSoldierPositions(soldiers);
      moveControlledSoldier(attacker, soldiers, controller, 1, time);
      resolveBaseMovementContacts(soldiers, bases, previous, time, () => 0.99);
      resolveBaseAccessCollisions(soldiers, bases);
      expect(attacker.x).toBeGreaterThan(lockedX);
      expect(attacker.x).toBeLessThanOrEqual(contact.x);
      expect(attacker.combatActionState).toBe("IDLE");

      let previousX = attacker.x;
      let previousHp = enemyBase.hp;
      for (let update = 0; update < 30; update += 1) {
        time += 1000 / 60;
        const previous = captureSoldierPositions(soldiers);
        moveControlledSoldier(attacker, soldiers, controller, 1, time);
        resolveBaseMovementContacts(soldiers, bases, previous, time, () => 0.99);
        resolveBaseAccessCollisions(soldiers, bases);
        expect(attacker.x).toBeLessThanOrEqual(contact.x);
        if (attacker.x < previousX) {
          expect(enemyBase.hp).toBeLessThan(previousHp);
          expect(previousX - attacker.x).toBeGreaterThan(REACTION_CONFIG.knockbackDistance / 2);
        }
        previousX = attacker.x;
        previousHp = enemyBase.hp;
      }
    },
  );

  it("detects a contact step that starts exactly on the shared enemy-base boundary", () => {
    const bases = createBattleBases();
    const enemyBase = getBaseForTeam(bases, "enemy");
    const contact = getBaseAttackContactSegment(enemyBase);
    const attacker = createSoldier("boundary", "player", "ai", contact.x, (contact.minY + contact.maxY) / 2, "charge");
    const previous = captureSoldierPositions([attacker]);
    attacker.x += 1;

    resolveBaseMovementContacts([attacker], bases, previous, 0, () => 0.99);

    expect(enemyBase.hp).toBe(enemyBase.maxHp - 1);
    expect(attacker.x).toBeCloseTo(contact.x - REACTION_CONFIG.knockbackDistance);
  });

  it("routes off-core AI lanes into the base contact segment instead of leaving them stopped at the base wall", () => {
    const bases = createBattleBases();
    const enemyBase = getBaseForTeam(bases, "enemy");
    enemyBase.hp = enemyBase.maxHp = 1_000;
    const contact = getBaseAttackContactSegment(enemyBase);
    const attacker = createSoldier("off-core", "player", "ai", contact.x - 80, contact.minY - 140, "charge",
      FIXED_MOVEMENT_STATS);
    attacker.strategyObjectiveKind = "ENEMY_SIDE";
    attacker.moveTargetX = enemyBase.x;
    attacker.moveTargetY = attacker.y;

    for (let frame = 1; frame <= 600 && attacker.merits.baseDamage === 0; frame += 1) {
      const time = frame * 1000 / 60;
      const previous = captureSoldierPositions([attacker]);
      moveAiSoldiers([attacker], 1 / 60, [], time, bases);
      resolveBaseMovementContacts([attacker], bases, previous, time, () => 0.99);
      resolveBaseAccessCollisions([attacker], bases);
    }

    expect(attacker.merits.baseDamage).toBeGreaterThan(0);
    expect(attacker.y).toBeGreaterThanOrEqual(contact.minY);
  });

  it("keeps a crowd advancing and attacking without separation moving contact-locked soldiers back into the collider", () => {
    const bases = createBattleBases();
    const enemyBase = getBaseForTeam(bases, "enemy");
    enemyBase.hp = enemyBase.maxHp = 1_000;
    const contact = getBaseAttackContactSegment(enemyBase);
    const attackers = Array.from({ length: 8 }, (_, index) => {
      const upper = index < 4;
      const soldier = createSoldier(`crowd-${index}`, "player", "ai",
        contact.x - 90 - index * 3,
        upper ? contact.minY - 80 - index * 10 : contact.maxY + 80 + (index - 4) * 10,
        "charge", FIXED_MOVEMENT_STATS);
      soldier.strategyObjectiveKind = "ENEMY_SIDE";
      soldier.moveTargetX = enemyBase.x;
      soldier.moveTargetY = soldier.y;
      return soldier;
    });
    let damageAtHalfway = 0;
    const recentMovement = new Set<string>();

    for (let frame = 1; frame <= 900; frame += 1) {
      const time = frame * 1000 / 60;
      const previous = captureSoldierPositions(attackers);
      moveAiSoldiers(attackers, 1 / 60, [], time, bases);
      resolveBaseMovementContacts(attackers, bases, previous, time, () => 0.99);
      separateSoldiers(attackers);
      resolveBaseAccessCollisions(attackers, bases);
      if (frame === 450) damageAtHalfway = 1_000 - enemyBase.hp;
      if (frame > 840) {
        for (const soldier of attackers) {
          const before = previous.get(soldier.id)!;
          if (Math.hypot(soldier.x - before.x, soldier.y - before.y) > 0.001) recentMovement.add(soldier.id);
        }
      }
    }

    const totalDamage = 1_000 - enemyBase.hp;
    expect(damageAtHalfway).toBeGreaterThan(0);
    expect(totalDamage).toBeGreaterThan(damageAtHalfway);
    expect(recentMovement.size).toBeGreaterThan(0);
    expect(attackers.every((soldier) => soldier.x <= contact.x + 0.001)).toBe(true);
  });
});
