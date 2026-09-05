import Phaser from "phaser";
import { createMapUiImage, requireMapUiAsset } from "./mapUiAssets";

export const MAP_UI_LOGICAL_SIZE = 380;

export function configureMapUiCamera(scene: Phaser.Scene): void {
  const viewportSize = Math.min(scene.scale.width, scene.scale.height);
  const viewportX = (scene.scale.width - viewportSize) / 2;
  const viewportY = (scene.scale.height - viewportSize) / 2;
  scene.cameras.main
    .setViewport(viewportX, viewportY, viewportSize, viewportSize)
    .setZoom(viewportSize / MAP_UI_LOGICAL_SIZE)
    // Phaser's scroll coordinate is based on the unzoomed camera center. A
    // scroll of (0, 0) therefore shows only the lower-right part after zooming.
    .centerOn(MAP_UI_LOGICAL_SIZE / 2, MAP_UI_LOGICAL_SIZE / 2)
    .setRoundPixels(true)
    .setBackgroundColor(0x000000);
}

export interface AtlasButton {
  image: Phaser.GameObjects.Image;
  setEnabled(enabled: boolean): void;
}

export function createAtlasButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  normalAsset: string,
  overDownAsset: string,
  onPress?: () => void,
): AtlasButton {
  const normal = requireMapUiAsset(normalAsset);
  const active = requireMapUiAsset(overDownAsset);
  const image = createMapUiImage(scene, normalAsset, x, y);
  let enabled = true;

  const setNormal = (): void => {
    image.setTexture(normal.textureKey, normal.frameKey);
  };
  const setActive = (): void => {
    image.setTexture(active.textureKey, active.frameKey);
  };
  image.setInteractive({ useHandCursor: true })
    .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      if (enabled) setActive();
    })
    .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => setNormal())
    .on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      if (!enabled) return;
      setActive();
      onPress?.();
    })
    .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      if (enabled) setActive();
    });

  return {
    image,
    setEnabled(nextEnabled: boolean): void {
      enabled = nextEnabled;
      image.setAlpha(enabled ? 1 : 0.55);
      if (!enabled) setNormal();
    },
  };
}
