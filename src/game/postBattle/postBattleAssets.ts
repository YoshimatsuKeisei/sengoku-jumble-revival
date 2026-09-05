import Phaser from "phaser";
import {
  POST_BATTLE_ATLAS_ENTRIES,
  POST_BATTLE_ATLAS_KEY,
  POST_BATTLE_ATLAS_URL,
  requirePostBattleAsset,
} from "./postBattleAssetManifest";

export * from "./postBattleAssetManifest";

export function preloadPostBattleAtlas(scene: Phaser.Scene): void {
  if (!scene.textures.exists(POST_BATTLE_ATLAS_KEY)) scene.load.image(POST_BATTLE_ATLAS_KEY, POST_BATTLE_ATLAS_URL);
}

export function registerPostBattleAtlasFrames(scene: Phaser.Scene): void {
  const texture = scene.textures.get(POST_BATTLE_ATLAS_KEY);
  texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  for (const [entryKey, entry] of Object.entries(POST_BATTLE_ATLAS_ENTRIES)) {
    if (!texture.has(entryKey)) texture.add(entryKey, 0, entry.x, entry.y, entry.width, entry.height);
  }
}

export function createPostBattleImage(
  scene: Phaser.Scene,
  id: string | number,
  x: number,
  y: number,
): Phaser.GameObjects.Image {
  const asset = requirePostBattleAsset(id);
  return scene.add.image(x, y, asset.textureKey, asset.frameKey).setOrigin(0);
}
