import Phaser from "phaser";
import {
  FORMATION_ATLAS,
  FORMATION_SOURCE_PARTS,
  requireFormationAsset,
} from "./formationAssetManifest";

export * from "./formationAssetManifest";

export function preloadFormationAssets(scene: Phaser.Scene): void {
  if (!scene.textures.exists(FORMATION_ATLAS.key)) scene.load.image(FORMATION_ATLAS.key, FORMATION_ATLAS.url);
  for (const part of Object.values(FORMATION_SOURCE_PARTS)) {
    if (!scene.textures.exists(part.key)) scene.load.image(part.key, part.url);
  }
}

export function registerFormationAtlasFrames(scene: Phaser.Scene): void {
  const texture = scene.textures.get(FORMATION_ATLAS.key);
  texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  for (const [alias, definition] of Object.entries(FORMATION_ATLAS.frames)) {
    if (texture.has(alias)) continue;
    const frame = definition.frame;
    texture.add(alias, 0, frame.x, frame.y, frame.w, frame.h);
  }
}

export function createFormationAtlasImage(
  scene: Phaser.Scene,
  alias: string,
  x: number,
  y: number,
): Phaser.GameObjects.Image {
  const asset = requireFormationAsset(alias);
  return scene.add.image(x, y, asset.textureKey, asset.frameKey).setOrigin(0);
}
