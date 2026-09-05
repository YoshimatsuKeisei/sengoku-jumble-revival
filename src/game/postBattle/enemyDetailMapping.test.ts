import { describe, expect, it } from "vitest";
import type { UnitTechnique, UnitType } from "../types";
import { resolvePostBattleAsset } from "./postBattleAssetManifest";
import {
  ENEMY_DETAIL_LAYOUT,
  resolveEnemyDetailActionSlots,
  resolveEnemyDetailSpecialSlots,
  resolveEnemyDetailTechnique,
  resolveEnemyDetailUnitType,
} from "./enemyDetailMapping";

describe("SWF enemy-detail mapping", () => {
  it("maps the eight original unit types to their extracted bitmap badges", () => {
    const expected: Array<[UnitType, number]> = [
      ["ASHIGARU", 2873], ["ARCHER", 2875], ["GENERAL", 2877], ["MOSA", 2879],
      ["STRATEGIST", 2881], ["TEPPOU", 2883], ["NINJA", 2885], ["CAVALRY", 2887],
    ];
    expect(expected.map(([unitType]) => resolveEnemyDetailUnitType(unitType)?.bitmapId))
      .toEqual(expected.map(([, bitmapId]) => bitmapId));
    expect(resolveEnemyDetailUnitType("PROTOTYPE")).toBeNull();
  });

  it("maps current techniques through SWF frame numbers without exposing enum text", () => {
    const expected: Array<[UnitTechnique, number]> = [
      ["ASHIGARU_SPEAR_STRIKE", 2890], ["ARCHER_ARROW", 2892], ["ARCHER_LONG_SHOT", 2894],
      ["TEPPOU_SHOOTING", 2896], ["TEPPOU_SNIPING", 2898], ["STRATEGIST_FIRE_PLAY", 2900],
      ["STRATEGIST_FIRE_ATTACK", 2902], ["STRATEGIST_FIRE_PLAN", 2904], ["STRATEGIST_HELLFIRE", 2906],
      ["STRATEGIST_FLAME_ART", 2908], ["MOSA_SENPUU", 2910], ["NINJA_NINJUTSU", 2912],
      ["NINJA_SHADOW_RUN", 2914], ["GENERAL_COMMAND", 2916], ["ARCHER_FIRE_ARROW", 2918],
      ["ARCHER_HOROKU", 2920], ["TEPPOU_BOMBARDMENT", 2922], ["STRATEGIST_SORCERY", 2924],
      ["STRATEGIST_FALSE_REPORT", 2926], ["NINJA_GENJUTSU", 2928], ["ASHIGARU_SPEAR_TECHNIQUE", 2930],
      ["GENERAL_HEROIC", 2932], ["MOSA_MUSOU", 2934], ["GENERAL_HEAL", 2936],
      ["STRATEGIST_HEAL", 2936], ["MOSA_KIJIN", 2938], ["CAVALRY_CHARGE", 2940],
      ["NINJA_BARRIER", 2942],
    ];
    for (const [technique, bitmapId] of expected) {
      expect(resolveEnemyDetailTechnique(technique)?.bitmapId).toBe(bitmapId);
    }
    expect(resolveEnemyDetailTechnique("PROTOTYPE_AREA")).toBeNull();
  });

  it("renders all action and ability slots with only owned values highlighted", () => {
    const actions = resolveEnemyDetailActionSlots("defend");
    expect(actions).toHaveLength(6);
    expect(actions.find((slot) => slot.slot === "t2")).toMatchObject({ bitmapId: 2734, active: true });
    expect(actions.find((slot) => slot.slot === "t1")).toMatchObject({ bitmapId: 2722, active: false });

    const abilities = resolveEnemyDetailSpecialSlots(["RUSH", "FIELD_HOSPITAL"], ["MOUTAI", "NINJA_HUNTER"]);
    expect(abilities).toHaveLength(18);
    expect(abilities.find((slot) => slot.slot === "t7")).toMatchObject({ bitmapId: 2767, active: true });
    expect(abilities.find((slot) => slot.slot === "t16")).toMatchObject({ bitmapId: 2822, active: true });
    expect(abilities.find((slot) => slot.slot === "t8")).toMatchObject({ bitmapId: 2770, active: false });
    expect(abilities.find((slot) => slot.slot === "t30")).toMatchObject({ bitmapId: 2949, active: true });
    expect(abilities.find((slot) => slot.slot === "t31")).toMatchObject({ bitmapId: 2955, active: true });
    expect(abilities.every((slot) => resolvePostBattleAsset(slot.bitmapId) !== null)).toBe(true);
  });

  it("uses extracted text and badge coordinates", () => {
    expect(ENEMY_DETAIL_LAYOUT).toMatchObject({
      name: { x: 134, y: 21.25 },
      hp: { x: 160.2, y: 74 },
      stipend: { x: 283.2, y: 16 },
      unitType: { tx: 177, ty: 45 },
      technique: { tx: 297, ty: 45 },
    });
  });
});

