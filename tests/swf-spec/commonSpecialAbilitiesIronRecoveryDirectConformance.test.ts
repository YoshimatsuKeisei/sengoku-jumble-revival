import { describe, expect, it } from "vitest";
import { createSoldier } from "../../src/game/entities/Soldier";
import { isDamageGuarded } from "../../src/game/systems/defenseSystem";
import { updateHealing } from "../../src/game/systems/recoverySystem";
import {
  SWF_IRON_WALL_KNOCKBACK_UNITS,
  SWF_NORMAL_KNOCKBACK_UNITS,
} from "../../src/game/systems/techniqueCombatProfiles";

describe("SWF conformance: s11 IRON_WALL and s20 RECOVERY_BOOST", () => {
  it("keeps s11 IRON_WALL out of guard probability and halves guarded source knockback 10 -> 5", () => {
    const normal = createSoldier("normal", "player", "ai", 500, 450);
    const iron = createSoldier("iron", "player", "ai", 500, 450);
    normal.stats.defense = iron.stats.defense = 100;
    iron.specialAbilities = ["IRON_WALL"];

    expect(isDamageGuarded(normal, "NORMAL_ATTACK", () => 0.51)).toBe(false);
    expect(isDamageGuarded(iron, "NORMAL_ATTACK", () => 0.51)).toBe(false);
    expect(SWF_NORMAL_KNOCKBACK_UNITS).toBe(10);
    expect(SWF_IRON_WALL_KNOCKBACK_UNITS).toBe(5);
  });

  it("doubles the raw s20 base-healing mp/400 increment without inventing self recovery merit", () => {
    const normal = createSoldier("normal", "player", "ai", 500, 450);
    const boosted = createSoldier("boosted", "player", "ai", 500, 450);
    for (const soldier of [normal, boosted]) {
      soldier.state = "HEALING";
      soldier.maxHp = 60;
      soldier.hp = 10;
    }
    boosted.specialAbilities = ["RECOVERY_BOOST"];

    updateHealing(normal, 1 / 24);
    updateHealing(boosted, 1 / 24);

    expect(normal.hp - 10).toBeCloseTo(60 / 400);
    expect(boosted.hp - 10).toBeCloseTo((60 / 400) * 2);
    expect(normal.merits.recovery).toBe(0);
    expect(boosted.merits.recovery).toBe(0);
  });
});
