import Phaser from "phaser";
import { BATTLEFIELD_SOURCE_TO_WORLD } from "../battlefieldLayout";
import {
  BATTLE_FRAME_SEQUENCE_ASSETS,
  getBattleFrameSequence,
  getBattleFrameTextureKey,
  sampleBattleFrameSequence,
  type BattleFrameSequenceId,
} from "./battleFrameSequenceManifest";

interface EffectPoint { x: number; y: number }

interface ActiveSequence {
  id: BattleFrameSequenceId;
  startedAt: number;
  root: EffectPoint;
  getRoot?: () => EffectPoint | null;
  isActive?: () => boolean;
  image: Phaser.GameObjects.Image;
}

export class BattleFrameSequenceRenderer {
  private readonly active: ActiveSequence[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    for (const asset of BATTLE_FRAME_SEQUENCE_ASSETS) {
      if (scene.textures.exists(asset.key))
        scene.textures.get(asset.key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
  }

  play(
    id: BattleFrameSequenceId,
    startedAt: number,
    root: EffectPoint,
    options: { getRoot?: () => EffectPoint | null; isActive?: () => boolean } = {},
  ): boolean {
    const definition = getBattleFrameSequence(id);
    if (!definition || !this.scene.textures.exists(definition.frames[0].key)) return false;
    const image = this.scene.add.image(root.x, root.y, definition.frames[0].key)
      .setOrigin(0.5)
      .setScale(BATTLEFIELD_SOURCE_TO_WORLD.scaleX, BATTLEFIELD_SOURCE_TO_WORLD.scaleY)
      .setDepth(2.05);
    this.active.push({ id, startedAt, root: { ...root }, ...options, image });
    return true;
  }

  update(now: number): void {
    const retained: ActiveSequence[] = [];
    for (const effect of this.active) {
      if (effect.isActive && !effect.isActive()) {
        effect.image.destroy();
        continue;
      }
      const sample = sampleBattleFrameSequence(effect.id, now - effect.startedAt);
      if (!sample || sample.ended) {
        effect.image.destroy();
        continue;
      }
      const root = effect.getRoot?.() ?? effect.root;
      if (!root) {
        effect.image.destroy();
        continue;
      }
      effect.image
        .setPosition(root.x, root.y)
        .setTexture(getBattleFrameTextureKey(effect.id, sample.frameIndex));
      retained.push(effect);
    }
    this.active.length = 0;
    this.active.push(...retained);
  }

  destroy(): void {
    for (const effect of this.active) effect.image.destroy();
    this.active.length = 0;
  }
}
