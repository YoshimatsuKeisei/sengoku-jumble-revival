import Phaser from "phaser";
import {
  BATTLEFIELD_SOURCE_TO_WORLD,
  battlefieldSourceDistanceToWorldX,
  battlefieldSourceDistanceToWorldY,
} from "../battlefieldLayout";
import type { Soldier } from "../types";
import {
  BATTLE_UNIT_UI_TEXTURES,
  UNIT_HP_BAR_SIZE,
  SWF_UNIT_HP_BAR_COLORS,
  SWF_UNIT_HP_BAR_LOCAL_SCALE,
  SWF_UNIT_HP_BAR_SOURCE_OFFSET,
  getUnitHpFillWidth,
} from "./battleUnitUiAssets";

interface UnitHpBarObjects {
  empty: Phaser.GameObjects.Image;
  fill: Phaser.GameObjects.Image;
}

export class UnitHpBarRenderer {
  private readonly bars = new Map<string, UnitHpBarObjects>();

  constructor(private readonly scene: Phaser.Scene) {
    for (const key of [BATTLE_UNIT_UI_TEXTURES.hpBarEmpty, BATTLE_UNIT_UI_TEXTURES.hpBarFull]) {
      if (scene.textures.exists(key)) scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
  }

  private createBar(): UnitHpBarObjects {
    const configure = (image: Phaser.GameObjects.Image, tint: number) => image
      .setOrigin(0)
      // The extracted PNGs are Sprite667-local masks. Sprite2455 places the
      // movie clip h with an additional 0.46666x horizontal transform and a
      // fixed CXFORM. setTintFill reproduces the resulting solid SWF colors.
      .setTintFill(tint)
      .setScale(
        BATTLEFIELD_SOURCE_TO_WORLD.scaleX * SWF_UNIT_HP_BAR_LOCAL_SCALE.x,
        BATTLEFIELD_SOURCE_TO_WORLD.scaleY * SWF_UNIT_HP_BAR_LOCAL_SCALE.y,
      )
      .setDepth(2);
    return {
      empty: configure(this.scene.add.image(0, 0, BATTLE_UNIT_UI_TEXTURES.hpBarEmpty), SWF_UNIT_HP_BAR_COLORS.empty),
      fill: configure(this.scene.add.image(0, 0, BATTLE_UNIT_UI_TEXTURES.hpBarFull), SWF_UNIT_HP_BAR_COLORS.fill),
    };
  }

  update(soldiers: readonly Soldier[]): void {
    const liveIds = new Set<string>();
    for (const soldier of soldiers) {
      liveIds.add(soldier.id);
      let bar = this.bars.get(soldier.id);
      if (!bar) {
        bar = this.createBar();
        this.bars.set(soldier.id, bar);
      }
      const visible = !soldier.isDead;
      const x = soldier.x + battlefieldSourceDistanceToWorldX(SWF_UNIT_HP_BAR_SOURCE_OFFSET.x);
      const y = soldier.y + battlefieldSourceDistanceToWorldY(SWF_UNIT_HP_BAR_SOURCE_OFFSET.y);
      const fillWidth = getUnitHpFillWidth(soldier.hpBarHp, soldier.maxHp);
      bar.empty.setVisible(visible).setPosition(x, y);
      bar.fill
        .setVisible(visible && fillWidth > 0)
        .setPosition(x, y)
        .setCrop(0, 0, fillWidth, UNIT_HP_BAR_SIZE.height);
    }
    for (const [id, bar] of this.bars) {
      if (liveIds.has(id)) continue;
      bar.empty.destroy();
      bar.fill.destroy();
      this.bars.delete(id);
    }
  }

  destroy(): void {
    for (const bar of this.bars.values()) {
      bar.empty.destroy();
      bar.fill.destroy();
    }
    this.bars.clear();
  }
}
