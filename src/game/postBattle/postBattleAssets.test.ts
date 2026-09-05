import { describe, expect, it } from "vitest";
import { resolvePostBattleAsset, requirePostBattleAsset } from "./postBattleAssetManifest";

describe("post-battle atlas resolver", () => {
  it("resolves logical aliases to the untrimmed atlas rectangle", () => {
    expect(resolvePostBattleAsset("battle_result_panel")).toMatchObject({
      bitmap_id: 3161,
      x: 384,
      y: 384,
      width: 319,
      height: 297,
      rotated: false,
      trimmed: false,
    });
  });

  it("resolves numeric bitmap ids and rejects unknown ids", () => {
    expect(resolvePostBattleAsset(2853)).toMatchObject({ entryKey: "bitmap_2853", width: 85, height: 28 });
    expect(resolvePostBattleAsset("missing")).toBeNull();
    expect(() => requirePostBattleAsset("missing")).toThrow("Unknown post-battle UI asset");
  });
});
