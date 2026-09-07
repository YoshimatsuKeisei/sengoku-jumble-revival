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
  getUnitHpFillWidth,
} from "./battleUnitUiAssets";

interface UnitHpBarObjects {
  empty: Phaser.GameObjects.Image;
  fill: Phaser.GameObjects.Image;
}

const HP_BAR_SOURCE_OFFSET = { x: -6, y: -26 } as const;

export class UnitHpBarRenderer {
  private readonly bars = new Map<string, UnitHpBarObjects>();

  constructor(private readonly scene: Phaser.Scene) {
    for (const key of [BATTLE_UNIT_UI_TEXTURES.hpBarEmpty, BATTLE_UNIT_UI_TEXTURES.hpBarFull]) {
      if (scene.textures.exists(key)) scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
  }

  private createBar(): UnitHpBarObjects {
    const configure = (image: Phaser.GameObjects.Image) => image
      .setOrigin(0)
      .setScale(BATTLEFIELD_SOURCE_TO_WORLD.scaleX, BATTLEFIELD_SOURCE_TO_WORLD.scaleY)
      .setDepth(2);
    return {
      empty: configure(this.scene.add.image(0, 0, BATTLE_UNIT_UI_TEXTURES.hpBarEmpty)),
      fill: configure(this.scene.add.image(0, 0, BATTLE_UNIT_UI_TEXTURES.hpBarFull)),
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
      const x = soldier.x + battlefieldSourceDistanceToWorldX(HP_BAR_SOURCE_OFFSET.x);
      const y = soldier.y + battlefieldSourceDistanceToWorldY(HP_BAR_SOURCE_OFFSET.y);
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
