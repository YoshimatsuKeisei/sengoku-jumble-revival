import { describe, expect, it } from "vitest";
import { createSoldier } from "../entities/Soldier";
import { createBattleBases } from "../systems/baseSystem";
import {
  clampPostBattleListScroll,
  getBattleResultRevealState,
  sortEnemyRows,
  sortMeritRows,
} from "./postBattleModel";
import { createPostBattleSnapshot, displayPostBattleValue } from "./postBattleState";
import { routeAfterBattleResult } from "./postBattleRoutePolicy";

describe("post-battle snapshot and display model", () => {
  it("copies runtime values and keeps unknown domain values null", () => {
    const player = createSoldier("player-real-id", "player", "player", 10, 20);
    const enemy = createSoldier("enemy-real-id", "enemy", "ai", 30, 40);
    enemy.strategy = "defend";
    enemy.isDead = true;
    player.merits.battleWins = 3;
    player.merits.soldierDamage = 7;
    enemy.stipend = 456;
    const snapshot = createPostBattleSnapshot("VICTORY", [player, enemy], createBattleBases(), {
      cellId: "area-1", gridX: 1, gridY: 2, type: "battle",
    });
    player.hp = 0;
    expect(snapshot.playerRoster[0].hp).not.toBe(0);
    expect(snapshot).toMatchObject({ playerRemaining: 1, enemyRemaining: 0, selectedAreaId: "area-1" });
    expect(snapshot.enemyRoster[0]).toMatchObject({ name: "enemy-real-id", strategy: "defend" });
    expect(snapshot.playerRoster[0].merits).toMatchObject({ battleWins: 3, soldierDamage: 7 });
    expect(snapshot.enemyRoster[0]).toMatchObject({ stipend: 456, recruitCost: 456 });
    expect(snapshot.meritCounters["player-real-id"].battleWins).toBe(3);
    expect(snapshot.resultMetrics).toEqual({
      playerRetreats: null, enemyRetreats: null, playerTotal: null, enemyTotal: null, acquiredMoney: null,
    });
    expect(snapshot.economy).toEqual({ moneyBefore: null, moneyAfter: null, totalRank: null });
    expect(displayPostBattleValue(null)).toBe("--");
  });

  it("stores confirmed battle totals and money without retaining live Soldier references", () => {
    const player = createSoldier("p", "player", "player", 0, 0);
    const enemy = createSoldier("e", "enemy", "ai", 0, 0);
    const snapshot = createPostBattleSnapshot("VICTORY", [player, enemy], createBattleBases(), null, {
      situation: {
        player: 200, enemy: 150,
        playerBaseHp: 30, enemyBaseHp: 20,
        playerRemaining: 1, enemyRemaining: 1,
        playerRetreats: 2, enemyRetreats: 4,
      },
      acquiredMoney: 250,
      moneyBefore: 3_000,
      totalRank: 17_996,
    });
    expect(snapshot.resultMetrics).toEqual({
      playerRetreats: 2, enemyRetreats: 4,
      playerTotal: 200, enemyTotal: 150, acquiredMoney: 250,
    });
    expect(snapshot.economy).toEqual({ moneyBefore: 3_000, moneyAfter: 3_250, totalRank: 17_996 });
  });

  it("sorts copied merit and recruit-cost arrays without mutating snapshot order", () => {
    const low = createSoldier("low", "player", "ai", 0, 0);
    const high = createSoldier("high", "player", "ai", 0, 0);
    low.merits.recovery = 1;
    high.merits.recovery = 9;
    low.stipend = 10;
    high.stipend = 20;
    const snapshot = createPostBattleSnapshot("VICTORY", [low, high], createBattleBases(), null);
    expect(sortMeritRows(snapshot.playerRoster, "recovery").map((row) => row.id)).toEqual(["high", "low"]);
    expect(sortEnemyRows(snapshot.playerRoster, "cost").map((row) => row.id)).toEqual(["high", "low"]);
    expect(snapshot.playerRoster.map((row) => row.id)).toEqual(["low", "high"]);
  });

  it("replays the 24fps result reveal and holds at frame 67", () => {
    expect(getBattleResultRevealState(0)).toMatchObject({ frame: 1, panelAlpha: 0, baseRow: false });
    expect(getBattleResultRevealState(667)).toMatchObject({ frame: 17, panelAlpha: 1, baseRow: true });
    expect(getBattleResultRevealState(1_167).soldierRow).toBe(true);
    expect(getBattleResultRevealState(1_708).retreatRow).toBe(true);
    expect(getBattleResultRevealState(2_250).totalsRow).toBe(true);
    expect(getBattleResultRevealState(50_000)).toMatchObject({ frame: 67, finalUi: true });
  });

  it("clamps list scrolling and sorts a copied enemy display array", () => {
    expect(clampPostBattleListScroll(99, 30, 10)).toBe(20);
    expect(clampPostBattleListScroll(-2, 30, 10)).toBe(0);
    const first = createSoldier("first", "enemy", "ai", 0, 0);
    const second = createSoldier("second", "enemy", "ai", 0, 0);
    first.stats.foot = 1;
    second.stats.foot = 5;
    const snapshot = createPostBattleSnapshot("VICTORY", [first, second], createBattleBases(), null);
    const sorted = sortEnemyRows(snapshot.enemyRoster, "speed");
    expect(sorted.map((row) => row.id)).toEqual(["second", "first"]);
    expect(snapshot.enemyRoster.map((row) => row.id)).toEqual(["first", "second"]);
  });

  it("isolates requested and original defeat routing policies", () => {
    expect(routeAfterBattleResult({ battleResult: "DEFEAT" })).toBe("merit_list");
    expect(routeAfterBattleResult({ battleResult: "DEFEAT" }, "swf_defeat_to_map")).toBe("map");
  });
});
