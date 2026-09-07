import Phaser from "phaser";
import { GAME_WIDTH } from "../config";
import { MAP_UI_LOGICAL_SIZE } from "../map/mapUiRenderer";
import { getBattleEndCurtainState } from "../systems/battleTransitionSystem";
import { BATTLE_PANEL_UI_CONFIG } from "./battlePanelUi";

/** Vector/mask reconstruction of Sprite2531's `maku` frames 97..160. */
export class BattleEndCurtainOverlay {
  private readonly root: Phaser.GameObjects.Container;
  private readonly top: Phaser.GameObjects.Rectangle;
  private readonly bottom: Phaser.GameObjects.Rectangle;

  constructor(private readonly scene: Phaser.Scene) {
    this.root = scene.add
      .container(0, 0)
      .setScrollFactor(0)
      .setDepth(BATTLE_PANEL_UI_CONFIG.depth + 30);
    this.top = scene.add
      .rectangle(0, 0, MAP_UI_LOGICAL_SIZE, 0, 0x000000)
      .setOrigin(0, 0);
    this.bottom = scene.add
      .rectangle(0, MAP_UI_LOGICAL_SIZE, MAP_UI_LOGICAL_SIZE, 0, 0x000000)
      .setOrigin(0, 1);
    this.root.add([this.top, this.bottom]);
  }

  update(elapsedMs: number, camera: Phaser.Cameras.Scene2D.Camera): boolean {
    const state = getBattleEndCurtainState(elapsedMs);
    const height = MAP_UI_LOGICAL_SIZE * 0.5 * state.closeProgress;
    this.top.setVisible(state.visible).setSize(MAP_UI_LOGICAL_SIZE, height);
    this.bottom
      .setVisible(state.visible)
      .setSize(MAP_UI_LOGICAL_SIZE, height);
    const stageScale = BATTLE_PANEL_UI_CONFIG.stageScale;
    const offsetX = (GAME_WIDTH - MAP_UI_LOGICAL_SIZE * stageScale) / 2;
    this.root
      .setPosition(offsetX / camera.zoom, 0)
      .setScale(stageScale / camera.zoom);
    return state.complete;
  }

  destroy(): void {
    this.root.destroy(true);
  }
}
