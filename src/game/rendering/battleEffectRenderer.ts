import Phaser from "phaser";
import { GUN_CONFIG } from "../config";
import {
  getEffectAtlasAsset,
  getEffectAtlasRegions,
  getEffectSequence,
  type EffectAtlasAsset,
} from "./effectManifest";
import { decomposeEffectMatrix, hasEffectReachedArrival, resolveEffectTimeline } from "./effectTimeline";

export const BATTLE_EFFECT_RENDER_CONFIG = {
  depth: 1.9,
  projectileTravelDurationMs: GUN_CONFIG.shotLineDurationMs,
} as const;

interface EffectPoint {
  x: number;
  y: number;
}

interface ActiveEffect {
  effectId: string;
  startedAt: number;
  start: EffectPoint;
  end: EffectPoint;
  travelDurationMs: number;
  rotateAlongPath: boolean;
  destroyOnArrival: boolean;
  arrivalNotified: boolean;
  onArrive?: (arrivalTime: number) => void;
  getRoot?: () => EffectPoint | null;
  isActive?: () => boolean;
  persistUntilArrival: boolean;
  holdLastFrame: boolean;
  image: Phaser.GameObjects.Image;
}

export class BattleEffectRenderer {
  private readonly activeEffects: ActiveEffect[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    atlasAssets: readonly EffectAtlasAsset[],
  ) {
    for (const atlas of atlasAssets) this.registerAtlas(atlas);
  }

  private registerAtlas(atlas: EffectAtlasAsset): void {
    if (!this.scene.textures.exists(atlas.key)) return;
    const texture = this.scene.textures.get(atlas.key);
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    for (const region of getEffectAtlasRegions(atlas.atlas_id)) {
      if (texture.has(region.region_id)) continue;
      texture.add(region.region_id, 0, region.x, region.y, region.width, region.height);
    }
  }

  canPlay(effectId: string): boolean {
    const sequence = getEffectSequence(effectId);
    const firstFrame = sequence?.frames[0];
    const atlas = firstFrame ? getEffectAtlasAsset(firstFrame.atlas_id) : null;
    return Boolean(sequence && firstFrame && atlas && this.scene.textures.exists(atlas.key)
      && this.scene.textures.get(atlas.key).has(firstFrame.region_id));
  }

  play(
    effectId: string,
    startedAt: number,
    start: EffectPoint,
    options: {
      end?: EffectPoint;
      travelDurationMs?: number;
      rotateAlongPath?: boolean;
      destroyOnArrival?: boolean;
      onArrive?: (arrivalTime: number) => void;
      getRoot?: () => EffectPoint | null;
      isActive?: () => boolean;
      persistUntilArrival?: boolean;
      holdLastFrame?: boolean;
    } = {},
  ): boolean {
    const sequence = getEffectSequence(effectId);
    const firstFrame = sequence?.frames[0];
    const atlas = firstFrame ? getEffectAtlasAsset(firstFrame.atlas_id) : null;
    if (!sequence || !firstFrame || !atlas || !this.canPlay(effectId)) return false;
    const image = this.scene.add.image(start.x, start.y, atlas.key, firstFrame.region_id)
      .setOrigin(0, 0)
      .setDepth(BATTLE_EFFECT_RENDER_CONFIG.depth)
      .setVisible(false);
    this.activeEffects.push({
      effectId,
      startedAt,
      start: { ...start },
      end: { ...(options.end ?? start) },
      travelDurationMs: Math.max(0, options.travelDurationMs ?? 0),
      rotateAlongPath: options.rotateAlongPath ?? false,
      destroyOnArrival: options.destroyOnArrival ?? false,
      arrivalNotified: false,
      onArrive: options.onArrive,
      getRoot: options.getRoot,
      isActive: options.isActive,
      persistUntilArrival: options.persistUntilArrival ?? false,
      holdLastFrame: options.holdLastFrame ?? false,
      image,
    });
    return true;
  }

  update(now: number): void {
    const processing = this.activeEffects.splice(0, this.activeEffects.length);
    const retained: ActiveEffect[] = [];
    for (const effect of processing) {
      if (effect.isActive && !effect.isActive()) {
        effect.image.destroy();
        continue;
      }
      const elapsedMs = Math.max(0, now - effect.startedAt);
      if (!effect.arrivalNotified && hasEffectReachedArrival(elapsedMs, effect.travelDurationMs)) {
        effect.arrivalNotified = true;
        effect.onArrive?.(effect.startedAt + effect.travelDurationMs);
        if (effect.destroyOnArrival) {
          effect.image.destroy();
          continue;
        }
      }
      const sequence = getEffectSequence(effect.effectId);
      const timelineElapsed = effect.persistUntilArrival && sequence && elapsedMs < effect.travelDurationMs
        ? elapsedMs % Math.max(1, sequence.duration_ms)
        : elapsedMs;
      let sample = resolveEffectTimeline(effect.effectId, timelineElapsed);
      if (sample?.ended && effect.holdLastFrame && sequence) {
        sample = resolveEffectTimeline(effect.effectId, Math.max(0, sequence.duration_ms - 0.001));
      }
      if (!sample || sample.ended) {
        effect.image.destroy();
        continue;
      }
      if (!sample.visible || !sample.region) {
        effect.image.setVisible(false);
        retained.push(effect);
        continue;
      }
      const atlas = getEffectAtlasAsset(sample.region.atlas_id);
      if (!atlas) {
        effect.image.destroy();
        continue;
      }
      const travelProgress = effect.travelDurationMs > 0 ? Math.min(1, elapsedMs / effect.travelDurationMs) : 0;
      const followedRoot = effect.getRoot?.();
      const rootX = followedRoot?.x ?? Phaser.Math.Linear(effect.start.x, effect.end.x, travelProgress);
      const rootY = followedRoot?.y ?? Phaser.Math.Linear(effect.start.y, effect.end.y, travelProgress);
      const pathAngle = effect.rotateAlongPath
        ? Math.atan2(effect.end.y - effect.start.y, effect.end.x - effect.start.x)
        : 0;
      const transform = decomposeEffectMatrix(sample.matrix);
      const cos = Math.cos(pathAngle);
      const sin = Math.sin(pathAngle);
      effect.image.setTexture(atlas.key, sample.region.region_id)
        .setPosition(rootX + transform.x * cos - transform.y * sin, rootY + transform.x * sin + transform.y * cos)
        .setRotation(pathAngle + transform.rotation)
        .setScale(transform.scaleX, transform.scaleY)
        .setVisible(true);
      retained.push(effect);
    }
    this.activeEffects.push(...retained);
  }

  destroy(): void {
    for (const effect of this.activeEffects) effect.image.destroy();
    this.activeEffects.length = 0;
  }

  get activeCount(): number {
    return this.activeEffects.length;
  }
}
