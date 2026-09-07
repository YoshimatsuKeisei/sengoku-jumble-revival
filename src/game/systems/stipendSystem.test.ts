import { describe, expect, it } from "vitest";
import { calculateBaseStipend, calculateMaxTotalStipend, calculateSoldierStipend, TECHNIQUE_STIPEND_COST } from "./stipendSystem";

describe("SWF stipend", () => {
  it("combines the cubic base, technique, known raw abilities, class factor and cap", () => {
    const input = {
      stats: { combat: 100, maxHp: 80, defense: 70, skill: 60, foot: 4 },
      maxHp: 80,
      unitType: "ASHIGARU" as const,
      technique: "ASHIGARU_SPEAR_TECHNIQUE" as const,
      specialAbilities: ["MIGHT"] as const,
      rareSpecialAbilities: ["NINJA_HUNTER"] as const,
      originalSpecialAbilityCodes: [1, 10, 34],
    };
    const base = Math.floor(100 ** 3 / 2000 + 80 ** 3 / 2500 + 70 ** 3 / 3000 + 60 ** 3 / 2200 + 4 ** 3 * 2);
    expect(calculateSoldierStipend(input)).toBe(Math.floor((base + 250 + 10 + 300 + 700) * 0.7));
    expect(TECHNIQUE_STIPEND_COST.STRATEGIST_FLAME_ART).toBe(5000);
  });

  it("does not double-charge normalized and raw copies of the same ability", () => {
    const common = {
      stats: { combat: 0, maxHp: 0, defense: 0, skill: 0, foot: 0 },
      maxHp: 0,
      unitType: "MOSA" as const,
      technique: "PROTOTYPE_AREA" as const,
      rareSpecialAbilities: [] as const,
    };
    expect(calculateSoldierStipend({ ...common, specialAbilities: ["MIGHT"], originalSpecialAbilityCodes: [10] })).toBe(300);
  });

  it("uses the cubic base formula and only discounts ashigaru/archer", () => {
    const stats = { combat: 10, maxHp: 20, defense: 30, skill: 40, foot: 5 };
    const base = Math.floor(10 ** 3 / 2000 + 20 ** 3 / 2500 + 30 ** 3 / 3000 + 40 ** 3 / 2200 + 5 ** 3 * 2);
    expect(calculateBaseStipend(stats)).toBe(base);
    const common = { stats, maxHp: 20, technique: "PROTOTYPE_AREA" as const,
      specialAbilities: [] as const, rareSpecialAbilities: [] as const };
    expect(calculateSoldierStipend({ ...common, unitType: "MOSA" })).toBe(base);
    expect(calculateSoldierStipend({ ...common, unitType: "ARCHER" })).toBe(Math.floor(base * 0.7));
    expect(calculateSoldierStipend({ ...common, unitType: "ASHIGARU" })).toBe(Math.floor(base * 0.7));
  });

  it("prices the confirmed unnamed and class-specific raw flags and caps at 9999", () => {
    const common = {
      stats: { combat: 0, maxHp: 0, defense: 0, skill: 0, foot: 0 },
      maxHp: 0,
      unitType: "MOSA" as const,
      technique: "PROTOTYPE_AREA" as const,
      specialAbilities: [] as const,
      rareSpecialAbilities: [] as const,
    };
    expect(calculateSoldierStipend({ ...common, originalSpecialAbilityCodes: [1, 2, 3, 4, 5, 6] })).toBe(40);
    expect(calculateSoldierStipend({ ...common, originalSpecialAbilityCodes: [31, 32, 33, 34] })).toBe(4900);
    expect(calculateSoldierStipend({ ...common, stats: { combat: 999, maxHp: 999, defense: 999, skill: 999, foot: 9 }, maxHp: 999 })).toBe(9999);
  });

  it("keeps the total cap formula isolated from persistence", () => {
    expect(calculateMaxTotalStipend(2, ["丹羽長秀軍"])).toBe(30600);
    expect(calculateMaxTotalStipend(100, ["織田信長軍"])).toBe(62000);
  });
});
