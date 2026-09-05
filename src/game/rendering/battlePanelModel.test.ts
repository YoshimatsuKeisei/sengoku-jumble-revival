import { describe, expect, it } from "vitest";
import { createSoldier } from "../entities/Soldier";
import { createBattleBases } from "../systems/baseSystem";
import {
  buildBattlePanelViewModel,
  collectBattleUiSnapshot,
  diffBattleUiSnapshots,
} from "./battlePanelModel";

describe("battle panel view model", () => {
  it("reads the existing battle state without mutating HP or replaying battle events", () => {
    const player = createSoldier("p", "player", "player", 10, 10);
    const enemy = createSoldier("e", "enemy", "ai", 20, 20);
    const bases = createBattleBases();
    player.hp -= 3;
    const before = JSON.stringify({ soldiers: [player, enemy], bases });
    const model = buildBattlePanelViewModel([player, enemy], bases, player, enemy);
    expect(model).toMatchObject({ playerAlive: 1, enemyAlive: 1, leftStatus: { hp: `${player.hp}/${player.maxHp}` } });
    expect(JSON.stringify({ soldiers: [player, enemy], bases })).toBe(before);
  });

  it("routes observed transitions to the original left/right notice lanes", () => {
    const player = createSoldier("p", "player", "player", 10, 10);
    const enemy = createSoldier("e", "enemy", "ai", 20, 20);
    const bases = createBattleBases();
    const before = collectBattleUiSnapshot([player, enemy], bases);
    enemy.isDead = true;
    bases.find((base) => base.team === "player")!.hp -= 1;
    const after = collectBattleUiSnapshot([player, enemy], bases);
    expect(diffBattleUiSnapshots(before, after)).toEqual([
      { kind: "event", side: "enemy", message: "E 討ち取ったり！" },
      { kind: "event", side: "player", message: "★自陣が攻撃されています！" },
    ]);
    expect(diffBattleUiSnapshots(after, after)).toEqual([]);
  });

  it("routes a player retreat to cma and the single uwd warning controller", () => {
    const player = createSoldier("p", "player", "player", 10, 10);
    const enemy = createSoldier("e", "enemy", "ai", 20, 20);
    const bases = createBattleBases();
    const before = collectBattleUiSnapshot([player, enemy], bases);
    player.state = "EMERGENCY_RETREAT";
    const after = collectBattleUiSnapshot([player, enemy], bases);
    expect(diffBattleUiSnapshots(before, after)).toEqual([
      { kind: "event", side: "player", message: "P 一時退避！" },
      { kind: "temporary", state: 4 },
    ]);
  });

  it("reports an observed guarded base hit to the defending side notice lane", () => {
    const fortifier = createSoldier("f", "player", "ai", 10, 10);
    fortifier.specialAbilities = ["FORTIFY"];
    const attacker = createSoldier("e", "enemy", "ai", 20, 20);
    const bases = createBattleBases();
    const playerBase = bases.find((base) => base.team === "player")!;
    attacker.attackTargetId = playerBase.id;
    const before = collectBattleUiSnapshot([fortifier, attacker], bases);
    attacker.attackHitApplied = true;
    const after = collectBattleUiSnapshot([fortifier, attacker], bases);
    expect(diffBattleUiSnapshots(before, after)).toContainEqual({
      kind: "event", side: "player", message: "★Fの堅陣発動！",
    });
  });
});
