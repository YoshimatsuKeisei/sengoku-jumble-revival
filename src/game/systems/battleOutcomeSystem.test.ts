import { describe, expect, it } from "vitest";
import { createSoldier } from "../entities/Soldier";
import { createBattleBases } from "./baseSystem";
import {
  advanceBattleClock,
  battleResultFromSituation,
  calculateBattleSituation,
  calculateLocalVictoryReward,
  createBattleClockState,
  formatBattleTime,
  getBattleBalanceTargetFrame,
  smoothBattleBalanceFrame,
} from "./battleOutcomeSystem";

describe("SWF battle clock and situation score", () => {
  it("uses base*5 + remaining*3 + opposing temporary retreats", () => {
    const player = createSoldier("p", "player", "player", 0, 0);
    const enemy = createSoldier("e", "enemy", "ai", 0, 0);
    player.temporaryRetreatCount = 2;
    enemy.temporaryRetreatCount = 4;
    const bases = createBattleBases();
    bases.find((base) => base.team === "player")!.hp = 20;
    bases.find((base) => base.team === "enemy")!.hp = 10;
    expect(calculateBattleSituation([player, enemy], bases)).toMatchObject({
      player: 20 * 5 + 1 * 3 + 4,
      enemy: 10 * 5 + 1 * 3 + 2,
      playerRetreats: 2,
      enemyRetreats: 4,
    });
  });

  it("formats the 180-second clock and reproduces tc=19 / tc>22 ticks", () => {
    const state = createBattleClockState();
    expect(formatBattleTime(state.remainingSeconds)).toBe("3:00");
    advanceBattleClock(state, 3 / 24 * 1_000, { player: 0, enemy: 0 });
    expect(state.remainingSeconds).toBe(180);
    advanceBattleClock(state, 1 / 24 * 1_000, { player: 0, enemy: 0 });
    expect(state.remainingSeconds).toBe(179);
    expect(formatBattleTime(state.remainingSeconds)).toBe("2:59");
  });

  it("sets 30-point advantage to one second, then expires on the next timer tick", () => {
    const state = createBattleClockState();
    state.remainingSeconds = 121;
    state.tickCounter = 22;
    expect(advanceBattleClock(state, 1 / 24 * 1_000, { player: 130, enemy: 100 }))
      .toEqual({ expired: false, advantageTriggered: true });
    expect(state.remainingSeconds).toBe(1);
    state.tickCounter = 22;
    expect(advanceBattleClock(state, 1 / 24 * 1_000, { player: 130, enemy: 100 }).expired).toBe(true);
  });

  it("uses the exact reward formula and a strict higher-score victory", () => {
    const score = { player: 140, enemy: 100 } as ReturnType<typeof calculateBattleSituation>;
    expect(calculateLocalVictoryReward(3, score)).toBe(Math.floor(3 * 50 * 1.2 + 3 * 20) + 150);
    expect(battleResultFromSituation(score)).toBe("VICTORY");
    expect(battleResultFromSituation({ ...score, player: 100 })).toBe("DEFEAT");
  });

  it("maps and smooths the restored 600-frame balance gauge", () => {
    expect(getBattleBalanceTargetFrame({ player: 70, enemy: 100 })).toBe(1);
    expect(getBattleBalanceTargetFrame({ player: 100, enemy: 100 })).toBe(300);
    expect(getBattleBalanceTargetFrame({ player: 130, enemy: 100 })).toBe(600);
    expect(smoothBattleBalanceFrame(300, 600)).toBe(337.5);
  });
});
