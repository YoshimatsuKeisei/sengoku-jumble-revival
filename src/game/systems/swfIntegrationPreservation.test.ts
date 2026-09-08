import { describe, expect, it } from "vitest";
import { battlefieldSourcePointToWorld } from "../battlefieldLayout";
import { createSoldier } from "../entities/Soldier";
import {
  advanceCombatGauge,
  beginTechniqueAction,
  PLAYER_TECHNIQUE_GAUGE_FRAME_MS,
} from "./combatGaugeSystem";
import { applyDamage } from "./combatSystem";
import { updateNormalCombatContests } from "./normalCombatSystem";
import {
  captureSoldierPositions,
  resolveBaseMovementContacts,
} from "./baseContactSystem";
import { createBattleBases, getBaseForTeam } from "./baseSystem";
import { startEmergencyRetreat } from "./recoverySystem";
import {
  getTechniqueProfile,
  SWF_RANGED_ACTION_TICKS,
} from "./techniqueCombatProfiles";

describe("2026-09-07 features preserved while applying raw SWF conformance", () => {
  it("keeps the protagonist 0..100 technique gauge on top of the raw AI gauge scheduler", () => {
    const player = createSoldier("player", "player", "player", 500, 500);
    player.stats.skill = 60;
    player.playerTechniqueGauge = 0;
    advanceCombatGauge(player, 0);
    advanceCombatGauge(player, PLAYER_TECHNIQUE_GAUGE_FRAME_MS);
    expect(player.playerTechniqueGauge).toBe(2);

    player.playerTechniqueGauge = 99;
    expect(beginTechniqueAction(player, 100, () => 1, true)).toBe(false);
    player.playerTechniqueGauge = 100;
    expect(beginTechniqueAction(player, 100, () => 1, true)).toBe(true);
    expect(player.playerTechniqueGauge).toBe(0);
  });

  it("keeps normal-contact battle merit while using the SWF cubic contest", () => {
    const first = createSoldier("first", "player", "ai", 500, 500, "melee");
    const second = createSoldier("second", "enemy", "ai", 510, 500, "melee");
    first.stats.combat = 100;
    second.stats.combat = 1;
    updateNormalCombatContests([first, second], 0, () => 0);
    expect(first.merits.battleWins).toBe(1);
    expect(second.merits.battleLosses).toBe(1);
  });

  it("keeps damage/kill merit even though fatal cleanup is delayed until the SWF reaction completes", () => {
    const attacker = createSoldier("attacker", "player", "ai", 500, 500);
    const target = createSoldier("target", "enemy", "ai", 510, 500);
    const result = applyDamage(target, target.maxHp, attacker);
    expect(result).toEqual({ appliedDamage: target.maxHp, battleOutStarted: true });
    expect(target.hp).toBe(0);
    expect(target.isDead).toBe(false);
    expect(attacker.merits.soldierDamage).toBe(target.maxHp);
    expect(attacker.merits.kills).toBe(1);
  });

  it("keeps base-damage/capture merit on the confirmed SWF 996/997 damage cells", () => {
    const bases = createBattleBases();
    const base = getBaseForTeam(bases, "enemy");
    const attacker = createSoldier("base-attacker", "player", "ai", 0, 0, "charge");
    const outside = battlefieldSourcePointToWorld({ x: 1595, y: 540 });
    const inside = battlefieldSourcePointToWorld({ x: 1605, y: 540 });
    Object.assign(attacker, outside);
    const previous = captureSoldierPositions([attacker]);
    Object.assign(attacker, inside);
    resolveBaseMovementContacts([attacker], bases, previous, 0, () => 0.99);
    expect(base.hp).toBe(base.maxHp - 1);
    expect(attacker.merits.baseDamage).toBe(1);
  });

  it("keeps retreat/repel accounting while routing retreat through raw SWF coordinates", () => {
    const attacker = createSoldier("source", "enemy", "ai", 800, 500);
    const retreater = createSoldier("retreater", "player", "ai", 700, 500);
    retreater.lastDamageSourceId = attacker.id;
    startEmergencyRetreat(retreater, createBattleBases(), [attacker, retreater], 0);
    expect(retreater.temporaryRetreatCount).toBe(1);
    expect(attacker.merits.repels).toBe(1);
  });

  it("keeps current strategist profile data while applying confirmed 10-tick ranged locks", () => {
    expect(SWF_RANGED_ACTION_TICKS).toBe(10);
    expect(getTechniqueProfile("ARCHER_ARROW").actionLockTicks).toBe(10);
    expect(getTechniqueProfile("TEPPOU_SHOOTING").actionLockTicks).toBe(10);
    expect(getTechniqueProfile("STRATEGIST_FIRE_ATTACK")).toMatchObject({
      forwardOffsetSwfUnits: 80,
      horizontalYOffsetSwfUnits: -16,
      activationRangeSwfUnits: 60,
    });
  });
});
