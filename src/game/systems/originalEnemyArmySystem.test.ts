import { describe, expect, it } from "vitest";
import formationsJson from "../data/original-sengoku/formations/formations_all.json";
import mapPointsJson from "../data/original-sengoku/map/map_points_all.json";
import { battlefieldSourcePointToWorld } from "../battlefieldLayout";
import {
  createOriginalEnemyArmy,
  generateOriginalGenericName,
  generateOriginalGenericAbilities,
  generateOriginalGenericProfile,
  resolveOriginalEnemyStage,
  resolveOriginalStrategy,
  resolveOriginalUnitType,
} from "./originalEnemyArmySystem";

const zero = (): number => 0;

describe("original enemy army generation", () => {
  it("resolves a named stage and creates all 30 formation slots", () => {
    const stage = resolveOriginalEnemyStage("x15y3", zero);
    const army = createOriginalEnemyArmy("x15y3", zero);
    const formation = formationsJson.find((candidate) => candidate.formation_id === stage.formationId)!;

    expect(stage).toMatchObject({ formationId: 99, level: 2, battleKind: "named" });
    expect(army).toHaveLength(30);
    for (let index = 0; index < army.length; index += 1) {
      const source = formation.units[index];
      const position = battlefieldSourcePointToWorld({ x: source.world_x, y: source.world_y });
      expect(army[index]).toMatchObject({
        id: `enemy-${index}`,
        unitType: resolveOriginalUnitType(source.class_code),
        strategy: resolveOriginalStrategy(source.strategy_raw),
        x: position.x,
        y: position.y,
      });
    }
  });

  it("resolves every battle-capable map point to a recorded formation", () => {
    const formationIds = new Set(formationsJson.map((formation) => formation.formation_id));
    const battlePoints = mapPointsJson.filter((point) => point.battle_kind !== "excluded");
    for (const point of battlePoints) {
      expect(formationIds.has(resolveOriginalEnemyStage(point.map_key, zero).formationId), point.map_key).toBe(true);
    }
  });

  it("uses fixed famous-unit data instead of a generated name or stats", () => {
    const leader = createOriginalEnemyArmy("x15y3", zero)[0];
    expect(leader).toMatchObject({
      name: "姉小路頼綱",
      unitType: "STRATEGIST",
      technique: "STRATEGIST_FALSE_REPORT",
      strategy: "intercept",
      hp: 35,
      maxHp: 35,
      stats: { combat: 65, defense: 71, skill: 72, maxHp: 35, foot: 3 },
    });
    expect(leader.originalSpecialAbilityCodes).toEqual([1, 2, 3, 19, 13, 15]);
    expect(leader.specialAbilities).toEqual(expect.arrayContaining(["FORESIGHT", "RALLY_SPIRIT", "INSPIRE"]));
  });

  it("preserves the two pstch technique-assignment anomalies", () => {
    const honda = createOriginalEnemyArmy("x13y13", zero).find((soldier) => soldier.name === "本多忠勝");
    const kakei = createOriginalEnemyArmy("x8y8", zero).find((soldier) => soldier.name === "筧十蔵");
    expect(honda?.technique).toBe("GENERAL_COMMAND");
    expect(kakei?.technique).toBe("TEPPOU_SHOOTING");
  });

  it("generates non-empty names with the class-specific suffix pools", () => {
    const sequence = (...values: number[]): (() => number) => {
      let index = 0;
      return () => values[index++] ?? 0;
    };
    const elite = generateOriginalGenericName(3, sequence(0.5, 0, 0));
    const other = generateOriginalGenericName(1, sequence(0.5, 0, 0));
    expect(elite).not.toBe("");
    expect(elite.endsWith("兵太")).toBe(true);
    expect(other.endsWith("郎太")).toBe(true);
  });

  it("applies elv, caps, and the ninja HP exception", () => {
    const ashigaruLv1 = generateOriginalGenericProfile(1, 1, zero).stats;
    const ashigaruLv7 = generateOriginalGenericProfile(1, 7, zero).stats;
    const ninjaLv1 = generateOriginalGenericProfile(7, 1, zero).stats;
    const ninjaLv7 = generateOriginalGenericProfile(7, 7, zero).stats;
    expect(ashigaruLv7.combat - ashigaruLv1.combat).toBe(30);
    expect(ashigaruLv7.maxHp - ashigaruLv1.maxHp).toBe(30);
    expect(ninjaLv7.combat - ninjaLv1.combat).toBe(30);
    expect(ninjaLv7.maxHp).toBe(ninjaLv1.maxHp);
    for (const stats of [ashigaruLv7, ninjaLv7]) {
      expect(stats.combat).toBeLessThanOrEqual(110);
      expect(stats.defense).toBeLessThanOrEqual(110);
      expect(stats.skill).toBeLessThanOrEqual(110);
      expect(stats.maxHp).toBeLessThanOrEqual(110);
    }
  });

  it("uses each class's original technique candidates", () => {
    expect(generateOriginalGenericProfile(1, 1, zero).technique).toBe("ASHIGARU_SPEAR_STRIKE");
    expect(generateOriginalGenericProfile(2, 1, zero).technique).toBe("ARCHER_ARROW");
    expect(generateOriginalGenericProfile(3, 1, zero).technique).toBe("GENERAL_COMMAND");
    expect(generateOriginalGenericProfile(4, 1, zero).technique).toBe("MOSA_SENPUU");
    expect(generateOriginalGenericProfile(5, 1, zero).technique).toBe("STRATEGIST_FIRE_PLAY");
    expect(generateOriginalGenericProfile(6, 1, zero).technique).toBe("TEPPOU_SHOOTING");
    expect(generateOriginalGenericProfile(7, 1, zero).technique).toBe("NINJA_NINJUTSU");
    expect(generateOriginalGenericProfile(8, 1, zero).technique).toBe("CAVALRY_CHARGE");
  });

  it("rolls every generic ability independently and applies confirmed class abilities", () => {
    const none = generateOriginalGenericAbilities(1, () => 0.999999);
    expect(none).toEqual({ codes: [], common: [], rare: [] });
    const all = generateOriginalGenericAbilities(8, () => 0);
    expect(all.codes).toEqual(expect.arrayContaining([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 32]));
    expect(all.common).toEqual(expect.arrayContaining(["RUSH", "FLEET_FOOT", "MIGHT", "TREATMENT"]));
    expect(all.rare).toContain("JINTO");
    expect(generateOriginalGenericAbilities(7, () => 0).rare).toContain("KATON");
    expect(generateOriginalGenericAbilities(4, () => 0).rare).toContain("NINJA_HUNTER");
  });

  it("applies the plain Lv4+ cavalry override only to eligible plain slots", () => {
    const alwaysHigh = (): number => 0.999999;
    const plain = createOriginalEnemyArmy("x9y8", alwaysHigh);
    const named = createOriginalEnemyArmy("x15y3", alwaysHigh);
    expect(plain.filter((soldier) => soldier.unitType === "CAVALRY").length).toBeGreaterThan(0);
    expect(named.filter((soldier) => soldier.unitType === "CAVALRY")).toHaveLength(0);
  });

  it("does not collapse generic soldiers to one prototype stat line", () => {
    let state = 0x12345678;
    const seeded = (): number => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x1_0000_0000;
    };
    const army = createOriginalEnemyArmy("x8y14", seeded);
    const lines = new Set(army.map((soldier) => JSON.stringify(soldier.stats)));
    expect(lines.size).toBeGreaterThan(1);
    expect(army.every((soldier) => soldier.name.length > 0)).toBe(true);
  });
});
