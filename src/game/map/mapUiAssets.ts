import Phaser from "phaser";
import { MAP_UI_ATLASES, requireMapUiAsset } from "./mapUiAssetManifest";

export * from "./mapUiAssetManifest";

export function preloadMapUiAtlases(scene: Phaser.Scene): void {
  for (const atlas of Object.values(MAP_UI_ATLASES)) {
    if (!scene.textures.exists(atlas.textureKey)) scene.load.image(atlas.textureKey, atlas.url);
  }
}

export function registerMapUiAtlasFrames(scene: Phaser.Scene): void {
  for (const atlas of Object.values(MAP_UI_ATLASES)) {
    if (!scene.textures.exists(atlas.textureKey)) continue;
    const texture = scene.textures.get(atlas.textureKey);
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    for (const [frameKey, definition] of Object.entries(atlas.frames)) {
      if (texture.has(frameKey)) continue;
      const frame = definition.frame;
      texture.add(frameKey, 0, frame.x, frame.y, frame.w, frame.h);
    }
  }
}

export function createMapUiImage(scene: Phaser.Scene, logicalId: string, x: number, y: number): Phaser.GameObjects.Image {
  const asset = requireMapUiAsset(logicalId);
  return scene.add.image(x, y, asset.textureKey, asset.frameKey).setOrigin(0);
}
