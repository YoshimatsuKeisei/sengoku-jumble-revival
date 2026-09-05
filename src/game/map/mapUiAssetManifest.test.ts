import { describe, expect, it } from "vitest";
import { MAP_UI_ATLASES, requireMapUiAsset, resolveMapUiAsset } from "./mapUiAssetManifest";
import { MAP_CELLS, MAP_UI_MANIFEST } from "./mapUiModel";

describe("map UI atlas resolver", () => {
  it("resolves both map and intro logical assets to atlas rectangles", () => {
    expect(requireMapUiAsset("world_map_background")).toMatchObject({
      atlas: "map", frameKey: "world_map_background", width: 380, height: 380,
    });
    expect(requireMapUiAsset("intro_background")).toMatchObject({
      atlas: "intro", frameKey: "intro_background", width: 380, height: 380,
    });
    expect(Object.values(MAP_UI_ATLASES)).toHaveLength(2);
  });

  it("resolves every cell icon and manifest-referenced map asset", () => {
    const ids = new Set(MAP_CELLS.flatMap((cell) => [cell.icon, cell.bottom_label]));
    ids.add(MAP_UI_MANIFEST.cell_states.movable.asset);
    ids.add(MAP_UI_MANIFEST.cell_states.hover.bitmap);
    MAP_UI_MANIFEST.cell_states.current_marker.frames.forEach((id) => ids.add(id));
    MAP_UI_MANIFEST.bottom_ui.buttons.forEach((button) => {
      ids.add(button.normal);
      ids.add(button.over_down);
    });
    expect([...ids].filter((id) => resolveMapUiAsset(id) === null)).toEqual([]);
  });

  it("returns null for an unknown logical asset", () => {
    expect(resolveMapUiAsset("missing.asset")).toBeNull();
  });
});
