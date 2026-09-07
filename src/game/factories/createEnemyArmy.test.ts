import { describe, expect, it } from "vitest";
import { createDefaultTeamArmySetup } from "../systems/armySetupSystem";
import { createEnemyArmyForBattle } from "./createEnemyArmy";

describe("battle enemy army route", () => {
  it("keeps custom and original generation as exclusive paths", () => {
    const customSetup = createDefaultTeamArmySetup();
    const original = createEnemyArmyForBattle({
      mapKey: "x15y3",
      useCustomArmy: false,
      customSetup,
      random: () => 0,
    });
    const custom = createEnemyArmyForBattle({
      mapKey: "x15y3",
      useCustomArmy: true,
      customSetup,
      random: () => 0,
    });
    expect(original[0].name).toBe("姉小路頼綱");
    expect(original[0].unitType).toBe("STRATEGIST");
    expect(custom[0].name).toBe("enemy-0");
    expect(custom[0].unitType).toBe("PROTOTYPE");
  });
});
