import { describe, expect, it } from "vitest";
import {
  ACTION_BINDING_BY_TECHNIQUE,
  EFFECT_ATLAS_ASSETS,
  TEPPOU_ACTION_CODE_BY_TECHNIQUE,
  TEPPOU_ATLAS_ASSETS,
  UNIT_ACTION_EFFECTS,
  UNIT_ATLAS_ASSETS,
  getEffectAtlasRegion,
  getEffectSequence,
  getRequiredAtlasAssets,
  resolveActionEffects,
  resolveTechniqueActionEffects,
  resolveTeppouActionEffects,
} from "./effectManifest";

describe("effect manifests", () => {
  it("resolves shooting, sniping, and bombardment from their manifest action codes", () => {
    expect(TEPPOU_ACTION_CODE_BY_TECHNIQUE).toEqual({
      TEPPOU_SHOOTING: 4,
      TEPPOU_SNIPING: 5,
      TEPPOU_BOMBARDMENT: 17,
    });
    for (const [technique, actionCode] of Object.entries(TEPPOU_ACTION_CODE_BY_TECHNIQUE)) {
      const action = resolveTeppouActionEffects(technique as keyof typeof TEPPOU_ACTION_CODE_BY_TECHNIQUE);
      expect(action?.action_code).toBe(actionCode);
      expect(action?.effects.projectile).toEqual([
        { effect_id: "archer_teppou_attack2_projectile", conditional: false },
      ]);
    }
    expect(resolveTeppouActionEffects("ARCHER_ARROW")).toBeNull();
  });

  it("uses fr_exp only for teppou action 17", () => {
    const action = resolveActionEffects("teppou", 17);
    expect(action).toMatchObject({ action_code: 17, action_name: "砲撃", character_action_frame_range: "41-48" });
    expect(action?.effects).toEqual({
      caster: [],
      projectile: [{ effect_id: "archer_teppou_attack2_projectile", conditional: false }],
      hit: [{ effect_id: "fr_exp", conditional: false }],
    });
    expect(resolveTeppouActionEffects("TEPPOU_SHOOTING")?.effects.hit).toEqual([]);
    expect(resolveTeppouActionEffects("TEPPOU_SNIPING")?.effects.hit).toEqual([]);
    expect(resolveActionEffects("teppou", 999)).toBeNull();
  });

  it("exposes only runtime-enabled sequences", () => {
    expect(getEffectSequence("archer_teppou_attack2_projectile")?.runtime_enabled).toBe(true);
    expect(getEffectSequence("fr_exp")?.runtime_enabled).toBe(true);
    expect(getEffectSequence("as_ase3")).toBeNull();
  });

  it("resolves every one of the 29 unit action entries without reading common or ability maps", () => {
    expect(UNIT_ACTION_EFFECTS).toHaveLength(29);
    for (const { unitType, action } of UNIT_ACTION_EFFECTS) {
      expect(resolveActionEffects(unitType, action.action_code)).toBe(action);
    }
  });

  it("binds every currently implemented game technique and leaves admiral action 28 manifest-only", () => {
    expect(Object.keys(ACTION_BINDING_BY_TECHNIQUE)).toHaveLength(28);
    for (const technique of Object.keys(ACTION_BINDING_BY_TECHNIQUE)) {
      expect(resolveTechniqueActionEffects(technique as keyof typeof ACTION_BINDING_BY_TECHNIQUE)).not.toBeNull();
    }
    expect(resolveActionEffects("admiral", 28)?.action_code).toBe(28);
  });

  it("keeps intentional empty-effect actions empty", () => {
    expect([
      resolveActionEffects("ashigaru", 1),
      resolveActionEffects("mosa", 11),
      resolveActionEffects("ninja", 13),
      resolveActionEffects("ninja", 20),
    ].every((action) => action && Object.values(action.effects).every((references) => references.length === 0))).toBe(true);
  });

  it("resolves atlas regions from bitmap ids", () => {
    expect(getEffectAtlasRegion(996)).toMatchObject({
      region_id: "bitmap_996", atlas_id: "projectile_0", x: 2, y: 2, width: 80, height: 9,
      rotated: false, trimmed: false,
    });
    expect(getEffectAtlasRegion(672)).toMatchObject({
      region_id: "bitmap_672", atlas_id: "hit_0", width: 51, height: 54,
    });
    expect(getEffectAtlasRegion(-1)).toBeNull();
  });

  it("deduplicates atlas loads while retaining the teppou subset", () => {
    expect(EFFECT_ATLAS_ASSETS.map((asset) => asset.atlas_id)).toEqual(["caster_0", "projectile_0", "hit_0"]);
    expect(UNIT_ATLAS_ASSETS.map((asset) => asset.atlas_id)).toEqual(["caster_0", "projectile_0", "hit_0"]);
    expect(TEPPOU_ATLAS_ASSETS.map((asset) => asset.atlas_id)).toEqual(["projectile_0", "hit_0"]);
    expect(getRequiredAtlasAssets(["fr_exp", "fr_exp"])).toHaveLength(1);
  });
});
