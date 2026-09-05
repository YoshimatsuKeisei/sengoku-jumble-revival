import { describe, expect, it } from "vitest";
import { createSoldier } from "../entities/Soldier";
import { createBattleBases } from "../systems/baseSystem";
import {
  clampPostBattleListScroll,
  getBattleResultRevealState,
  sortEnemyRows,
} from "./postBattleModel";
import { createPostBattleSnapshot, displayPostBattleValue } from "./postBattleState";
import { routeAfterBattleResult } from "./postBattleRoutePolicy";

describe("post-battle snapshot and display model", () => {
  it("copies runtime values and keeps unknown domain values null", () => {
    const player = createSoldier("player-real-id", "player", "player", 10, 20);
    const enemy = createSoldier("enemy-real-id", "enemy", "ai", 30, 40);
    enemy.strategy = "defend";
    enemy.isDead = true;
    const snapshot = createPostBattleSnapshot("VICTORY", [player, enemy], createBattleBases(), {
      cellId: "area-1", gridX: 1, gridY: 2, type: "battle",
    });
    player.hp = 0;
    expect(snapshot.playerRoster[0].hp).not.toBe(0);
    expect(snapshot).toMatchObject({ playerRemaining: 1, enemyRemaining: 0, selectedAreaId: "area-1" });
    expect(snapshot.enemyRoster[0]).toMatchObject({ name: "enemy-real-id", strategy: "defend" });
    expect(snapshot.resultMetrics).toEqual({
      playerRetreats: null, enemyRetreats: null, playerTotal: null, enemyTotal: null, acquiredMoney: null,
    });
    expect(displayPostBattleValue(null)).toBe("--");
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
