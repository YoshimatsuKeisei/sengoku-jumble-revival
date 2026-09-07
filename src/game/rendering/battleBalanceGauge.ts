import Phaser from "phaser";
import manifestJson from "../../../assets/battlefield_panel/balance_gauge_htbr/battle_balance_gauge_manifest.json";

const manifest = manifestJson;

export const BATTLE_BALANCE_GAUGE_ASSET = Object.freeze({
  key: "battle-balance-gauge-htbr",
  url: new URL(
    "../../../assets/battlefield_panel/balance_gauge_htbr/battle_balance_gauge_600frames.png",
    import.meta.url,
  ).href,
  x: manifest.source.root_stage_position.x,
  y: manifest.source.root_stage_position.y,
  frameWidth: manifest.spritesheet.frame_width,
  frameHeight: manifest.spritesheet.frame_height,
  frameCount: manifest.spritesheet.frame_count,
});

export function preloadBattleBalanceGauge(scene: Phaser.Scene): void {
  if (scene.textures.exists(BATTLE_BALANCE_GAUGE_ASSET.key)) return;
  scene.load.spritesheet(BATTLE_BALANCE_GAUGE_ASSET.key, BATTLE_BALANCE_GAUGE_ASSET.url, {
    frameWidth: BATTLE_BALANCE_GAUGE_ASSET.frameWidth,
    frameHeight: BATTLE_BALANCE_GAUGE_ASSET.frameHeight,
    endFrame: BATTLE_BALANCE_GAUGE_ASSET.frameCount - 1,
  });
}

export function configureBattleBalanceGaugeTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(BATTLE_BALANCE_GAUGE_ASSET.key)) {
    scene.textures.get(BATTLE_BALANCE_GAUGE_ASSET.key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
}
