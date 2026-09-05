import { describe, expect, it } from "vitest";
import { FORMATION_ATLAS, requireFormationAsset, resolveFormationAsset } from "./formationAssetManifest";

describe("formation UI atlas resolver", () => {
  it.each([
    ["bottom_toolbar", 3034],
    ["overview_grid", 2658],
    ["confirm_normal", 3046],
    ["confirm_over_down", 3048],
    ["cancel_normal", 3041],
    ["cancel_over_down", 3043],
    ["view_normal", 3036],
    ["view_over_down", 3038],
  ])("resolves %s to Bitmap %i", (alias, bitmapId) => {
    expect(requireFormationAsset(alias)).toMatchObject({ alias, bitmapId, textureKey: FORMATION_ATLAS.key });
  });

  it("preserves source-sized, untrimmed 36px button frames", () => {
    expect(requireFormationAsset("confirm_normal")).toMatchObject({ width: 36, height: 36 });
    expect(requireFormationAsset("bottom_toolbar")).toMatchObject({ width: 382, height: 44 });
  });

  it("uses a safe resolver for unknown aliases", () => {
    expect(resolveFormationAsset("missing")).toBeNull();
  });
});
