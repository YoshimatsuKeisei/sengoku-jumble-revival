import Phaser from "phaser";
import {
  BATTLE_INTRO_TIMELINE,
  getBattleIntroFrameState,
  getSilhouettesAtFrame,
} from "../map/battleIntroModel";
import {
  createMapUiImage,
  requireMapUiAsset,
} from "../map/mapUiAssets";
import { getMapCell } from "../map/mapUiModel";
import type { SelectedMapCell } from "../map/mapTransitionState";
import { MAP_UI_LOGICAL_SIZE } from "../map/mapUiRenderer";
import { BATTLE_PANEL_UI_CONFIG } from "./battlePanelUi";
import { GAME_WIDTH } from "../config";

const SILHOUETTE_DEPTHS = [3, 5, 7, 9] as const;

export class BattleIntroOverlay {
  private readonly root: Phaser.GameObjects.Container;
  private readonly background: Phaser.GameObjects.Image;
  private readonly vsGlow: Phaser.GameObjects.Image;
  private readonly vsMain: Phaser.GameObjects.Image;
  private readonly controlStrip: Phaser.GameObjects.Image;
  private readonly playerTeamText: Phaser.GameObjects.Text;
  private readonly enemyTeamText: Phaser.GameObjects.Text;
  private readonly openingMask: Phaser.GameObjects.Rectangle;
  private readonly closingMask: Phaser.GameObjects.Rectangle;
  private readonly topCloseMask: Phaser.GameObjects.Rectangle;
  private readonly bottomCloseMask: Phaser.GameObjects.Rectangle;
  private readonly silhouettes = new Map<number, Phaser.GameObjects.Image>();

  constructor(
    private readonly scene: Phaser.Scene,
    selectedMapCell: SelectedMapCell,
  ) {
    this.root = scene.add
      .container(0, 0)
      .setScrollFactor(0)
      .setDepth(BATTLE_PANEL_UI_CONFIG.depth + 20);
    this.background = createMapUiImage(scene, "intro_background", 0, 0);
    this.root.add(this.background);
    for (const depth of SILHOUETTE_DEPTHS) {
      const image = createMapUiImage(scene, "silhouette_spear", 0, 0)
        .setVisible(false);
      this.silhouettes.set(depth, image);
      this.root.add(image);
    }
    const glow = requireMapUiAsset("vs_glow");
    const main = requireMapUiAsset("vs_main");
    this.vsGlow = createMapUiImage(
      scene,
      glow.logicalId,
      (MAP_UI_LOGICAL_SIZE - glow.width) / 2,
      (MAP_UI_LOGICAL_SIZE - glow.height) / 2,
    ).setVisible(false);
    this.vsMain = createMapUiImage(
      scene,
      main.logicalId,
      (MAP_UI_LOGICAL_SIZE - main.width) / 2,
      (MAP_UI_LOGICAL_SIZE - main.height) / 2,
    ).setVisible(false);
    this.root.add([this.vsGlow, this.vsMain]);

    const textConfig = BATTLE_INTRO_TIMELINE.team_text;
    const selectedCell = getMapCell(selectedMapCell.cellId);
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      color: textConfig.color,
      fontFamily: '"MS Mincho", "Yu Mincho", serif',
      fontSize: `${textConfig.font_size_px}px`,
      align: textConfig.alignment,
      stroke: "#000000",
      strokeThickness: 2,
    };
    this.playerTeamText = scene.add
      .text(textConfig.player.x, textConfig.player.y, "自軍団", style)
      .setFixedSize(textConfig.player.bounds.w, textConfig.player.bounds.h)
      .setVisible(false);
    this.enemyTeamText = scene.add
      .text(
        textConfig.enemy.x,
        textConfig.enemy.y,
        selectedCell?.hover.opponent_army ?? "敵軍団",
        style,
      )
      .setFixedSize(textConfig.enemy.bounds.w, textConfig.enemy.bounds.h)
      .setVisible(false);
    this.root.add([this.playerTeamText, this.enemyTeamText]);
    this.controlStrip = createMapUiImage(
      scene,
      "intro_control_strip",
      -2,
      340,
    ).setVisible(false);
    this.root.add(this.controlStrip);
    this.openingMask = scene.add
      .rectangle(
        MAP_UI_LOGICAL_SIZE,
        0,
        MAP_UI_LOGICAL_SIZE,
        MAP_UI_LOGICAL_SIZE,
        0x000000,
      )
      .setOrigin(1, 0);
    this.closingMask = scene.add
      .rectangle(0, 0, 0, MAP_UI_LOGICAL_SIZE, 0x000000)
      .setOrigin(0);
    this.topCloseMask = scene.add
      .rectangle(0, 0, MAP_UI_LOGICAL_SIZE, 0, 0x000000)
      .setOrigin(0);
    this.bottomCloseMask = scene.add
      .rectangle(
        0,
        MAP_UI_LOGICAL_SIZE,
        MAP_UI_LOGICAL_SIZE,
        0,
        0x000000,
      )
      .setOrigin(0, 1);
    this.root.add([
      this.openingMask,
      this.closingMask,
      this.topCloseMask,
      this.bottomCloseMask,
    ]);
  }

  update(elapsedMs: number, camera: Phaser.Cameras.Scene2D.Camera): void {
    const state = getBattleIntroFrameState(elapsedMs);
    this.background.setVisible(state.backgroundVisible);
    this.playerTeamText.setVisible(state.teamNamesVisible);
    this.enemyTeamText.setVisible(state.teamNamesVisible);
    this.vsGlow.setVisible(state.vsGlowVisible);
    this.vsMain.setVisible(state.vsMainVisible);
    this.controlStrip.setVisible(state.controlStripVisible);
    for (const image of this.silhouettes.values()) image.setVisible(false);
    for (const entry of getSilhouettesAtFrame(state.frame)) {
      const image = this.silhouettes.get(entry.depth);
      if (!image) continue;
      const asset = requireMapUiAsset(entry.asset);
      image
        .setTexture(asset.textureKey, asset.frameKey)
        .setPosition(entry.x, entry.y)
        .setAlpha(entry.alpha)
        .setVisible(entry.alpha > 0);
    }
    this.openingMask.width = MAP_UI_LOGICAL_SIZE * state.openingWipe;
    this.openingMask.setVisible(state.openingWipe > 0);
    this.closingMask.width = MAP_UI_LOGICAL_SIZE * state.closingWipe;
    this.closingMask.setVisible(state.closingWipe > 0);
    const closeHeight = MAP_UI_LOGICAL_SIZE * 0.5 * state.thinClose;
    this.topCloseMask.height = closeHeight;
    this.bottomCloseMask.height = closeHeight;
    this.topCloseMask.setVisible(state.thinClose > 0);
    this.bottomCloseMask.setVisible(state.thinClose > 0);
    this.updateViewport(camera);
  }

  private updateViewport(camera: Phaser.Cameras.Scene2D.Camera): void {
    const stageScale = BATTLE_PANEL_UI_CONFIG.stageScale;
    const offsetX = (GAME_WIDTH - MAP_UI_LOGICAL_SIZE * stageScale) / 2;
    this.root
      .setPosition(offsetX / camera.zoom, 0)
      .setScale(stageScale / camera.zoom);
  }

  destroy(): void {
    this.root.destroy(true);
  }
}
