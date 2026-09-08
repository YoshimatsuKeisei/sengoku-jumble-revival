import { describe, expect, it } from "vitest";
import {
  BATTLEFIELD_STRATEGY_SOURCE_GEOMETRY,
  battlefieldSourceDistanceToWorldX,
  battlefieldSourcePointToWorld,
  battlefieldWorldPointToSource,
} from "../../src/game/battlefieldLayout";
import { createSoldier } from "../../src/game/entities/Soldier";
import { createDefaultTeamArmySetup, isValidTeamArmySetup } from "../../src/game/systems/armySetupSystem";
import {
  startEngagement,
  updateAiTargets,
  updateChargeAI,
  updateDefendAI,
  updateInterceptAI,
  updateMeleeAI,
  updateWaitAI,
} from "../../src/game/systems/aiSystem";
import { swfLogicTicksToMs } from "../../src/game/systems/techniqueCombatProfiles";
import type { Soldier } from "../../src/game/types";
import strategySpec from "../../swf-spec/rules/strategies.json";

function unit(id: string, team: "player" | "enemy", sourceX: number, sourceY: number, strategy: Soldier["strategy"]): Soldier {
  const point = battlefieldSourcePointToWorld({ x: sourceX, y: sourceY });
  const soldier = createSoldier(id, team, "ai", point.x, point.y, strategy);
  soldier.stats.foot = 1;
  return soldier;
}

function sourceTarget(soldier: Soldier): { x: number; y: number } {
  if (soldier.moveTargetX === null || soldier.moveTargetY === null) throw new Error("expected strategy move target");
  return battlefieldWorldPointToSource({ x: soldier.moveTargetX, y: soldier.moveTargetY });
}

function expectSourceTarget(soldier: Soldier, x: number, y: number): void {
  const target = sourceTarget(soldier);
  expect(target.x).toBeCloseTo(x, 6);
  expect(target.y).toBeCloseTo(y, 6);
}

describe("SWF conformance: direct strategy state machine", () => {
  it("records exactly five selectable normal strategy pairs and no 特務 state", () => {
    const states = strategySpec.rules.find((rule) => rule.id === "STRATEGY_STATE_CODES");
    expect(states?.status).toBe("confirmed");
    expect(states?.expected).toMatchObject({
      charge: { player: 1, enemy: 2 },
      defend: { player: 3, enemy: 4 },
      intercept: { player: 8, enemy: 9 },
      melee: { player: 10, enemy: 11 },
      wait: { player: 14, enemy: 15 },
      specialDutySelectable: false,
      specialDutyNormalStateCode: null,
    });

    const setup = createDefaultTeamArmySetup();
    expect(isValidTeamArmySetup({ ...setup, defaultStrategy: "specialDuty" as never })).toBe(false);
  });

  it("follows the raw p1/p2 charge route including the mirrored enemy destination and base approach", () => {
    const player = unit("charge-p", "player", 1208, 400, "charge");
    updateChargeAI(player, [player], 0);
    expectSourceTarget(player, 1607, 574);

    player.x = battlefieldSourcePointToWorld({ x: 1443, y: 400 }).x;
    updateChargeAI(player, [player], 1);
    expectSourceTarget(player, 1662, 574);

    const enemy = unit("charge-e", "enemy", 700, 400, "charge");
    updateChargeAI(enemy, [enemy], 0);
    expectSourceTarget(enemy, 0, 400);

    enemy.x = battlefieldSourcePointToWorld({ x: 633, y: 400 }).x;
    updateChargeAI(enemy, [enemy], 1);
    expectSourceTarget(enemy, 234, 574);
    enemy.x = battlefieldSourcePointToWorld({ x: 389, y: 400 }).x;
    updateChargeAI(enemy, [enemy], 2);
    expectSourceTarget(enemy, 200, 574);
  });

  it("uses the raw projected-Y eligibility band when selecting a player defender's frontmost invader", () => {
    const defender = unit("defender", "player", 300, 500, "defend");
    const outOfBand = unit("out-y", "enemy", 420, 300, "charge");
    const eligible = unit("eligible", "enemy", 430, 500, "charge");
    updateDefendAI(defender, [defender, outOfBand, eligible], 0);
    expect(defender.targetId).toBe(eligible.id);
  });

  it("retargets 守備 to the current raw frontmost candidate instead of pinning an older valid engagement", () => {
    const defender = unit("defender", "player", 300, 500, "defend");
    const oldTarget = unit("old", "enemy", 430, 500, "charge");
    const frontmost = unit("front", "enemy", 420, 500, "charge");
    startEngagement(defender, oldTarget, 0);
    updateDefendAI(defender, [defender, oldTarget, frontmost], 1);
    expect(defender.targetId).toBe(frontmost.id);
  });

  it("uses one-step 守備 prediction below 250 source Y separation and 30 steps above it", () => {
    const defender = unit("defender", "player", 300, 500, "defend");
    const target = unit("target", "enemy", 400, 600, "charge");
    target.velocityX = battlefieldSourceDistanceToWorldX(1);
    target.velocityY = 0;
    updateDefendAI(defender, [defender, target], 0);
    let objective = battlefieldWorldPointToSource({ x: defender.strategyObjectiveX, y: defender.strategyObjectiveY });
    expect(objective.x).toBeCloseTo(401, 6);
    expect(objective.y).toBeCloseTo(600, 6);

    target.y = battlefieldSourcePointToWorld({ x: 400, y: 751 }).y;
    updateDefendAI(defender, [defender, target], 1);
    objective = battlefieldWorldPointToSource({ x: defender.strategyObjectiveX, y: defender.strategyObjectiveY });
    expect(objective.x).toBeCloseTo(430, 6);
    expect(objective.y).toBeCloseTo(751, 6);
  });

  it("retargets 迎撃 to the current frontmost candidate on the raw X=834 front", () => {
    expect(BATTLEFIELD_STRATEGY_SOURCE_GEOMETRY.interceptFrontLineX.player).toBe(834);
    const interceptor = unit("interceptor", "player", 700, 500, "intercept");
    const oldTarget = unit("old", "enemy", 820, 500, "charge");
    const frontmost = unit("front", "enemy", 810, 500, "charge");
    startEngagement(interceptor, oldTarget, 0);
    updateInterceptAI(interceptor, [interceptor, oldTarget, frontmost], 1);
    expect(interceptor.targetId).toBe(frontmost.id);
    expectSourceTarget(interceptor, 810, 500);
  });

  it("returns 乱戦 directly to random opponent selection after losing a target instead of forcing a roam first", () => {
    const melee = unit("melee", "player", 500, 500, "melee");
    const dead = unit("dead", "enemy", 600, 500, "charge");
    const valid = unit("valid", "enemy", 700, 500, "charge");
    dead.isDead = true;
    melee.targetId = dead.id;
    updateMeleeAI(melee, [melee, dead, valid], 0, () => 0.75);
    expect(melee.targetId).toBe(valid.id);
    expect(melee.strategyObjectiveKind).toBe("SEEK_COMBAT");
  });

  it("uses integer raw roam coordinates and excludes the player-controlled m200 slot from enemy 乱戦 random selection", () => {
    const melee = unit("melee-roam", "player", 500, 500, "melee");
    const invalid = unit("invalid", "enemy", 600, 500, "charge");
    invalid.state = "HEALING";
    const draws = [0, 0.5, 0.25];
    updateMeleeAI(melee, [melee, invalid], 0, () => draws.shift() ?? 0);
    expectSourceTarget(melee, 939, 461);

    const enemyMelee = unit("enemy-melee", "enemy", 1200, 500, "melee");
    const protagonist = unit("m200", "player", 500, 500, "charge");
    protagonist.controller = "player";
    const playerAi = unit("m1", "player", 600, 500, "charge");
    updateMeleeAI(enemyMelee, [enemyMelee, protagonist, playerAi], 0, () => 0);
    expect(enemyMelee.targetId).toBe(playerAi.id);
  });

  it("keeps 待機 anchored without proactive pursuit acquisition", () => {
    const waiter = unit("wait", "player", 500, 500, "wait");
    const enemy = unit("enemy", "enemy", 510, 500, "charge");
    updateWaitAI(waiter, [waiter, enemy], 0);
    expect(waiter.targetId).toBeNull();
    expectSourceTarget(waiter, 500, 500);
  });

  it("runs 守備/迎撃/突撃/待機 acquisition on tc=19 -> 4 ticks, then every 23 logic ticks", () => {
    const timing = strategySpec.rules.find((rule) => rule.id === "STRATEGY_SCD_TIMING");
    expect(timing?.status).toBe("confirmed");
    expect(timing?.expected).toMatchObject({
      initialCounter: 19,
      firstTriggerLogicTicks: 4,
      subsequentIntervalLogicTicks: 23,
      sharedWithCombatGaugeScd: true,
      meleeBaseAndRoamStatesUsePerLogicFrameD: true,
    });

    const defender = unit("scheduled-defender", "player", 300, 500, "defend");
    const first = unit("scheduled-first", "enemy", 430, 500, "charge");
    const laterFront = unit("scheduled-later", "enemy", 420, 300, "charge");
    const roster = [defender, first, laterFront];
    updateAiTargets(roster, 0, () => 0);
    expect(defender.targetId).toBeNull();
    updateAiTargets(roster, swfLogicTicksToMs(3), () => 0);
    expect(defender.targetId).toBeNull();
    updateAiTargets(roster, swfLogicTicksToMs(4), () => 0);
    expect(defender.targetId).toBe(first.id);

    laterFront.y = battlefieldSourcePointToWorld({ x: 420, y: 500 }).y;
    updateAiTargets(roster, swfLogicTicksToMs(26), () => 0);
    expect(defender.targetId).toBe(first.id);
    updateAiTargets(roster, swfLogicTicksToMs(27), () => 0);
    expect(defender.targetId).toBe(laterFront.id);
  });

  it("evaluates raw p10/p11 乱戦 selection on each battle logic frame rather than waiting for scd", () => {
    const melee = unit("scheduled-melee", "player", 500, 500, "melee");
    const enemy = unit("scheduled-enemy", "enemy", 700, 500, "charge");
    const roster = [melee, enemy];
    updateAiTargets(roster, 0, () => 0);
    expect(melee.targetId).toBeNull();
    updateAiTargets(roster, swfLogicTicksToMs(1), () => 0);
    expect(melee.targetId).toBe(enemy.id);
  });
});
