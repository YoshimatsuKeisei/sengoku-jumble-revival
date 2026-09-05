import Phaser from "phaser";
import { getBattleIntroFrameState, getSilhouettesAtFrame, BATTLE_INTRO_TIMELINE } from "./battleIntroModel";
import { createMapUiImage, preloadMapUiAtlases, registerMapUiAtlasFrames, requireMapUiAsset } from "./mapUiAssets";
import { DEFAULT_MAP_CELL_ID, getMapCell, toSelectedMapCell } from "./mapUiModel";
import {
  BattleIntroTransition,
  createBattleSceneData,
  type BattleIntroSceneData,
} from "./mapTransitionState";
import { configureMapUiCamera, MAP_UI_LOGICAL_SIZE } from "./mapUiRenderer";

const SILHOUETTE_DEPTHS = [3, 5, 7, 9] as const;

export class BattleIntroScene extends Phaser.Scene {
  private introData!: BattleIntroSceneData;
  private transition = new BattleIntroTransition();
  private startedAt = 0;
  private background!: Phaser.GameObjects.Image;
  private vsGlow!: Phaser.GameObjects.Image;
  private vsMain!: Phaser.GameObjects.Image;
  private controlStrip!: Phaser.GameObjects.Image;
  private playerTeamText!: Phaser.GameObjects.Text;
  private enemyTeamText!: Phaser.GameObjects.Text;
  private openingMask!: Phaser.GameObjects.Rectangle;
  private closingMask!: Phaser.GameObjects.Rectangle;
  private topCloseMask!: Phaser.GameObjects.Rectangle;
  private bottomCloseMask!: Phaser.GameObjects.Rectangle;
  private silhouettes = new Map<number, Phaser.GameObjects.Image>();

  constructor() {
    super("BattleIntro");
  }

  init(data?: BattleIntroSceneData): void {
    const fallback = getMapCell(DEFAULT_MAP_CELL_ID)!;
    this.introData = data?.selectedMapCell
      ? { selectedMapCell: { ...data.selectedMapCell } }
      : { selectedMapCell: toSelectedMapCell(fallback) };
    this.transition = new BattleIntroTransition();
  }

  preload(): void {
    preloadMapUiAtlases(this);
  }

  create(): void {
    registerMapUiAtlasFrames(this);
    configureMapUiCamera(this);
    this.startedAt = this.time.now;

    this.background = createMapUiImage(this, "intro_background", 0, 0).setDepth(0);
    for (const depth of SILHOUETTE_DEPTHS) {
      this.silhouettes.set(depth, createMapUiImage(this, "silhouette_spear", 0, 0).setDepth(10 + depth).setVisible(false));
    }

    const glow = requireMapUiAsset("vs_glow");
    const main = requireMapUiAsset("vs_main");
    this.vsGlow = createMapUiImage(
      this,
      glow.logicalId,
      (MAP_UI_LOGICAL_SIZE - glow.width) / 2,
      (MAP_UI_LOGICAL_SIZE - glow.height) / 2,
    ).setDepth(30).setVisible(false);
    this.vsMain = createMapUiImage(
      this,
      main.logicalId,
      (MAP_UI_LOGICAL_SIZE - main.width) / 2,
      (MAP_UI_LOGICAL_SIZE - main.height) / 2,
    ).setDepth(31).setVisible(false);

    const textConfig = BATTLE_INTRO_TIMELINE.team_text;
    const selectedCell = getMapCell(this.introData.selectedMapCell.cellId);
    const textStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      color: textConfig.color,
      fontFamily: "sans-serif",
      fontSize: `${textConfig.font_size_px}px`,
      align: textConfig.alignment,
      stroke: "#000000",
      strokeThickness: 2,
    };
    this.playerTeamText = this.add.text(textConfig.player.x, textConfig.player.y, "自軍団", textStyle)
      .setFixedSize(textConfig.player.bounds.w, textConfig.player.bounds.h)
      .setDepth(32)
      .setVisible(false);
    this.enemyTeamText = this.add.text(
      textConfig.enemy.x,
      textConfig.enemy.y,
      selectedCell?.hover.opponent_army ?? "敵軍団",
      textStyle,
    ).setFixedSize(textConfig.enemy.bounds.w, textConfig.enemy.bounds.h)
      .setDepth(32)
      .setVisible(false);

    this.controlStrip = createMapUiImage(this, "intro_control_strip", -2, 340).setDepth(33).setVisible(false);
    this.openingMask = this.add.rectangle(MAP_UI_LOGICAL_SIZE, 0, MAP_UI_LOGICAL_SIZE, MAP_UI_LOGICAL_SIZE, 0x000000)
      .setOrigin(1, 0)
      .setDepth(80);
    this.closingMask = this.add.rectangle(0, 0, 0, MAP_UI_LOGICAL_SIZE, 0x000000)
      .setOrigin(0)
      .setDepth(81);
    this.topCloseMask = this.add.rectangle(0, 0, MAP_UI_LOGICAL_SIZE, 0, 0x000000)
      .setOrigin(0)
      .setDepth(82);
    this.bottomCloseMask = this.add.rectangle(0, MAP_UI_LOGICAL_SIZE, MAP_UI_LOGICAL_SIZE, 0, 0x000000)
      .setOrigin(0, 1)
      .setDepth(82);
  }

  update(time: number): void {
    const elapsed = time - this.startedAt;
    this.renderIntroFrame(elapsed);
    this.transition.update(elapsed, () => {
      this.scene.start("Battle", createBattleSceneData(this.introData));
    });
  }

  private renderIntroFrame(elapsedMs: number): void {
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
      image.setTexture(asset.textureKey, asset.frameKey)
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
  }
}
