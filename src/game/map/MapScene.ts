import Phaser from "phaser";
import {
  createMapUiImage,
  preloadMapUiAtlases,
  registerMapUiAtlasFrames,
  requireMapUiAsset,
} from "./mapUiAssets";
import {
  DEFAULT_MAP_CELL_ID,
  MAP_CELLS,
  MAP_UI_MANIFEST,
  enterMapCell,
  entryTipYAtFrame,
  getMapCell,
  isAzuchiLocked,
  isMapCellMovable,
  leaveMapCell,
  levelUpTipAlphaAtFrame,
  markerAssetAtElapsed,
  toSelectedMapCell,
  trainingPanelYAtFrame,
  type MapCell,
  type MapHoverState,
} from "./mapUiModel";
import { OnceTransitionGuard, createBattleIntroData, frameAtElapsed } from "./mapTransitionState";
import { configureMapUiCamera, createAtlasButton, type AtlasButton } from "./mapUiRenderer";

export interface MapSceneData {
  currentCellId?: string;
  clearedCellIds?: string[];
  money?: number;
  totalRank?: number;
  totalProvisions?: number;
  showLevelUpTip?: boolean;
}

interface TrainingModalDisplay {
  panel: Phaser.GameObjects.Image;
  buttons: AtlasButton[];
  localButtonY: number[];
  openedAt: number;
}

const MAP_TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  color: "#ffffff",
  fontFamily: "sans-serif",
  fontSize: "8px",
  stroke: "#000000",
  strokeThickness: 1,
};

export class MapScene extends Phaser.Scene {
  private dataState: MapSceneData = {};
  private currentCell!: MapCell;
  private clearedCellIds = new Set<string>();
  private hoverState!: MapHoverState;
  private transitionGuard = new OnceTransitionGuard();
  private hoverIndicator!: Phaser.GameObjects.Image;
  private currentMarker!: Phaser.GameObjects.Image;
  private bottomLocation!: Phaser.GameObjects.Image;
  private bottomLevel!: Phaser.GameObjects.Image;
  private opponentText!: Phaser.GameObjects.Text;
  private descriptionText!: Phaser.GameObjects.Text;
  private warningImage: Phaser.GameObjects.Image | null = null;
  private warningTimer: Phaser.Time.TimerEvent | null = null;
  private entryTip: Phaser.GameObjects.Image | null = null;
  private levelUpTip: Phaser.GameObjects.Image | null = null;
  private trainingModal: TrainingModalDisplay | null = null;
  private startedAt = 0;

  constructor() {
    super("Map");
  }

  init(data?: MapSceneData): void {
    this.dataState = data ?? {};
    this.transitionGuard = new OnceTransitionGuard();
    this.clearedCellIds = new Set(this.dataState.clearedCellIds ?? []);
    this.currentCell = getMapCell(this.dataState.currentCellId ?? DEFAULT_MAP_CELL_ID)
      ?? getMapCell(DEFAULT_MAP_CELL_ID)!;
    this.hoverState = { hoveredCellId: null, infoCellId: this.currentCell.cell_id };
  }

  preload(): void {
    preloadMapUiAtlases(this);
  }

  create(): void {
    registerMapUiAtlasFrames(this);
    configureMapUiCamera(this);
    this.startedAt = this.time.now;

    createMapUiImage(this, "world_map_background", 0, 0).setDepth(0);
    this.createCells();
    this.createMapStateDecorations();
    this.createBottomUi();
    this.createNotices();
    this.updateBottomInfo(this.currentCell);
  }

  update(time: number): void {
    const elapsed = time - this.startedAt;
    this.updateCurrentMarker(elapsed);
    this.updateEntryTip(elapsed);
    this.updateLevelUpTip(elapsed);
    this.updateTrainingModal(time);
  }

  private createCells(): void {
    for (const cell of MAP_CELLS) {
      createMapUiImage(this, cell.icon, cell.stage_x, cell.stage_y).setDepth(10);
      const zone = this.add.zone(cell.hit_area.x, cell.hit_area.y, cell.hit_area.w, cell.hit_area.h)
        .setOrigin(0)
        .setDepth(60)
        .setInteractive({ useHandCursor: true });
      zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => this.handleCellEnter(cell));
      zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => this.handleCellLeave(cell));
      zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.handleCellPress(cell));
    }
  }

  private createMapStateDecorations(): void {
    for (const cell of MAP_CELLS) {
      if (this.clearedCellIds.has(cell.cell_id)) {
        const clearedAsset = cell.type === "enemy_castle"
          ? MAP_UI_MANIFEST.cell_states.cleared.enemy_castle
          : MAP_UI_MANIFEST.cell_states.cleared.regular;
        createMapUiImage(this, clearedAsset, cell.stage_x, cell.stage_y).setDepth(20);
      }
      if (isMapCellMovable(cell, this.currentCell)) {
        const movable = MAP_UI_MANIFEST.cell_states.movable;
        createMapUiImage(this, movable.asset, cell.stage_x + movable.local_x, cell.stage_y + movable.local_y)
          .setDepth(30);
      }
    }

    const marker = MAP_UI_MANIFEST.cell_states.current_marker;
    this.currentMarker = createMapUiImage(
      this,
      marker.frames[0],
      this.currentCell.stage_x + marker.local_x,
      this.currentCell.stage_y + marker.local_y,
    ).setDepth(40);

    this.hoverIndicator = createMapUiImage(this, MAP_UI_MANIFEST.cell_states.hover.bitmap, -100, -100)
      .setTintFill(0x80ffff)
      .setDepth(50);
  }

  private createBottomUi(): void {
    const bottom = MAP_UI_MANIFEST.bottom_ui;
    // The original lower clip sits above the map and prevents covered cell hit areas
    // from receiving input through its transparent/non-button regions.
    createMapUiImage(this, bottom.background, bottom.x, bottom.y).setDepth(100).setInteractive();
    this.bottomLocation = createMapUiImage(this, "location_label_blank", bottom.location_label.x, bottom.location_label.y)
      .setDepth(101);
    this.bottomLevel = createMapUiImage(this, "level_1", bottom.level.x, bottom.level.y).setDepth(101);

    this.opponentText = this.add.text(bottom.dynamic_block.x, bottom.dynamic_block.y, "", MAP_TEXT_STYLE)
      .setDepth(102)
      .setFixedSize(205, 10);
    this.descriptionText = this.add.text(bottom.dynamic_block.x, bottom.dynamic_block.y + 11, "", {
      ...MAP_TEXT_STYLE,
      fontSize: "7px",
    }).setDepth(102).setFixedSize(205, 19);

    this.add.text(bottom.money.x, bottom.money.y, String(this.dataState.money ?? 0), {
      ...MAP_TEXT_STYLE,
      fontSize: `${bottom.money.font_px}px`,
      align: "right",
    }).setOrigin(1, 0).setDepth(102);
    this.add.text(bottom.total_rank.x, bottom.total_rank.y, String(this.dataState.totalRank ?? 0), {
      ...MAP_TEXT_STYLE,
      fontSize: `${bottom.total_rank.font_px}px`,
      align: "right",
    }).setOrigin(1, 0).setDepth(102);

    for (const button of bottom.buttons) {
      const onPress = button.id === "formation"
        ? () => this.scene.start("Formation", { mapState: { ...this.dataState } })
        : undefined;
      createAtlasButton(this, button.x, button.y, button.normal, button.over_down, onPress).image.setDepth(103);
    }
  }

  private createNotices(): void {
    const entry = MAP_UI_MANIFEST.bottom_ui.entry_tip;
    this.entryTip = createMapUiImage(this, entry.asset, MAP_UI_MANIFEST.bottom_ui.x, MAP_UI_MANIFEST.bottom_ui.y)
      .setDepth(110);

    if (this.dataState.showLevelUpTip) {
      const asset = requireMapUiAsset(MAP_UI_MANIFEST.notices.level_up_tip.asset);
      this.levelUpTip = createMapUiImage(this, asset.logicalId, (380 - asset.width) / 2, 0).setDepth(90);
    }
  }

  private handleCellEnter(cell: MapCell): void {
    this.hoverState = enterMapCell(this.hoverState, cell.cell_id);
    this.updateBottomInfo(cell);
    if (!isMapCellMovable(cell, this.currentCell)) {
      this.hoverIndicator.setPosition(-100, -100);
      return;
    }
    const hover = MAP_UI_MANIFEST.cell_states.hover;
    const rootX = cell.grid_x * MAP_UI_MANIFEST.cell_grid.cell_pitch - 7;
    const rootY = cell.grid_y * MAP_UI_MANIFEST.cell_grid.cell_pitch - 7;
    this.hoverIndicator.setPosition(rootX + hover.bitmap_local.x, rootY + hover.bitmap_local.y);
  }

  private handleCellLeave(cell: MapCell): void {
    this.hoverState = leaveMapCell(this.hoverState, cell.cell_id);
    if (this.hoverState.hoveredCellId === null) this.hoverIndicator.setPosition(-100, -100);
  }

  private handleCellPress(cell: MapCell): void {
    this.handleCellEnter(cell);
    if (isAzuchiLocked(cell, this.clearedCellIds)) {
      this.showTimedWarning(
        MAP_UI_MANIFEST.notices.azuchi_locked.asset,
        MAP_UI_MANIFEST.notices.azuchi_locked.frames[1] - MAP_UI_MANIFEST.notices.azuchi_locked.frames[0] + 1,
      );
      return;
    }
    if (!isMapCellMovable(cell, this.currentCell)) {
      this.showTimedWarning(
        MAP_UI_MANIFEST.notices.move_rule.asset,
        MAP_UI_MANIFEST.notices.move_rule.frames[1] - MAP_UI_MANIFEST.notices.move_rule.frames[0] + 1,
      );
      return;
    }
    if (cell.cell_id === MAP_UI_MANIFEST.training_modal.trigger_cell) {
      this.openTrainingModal();
      return;
    }
    this.startBattleIntro(cell);
  }

  private updateBottomInfo(cell: MapCell): void {
    const location = requireMapUiAsset(cell.bottom_label);
    this.bottomLocation.setTexture(location.textureKey, location.frameKey);
    const levelAsset = cell.hover.level >= 10 ? "level_special" : `level_${cell.hover.level}`;
    const level = requireMapUiAsset(levelAsset);
    this.bottomLevel.setTexture(level.textureKey, level.frameKey);
    this.opponentText.setText(`${cell.hover.opponent_army}　${cell.hover.leader}`);
    this.descriptionText.setText(cell.description);
  }

  private showTimedWarning(assetId: string, frames: number): void {
    this.warningTimer?.remove(false);
    this.warningImage?.destroy();
    const asset = requireMapUiAsset(assetId);
    this.warningImage = createMapUiImage(this, assetId, (380 - asset.width) / 2, (380 - asset.height) / 2)
      .setDepth(140);
    this.warningTimer = this.time.delayedCall(frames / MAP_UI_MANIFEST.coordinate_space.fps * 1_000, () => {
      this.warningImage?.destroy();
      this.warningImage = null;
      this.warningTimer = null;
    });
  }

  private openTrainingModal(): void {
    if (this.trainingModal) return;
    const modal = MAP_UI_MANIFEST.training_modal;
    const panel = createMapUiImage(this, modal.panel, modal.x, modal.y + modal.panel_y[0])
      .setDepth(150)
      .setInteractive();
    const cell = getMapCell(modal.trigger_cell)!;
    const definitions: Array<[string, string, number, (() => void) | undefined]> = [
      ["training_raise_normal", "training_raise_over_down", 139, undefined],
      ["training_challenge_normal", "training_challenge_over_down", 263, () => this.startBattleIntro(cell)],
      ["training_cancel_normal", "training_cancel_over_down", 313, () => this.closeTrainingModal()],
    ];
    const buttons = definitions.map(([normal, active, localY, action]) => {
      const button = createAtlasButton(this, modal.x + 96, panel.y + localY, normal, active, action);
      button.image.setDepth(151);
      return button;
    });
    this.trainingModal = {
      panel,
      buttons,
      localButtonY: definitions.map((definition) => definition[2]),
      openedAt: this.time.now,
    };
  }

  private closeTrainingModal(): void {
    if (!this.trainingModal) return;
    this.trainingModal.panel.destroy();
    for (const button of this.trainingModal.buttons) button.image.destroy();
    this.trainingModal = null;
  }

  private startBattleIntro(cell: MapCell): void {
    this.transitionGuard.run(() => this.scene.start("BattleIntro", createBattleIntroData(toSelectedMapCell(cell))));
  }

  private updateCurrentMarker(elapsedMs: number): void {
    const asset = requireMapUiAsset(markerAssetAtElapsed(elapsedMs));
    if (this.currentMarker.frame.name !== asset.frameKey) {
      this.currentMarker.setTexture(asset.textureKey, asset.frameKey);
    }
  }

  private updateEntryTip(elapsedMs: number): void {
    if (!this.entryTip) return;
    const yOffset = entryTipYAtFrame(frameAtElapsed(elapsedMs));
    if (yOffset === null) {
      this.entryTip.destroy();
      this.entryTip = null;
      return;
    }
    this.entryTip.y = MAP_UI_MANIFEST.bottom_ui.y + yOffset;
  }

  private updateLevelUpTip(elapsedMs: number): void {
    if (!this.levelUpTip) return;
    const alpha = levelUpTipAlphaAtFrame(frameAtElapsed(elapsedMs));
    if (alpha === null) {
      this.levelUpTip.destroy();
      this.levelUpTip = null;
      return;
    }
    this.levelUpTip.setAlpha(alpha);
  }

  private updateTrainingModal(time: number): void {
    if (!this.trainingModal) return;
    const frame = frameAtElapsed(time - this.trainingModal.openedAt, 2);
    const panelY = trainingPanelYAtFrame(frame);
    this.trainingModal.panel.y = panelY;
    for (let index = 0; index < this.trainingModal.buttons.length; index += 1) {
      this.trainingModal.buttons[index].image.y = panelY + this.trainingModal.localButtonY[index];
    }
  }
}
