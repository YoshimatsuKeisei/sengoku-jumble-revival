import Phaser from "phaser";
import { createMapUiImage, requireMapUiAsset } from "./mapUiAssets";
import { configureSwfGameStage, SWF_STAGE_WIDTH } from "../stageLayout";

export const MAP_UI_LOGICAL_SIZE = SWF_STAGE_WIDTH;

export function configureMapUiCamera(scene: Phaser.Scene): void {
  configureSwfGameStage(scene);
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
