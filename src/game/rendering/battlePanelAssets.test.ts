import { describe, expect, it } from "vitest";
import {
  BATTLE_PANEL_PRELOAD_ATLASES,
  requireBattlePanelAsset,
  resolveBattlePanelAsset,
} from "./battlePanelAssets";

describe("battle panel atlas resolver", () => {
  it("resolves a logical id to its atlas frame rectangle", () => {
    expect(requireBattlePanelAsset("top_hud.timer.timer_panel")).toMatchObject({
      atlas: "hud", frameKey: "bitmap_2559", x: 198, y: 101, width: 59, height: 21,
      atlasWidth: 512, atlasHeight: 128,
    });
  });

  it("keeps PLAYER and ENEMY alert aliases while sharing bitmap 2565", () => {
    const player = requireBattlePanelAsset("top_hud.player_force.alert_icon");
    const enemy = requireBattlePanelAsset("top_hud.enemy_force.alert_icon");
    expect(player.logicalId).not.toBe(enemy.logicalId);
    expect(player).toMatchObject({ atlas: enemy.atlas, frameKey: enemy.frameKey, bitmapId: 2565 });
  });

  it("keeps warning, exit, and battle-end aliases while sharing bitmap 2499", () => {
    const ids = [
      "battle_messages.warnings.message_background",
      "battle_messages.exit_confirmation.message_background",
      "battle_messages.battle_end.message_background",
    ];
    const resolved = ids.map(requireBattlePanelAsset);
    expect(new Set(resolved.map((asset) => asset.logicalId)).size).toBe(3);
    expect(new Set(resolved.map((asset) => `${asset.atlas}:${asset.frameKey}:${asset.bitmapId}`)))
      .toEqual(new Set(["messages:bitmap_2499:2499"]));
  });

  it("uses a safe null resolver and a clear required-asset error", () => {
    expect(resolveBattlePanelAsset("missing.asset")).toBeNull();
    expect(() => requireBattlePanelAsset("missing.asset")).toThrow("Unknown battlefield panel asset: missing.asset");
  });

  it("preloads only HUD and messages, leaving intro lazy", () => {
    expect(BATTLE_PANEL_PRELOAD_ATLASES.map((atlas) => atlas.atlas)).toEqual(["hud", "messages"]);
  });
});
