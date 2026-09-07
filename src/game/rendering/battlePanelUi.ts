import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import type { BattleBase, BattleResult, Soldier, Team } from "../types";
import {
  BATTLE_PANEL_STAGE_SIZE,
  BATTLE_PANEL_PRELOAD_ATLASES,
  getBattlePanelDynamicField,
  getBattlePanelLayout,
  requireBattlePanelAsset,
} from "./battlePanelAssets";
import {
  buildBattlePanelViewModel,
  collectBattleUiSnapshot,
  diffBattleUiSnapshots,
  type BattlePanelViewModel,
  type BattleUiSnapshot,
  type CharacterStatusView,
} from "./battlePanelModel";
import {
  BattleEventNoticeController,
  BattleUiTimelinePlayer,
  getBattleEventNoticeFrameState,
  getControlsPromptAlpha,
  getKaltModeAlpha,
  getKaltRulesAlpha,
  getUwdPanelY,
  type BattleEventNoticeSide,
} from "./battleUiTimeline";
import {
  BATTLE_UNIT_UI_TEXTURES,
  TECHNIQUE_GAUGE_SIZE,
  getTechniqueGaugeFillWidth,
} from "./battleUnitUiAssets";
import {
  BATTLE_BALANCE_GAUGE_ASSET,
  configureBattleBalanceGaugeTexture,
} from "./battleBalanceGauge";
import {
  BALANCE_GAUGE_INITIAL_FRAME,
  SWF_BATTLE_FPS,
  calculateBattleSituation,
  formatBattleTime,
  getBattleBalanceTargetFrame,
  smoothBattleBalanceFrame,
  type BattleEndReason,
} from "../systems/battleOutcomeSystem";

export const BATTLE_PANEL_UI_CONFIG = {
  stageScale: GAME_HEIGHT / BATTLE_PANEL_STAGE_SIZE.height,
  depth: 20,
} as const;

type UiTextKey =
  | "mb"
  | "mm"
  | "em"
  | "eb"
  | "tm"
  | "mnm"
  | "mhp"
  | "mpw"
  | "mdf"
  | "tnm"
  | "thp"
  | "tpw"
  | "tdf"
  | "tmp"
  | "ts";
type UwdMessageState = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
type ProgressState = "rules" | "mode" | "counter" | null;

interface EventNoticeLane {
  side: BattleEventNoticeSide;
  band: Phaser.GameObjects.Image;
  bandFlash: Phaser.GameObjects.Image;
  icon: Phaser.GameObjects.Image;
  iconFlash: Phaser.GameObjects.Image;
  text: Phaser.GameObjects.Text;
  controller: BattleEventNoticeController;
}

const UWD_MESSAGE_ASSETS: Readonly<Partial<Record<UwdMessageState, string>>> = {
  2: "battle_messages.warnings.enemy_base_attack_blocked",
  3: "battle_messages.warnings.low_allies_retreat_warning",
  4: "battle_messages.warnings.retreat_warning",
  5: "battle_messages.exit_confirmation.exit_confirmation_text",
  6: "battle_messages.battle_end.player_base_fallen",
  7: "battle_messages.battle_end.enemy_base_fallen",
  8: "battle_messages.battle_end.advantage_victory",
};

function layoutPosition(id: string): { x: number; y: number } {
  const layout = getBattlePanelLayout(id);
  if (!layout || layout.x === undefined || layout.y === undefined)
    throw new Error(`Missing panel layout: ${id}`);
  return { x: layout.x, y: layout.y };
}

function registerBattlePanelAtlasFrames(scene: Phaser.Scene): void {
  for (const atlas of BATTLE_PANEL_PRELOAD_ATLASES) {
    if (!scene.textures.exists(atlas.key)) continue;
    const texture = scene.textures.get(atlas.key);
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    for (const [frameKey, definition] of Object.entries(atlas.frames)) {
      if (texture.has(frameKey)) continue;
      const frame = definition.frame;
      texture.add(frameKey, 0, frame.x, frame.y, frame.w, frame.h);
    }
  }
}

export class BattlePanelUi {
  private readonly root: Phaser.GameObjects.Container;
  private readonly text = new Map<UiTextKey, Phaser.GameObjects.Text>();
  private readonly allegianceIcon: Phaser.GameObjects.Image;
  private readonly techniqueGaugeFill: Phaser.GameObjects.Image;
  private readonly balanceGauge: Phaser.GameObjects.Sprite;
  private readonly playerNotice: EventNoticeLane;
  private readonly enemyNotice: EventNoticeLane;
  private readonly uwdTimeline = new BattleUiTimelinePlayer();
  private readonly promptTimeline = new BattleUiTimelinePlayer();
  private readonly uwdContainer: Phaser.GameObjects.Container;
  private readonly uwdBackground: Phaser.GameObjects.Image;
  private readonly uwdMessage: Phaser.GameObjects.Image;
  private readonly controlsHelp: Phaser.GameObjects.Image;
  private readonly controlsPrompt: Phaser.GameObjects.Container;
  private readonly exitButton: Phaser.GameObjects.Image;
  private readonly yesButton: Phaser.GameObjects.Image;
  private readonly noButton: Phaser.GameObjects.Image;
  private readonly progressTimeline = new BattleUiTimelinePlayer();
  private readonly progressContainer: Phaser.GameObjects.Container;
  private readonly progressImage: Phaser.GameObjects.Image;
  private readonly progressText: Phaser.GameObjects.Text;
  private previousSnapshot: BattleUiSnapshot | null = null;
  private shownResult: BattleResult = null;
  private uwdState: UwdMessageState = 1;
  private progressState: ProgressState = "rules";
  private pointerOverControl = false;
  private balanceGaugeFrame = BALANCE_GAUGE_INITIAL_FRAME;
  private balanceGaugeUpdatedAt: number;
  private readonly onEscape = (): void => {
    if (this.uwdState === 5) this.closeExitConfirmation(this.scene.time.now);
    else this.openExitConfirmation(this.scene.time.now);
  };
  private readonly onEnter: () => void;

  constructor(
    private readonly scene: Phaser.Scene,
    startedAt: number,
    private readonly onExit?: () => void,
  ) {
    registerBattlePanelAtlasFrames(scene);
    configureBattleBalanceGaugeTexture(scene);
    this.balanceGaugeUpdatedAt = startedAt;
    this.root = scene.add
      .container(0, 0)
      .setScrollFactor(0)
      .setDepth(BATTLE_PANEL_UI_CONFIG.depth);

    this.root.add(
      this.imageAtLayout(
        "battle_balance",
        "top_hud.battle_balance.battle_balance_strip",
      ),
    );
    this.balanceGauge = scene.add
      .sprite(
        BATTLE_BALANCE_GAUGE_ASSET.x,
        BATTLE_BALANCE_GAUGE_ASSET.y,
        BATTLE_BALANCE_GAUGE_ASSET.key,
        BALANCE_GAUGE_INITIAL_FRAME - 1,
      )
      .setOrigin(0);
    this.root.add(this.balanceGauge);
    this.root.add(this.imageAtLayout("timer", "top_hud.timer.timer_panel"));
    for (const variable of ["mb", "mm", "em", "eb", "tm"] as const)
      this.addField(variable, "top_hud");

    this.playerNotice = this.createEventNoticeLane("player");
    this.enemyNotice = this.createEventNoticeLane("enemy");

    const bottomPanelPosition = layoutPosition("bottom_character_status");
    this.root.add(
      scene.add
        .image(
          bottomPanelPosition.x,
          bottomPanelPosition.y,
          BATTLE_UNIT_UI_TEXTURES.bottomPanel,
        )
        .setOrigin(0),
    );
    this.techniqueGaugeFill = scene.add
      .image(21, 366, BATTLE_UNIT_UI_TEXTURES.techniqueGaugeFill)
      .setOrigin(0);
    this.root.add(this.techniqueGaugeFill);
    const selectorPosition = layoutPosition("allegiance_selector");
    this.allegianceIcon = this.image(
      "bottom_character_status.allegiance_selector.friendly_icon",
      selectorPosition.x,
      selectorPosition.y,
    );
    this.root.add(this.allegianceIcon);
    for (const variable of [
      "mnm",
      "mhp",
      "mpw",
      "mdf",
      "tnm",
      "thp",
      "tpw",
      "tdf",
      "tmp",
      "ts",
    ] as const)
      this.addField(variable, "bottom_character_status");

    this.uwdContainer = scene.add.container(-2, 380).setVisible(false);
    this.uwdBackground = this.image(
      "battle_messages.warnings.message_background",
      0,
      0,
    ).setVisible(false);
    this.controlsHelp = this.image(
      "battle_messages.controls.controls_help",
      0,
      0,
    ).setVisible(false);
    this.uwdMessage = this.image(
      "battle_messages.warnings.retreat_warning",
      0,
      8,
    ).setVisible(false);
    this.yesButton = this.modalButton(
      "battle_messages.exit_confirmation.yes_normal",
      "battle_messages.exit_confirmation.yes_hover",
      203,
      10,
      () => this.confirmExit(),
    );
    this.noButton = this.modalButton(
      "battle_messages.exit_confirmation.no_normal",
      "battle_messages.exit_confirmation.no_hover",
      271,
      10,
      () => this.closeExitConfirmation(this.scene.time.now),
    );
    this.uwdContainer.add([
      this.uwdBackground,
      this.controlsHelp,
      this.uwdMessage,
      this.yesButton,
      this.noButton,
    ]);
    this.root.add(this.uwdContainer);

    this.controlsPrompt = scene.add.container(150, 105).setVisible(false);
    this.controlsPrompt.add([
      this.image("battle_messages.controls.player_marker", 0, 0),
      this.image("battle_messages.controls.skill_click_prompt", 48, 1),
    ]);
    this.root.add(this.controlsPrompt);

    const exitPosition = layoutPosition("exit_button");
    this.exitButton = this.image(
      "screen_controls.exit_button.exit_button_normal",
      exitPosition.x,
      exitPosition.y,
    ).setInteractive({ useHandCursor: true });
    this.exitButton.on("pointerover", () => {
      this.pointerOverControl = true;
      this.setLogicalFrame(
        this.exitButton,
        "screen_controls.exit_button.exit_button_hover",
      );
    });
    this.exitButton.on("pointerout", () => {
      this.pointerOverControl = false;
      this.setLogicalFrame(
        this.exitButton,
        "screen_controls.exit_button.exit_button_normal",
      );
    });
    this.exitButton.on("pointerdown", () =>
      this.openExitConfirmation(this.scene.time.now),
    );
    this.root.add(this.exitButton);

    this.progressContainer = scene.add.container(11, 4).setVisible(false);
    this.progressImage = this.image(
      "battle_progress.rules.no_enemy_base_attack_warning",
      0,
      0,
    );
    this.progressText = scene.add.text(11, 6, "", {
      fontFamily: "monospace",
      fontSize: "8px",
      fontStyle: "bold",
      color: "#ffffff",
      stroke: "#24180f",
      strokeThickness: 2,
    });
    this.progressContainer.add([this.progressImage, this.progressText]);
    this.root.add(this.progressContainer);

    // root frame13 starts kalt; root frame14 starts the first uwd message sequence.
    this.progressTimeline.playOnce(startedAt, 1, 165, 166);
    this.uwdTimeline.playOnce(startedAt, 2, 108, 1);
    this.promptTimeline.playOnce(startedAt, 1, 85, 1);
    this.onEnter = () => {
      if (this.uwdState === 5) this.confirmExit();
    };
    scene.input.keyboard?.on("keydown-ESC", this.onEscape);
    scene.input.keyboard?.on("keydown-ENTER", this.onEnter);
    this.renderTimelines(startedAt);
    this.updateViewport(scene.cameras.main);
  }

  private image(
    logicalId: string,
    x: number,
    y: number,
  ): Phaser.GameObjects.Image {
    const asset = requireBattlePanelAsset(logicalId);
    return this.scene.add
      .image(x, y, asset.textureKey, asset.frameKey)
      .setOrigin(0);
  }

  private imageAtLayout(
    layoutId: string,
    logicalId: string,
  ): Phaser.GameObjects.Image {
    const position = layoutPosition(layoutId);
    return this.image(logicalId, position.x, position.y);
  }

  private setLogicalFrame(
    image: Phaser.GameObjects.Image,
    logicalId: string,
  ): void {
    const asset = requireBattlePanelAsset(logicalId);
    image.setTexture(asset.textureKey, asset.frameKey);
  }

  private modalButton(
    normalId: string,
    hoverId: string,
    x: number,
    y: number,
    onClick: () => void,
  ): Phaser.GameObjects.Image {
    const button = this.image(normalId, x, y).setInteractive({
      useHandCursor: true,
    });
    button.on("pointerover", () => {
      this.pointerOverControl = true;
      this.setLogicalFrame(button, hoverId);
    });
    button.on("pointerout", () => {
      this.pointerOverControl = false;
      this.setLogicalFrame(button, normalId);
    });
    button.on("pointerdown", onClick);
    return button;
  }

  private createEventNoticeLane(side: BattleEventNoticeSide): EventNoticeLane {
    const player = side === "player";
    const bandId = player
      ? "top_hud.player_force.player_force_gauge"
      : "top_hud.enemy_force.enemy_force_gauge";
    const iconId = player
      ? "top_hud.player_force.alert_icon"
      : "top_hud.enemy_force.alert_icon";
    const band = this.image(bandId, 0, 30).setVisible(false);
    const bandFlash = this.image(bandId, 0, 30)
      .setTintFill(0xffffff)
      .setVisible(false);
    const icon = this.image(iconId, 0, 33).setVisible(false);
    const iconFlash = this.image(iconId, 0, 33)
      .setTintFill(0xffffff)
      .setVisible(false);
    const text = this.scene.add
      .text(player ? 23 : 197, 37, "", {
        fontFamily: '"MS Mincho", "Yu Mincho", serif',
        fontSize: "11px",
        color: "#ffffff",
        fixedWidth: 167,
        fixedHeight: 15,
        align: player ? "center" : "left",
      })
      .setOrigin(0)
      .setVisible(false);
    this.root.add([band, bandFlash, icon, iconFlash, text]);
    return {
      side,
      band,
      bandFlash,
      icon,
      iconFlash,
      text,
      controller: new BattleEventNoticeController(),
    };
  }

  private triggerEventNotice(side: Team, message: string, now: number): void {
    const lane = side === "player" ? this.playerNotice : this.enemyNotice;
    if (!lane.controller.trigger(message, now)) return;
    lane.text.setText(message);
  }

  private renderEventNotice(lane: EventNoticeLane, now: number): void {
    const state = getBattleEventNoticeFrameState(
      lane.side,
      lane.controller.timeline.currentFrame(now),
    );
    lane.band.setVisible(state.visible).setPosition(state.bandX, 30);
    lane.bandFlash
      .setVisible(state.visible && state.bandWhiteOverlayAlpha > 0)
      .setPosition(state.bandX, 30)
      .setAlpha(state.bandWhiteOverlayAlpha);
    lane.icon.setVisible(state.iconVisible).setPosition(state.iconX, 33);
    lane.iconFlash
      .setVisible(state.iconVisible && state.iconWhiteOverlayAlpha > 0)
      .setPosition(state.iconX, 33)
      .setAlpha(state.iconWhiteOverlayAlpha);
    lane.text.setVisible(state.textVisible);
  }

  private showTemporaryMessage(state: 2 | 3 | 4, now: number): void {
    if (this.shownResult || this.uwdState === 5) return;
    this.uwdState = state;
    this.promptTimeline.stopAt(1);
    this.uwdTimeline.playOnce(now, 2, 108, 1);
  }

  private openExitConfirmation(now: number): void {
    if (this.shownResult || this.uwdState === 5) return;
    this.uwdState = 5;
    this.promptTimeline.stopAt(1);
    this.uwdTimeline.playUntilStop(now, 2, 13);
  }

  private closeExitConfirmation(now: number): void {
    if (this.uwdState !== 5) return;
    this.uwdTimeline.playOnce(now, 98, 108, 1);
  }

  private confirmExit(): void {
    if (this.uwdState !== 5 || this.uwdTimeline.isPlaying || !this.onExit)
      return;
    this.onExit();
  }

  private renderUwd(now: number): void {
    const frame = this.uwdTimeline.currentFrame(now);
    const panelY = getUwdPanelY(frame);
    const panelVisible = panelY !== null;
    this.uwdContainer.setVisible(panelVisible);
    if (panelY !== null) this.uwdContainer.setY(panelY);
    this.exitButton.setVisible(
      !this.shownResult && (frame === 1 || frame >= 98),
    );

    const initial = this.uwdState === 1;
    this.controlsHelp.setVisible(panelVisible && initial);
    this.uwdBackground.setVisible(panelVisible && !initial);
    this.yesButton.setVisible(panelVisible && this.uwdState === 5);
    this.noButton.setVisible(panelVisible && this.uwdState === 5);
    const assetId = UWD_MESSAGE_ASSETS[this.uwdState];
    this.uwdMessage.setVisible(panelVisible && Boolean(assetId));
    if (assetId) {
      this.setLogicalFrame(this.uwdMessage, assetId);
      const asset = requireBattlePanelAsset(assetId);
      this.uwdMessage.setPosition((382 - asset.width) / 2, 8);
    }

    const promptAlpha = initial
      ? getControlsPromptAlpha(this.promptTimeline.currentFrame(now))
      : 0;
    this.controlsPrompt.setVisible(promptAlpha > 0).setAlpha(promptAlpha);
    if (frame === 1 && !this.uwdTimeline.isPlaying && this.uwdState !== 1)
      this.uwdState = 1;
  }

  private renderProgress(now: number): void {
    const frame = this.progressTimeline.currentFrame(now);
    const alpha =
      this.progressState === "rules"
        ? getKaltRulesAlpha(frame)
        : this.progressState === "mode"
          ? getKaltModeAlpha(frame)
          : this.progressState === "counter"
            ? 1
            : null;
    this.progressContainer.setVisible(alpha !== null).setAlpha(alpha ?? 0);
    if (alpha === null && !this.progressTimeline.isPlaying)
      this.progressState = null;
  }

  private renderTimelines(now: number): void {
    this.renderEventNotice(this.playerNotice, now);
    this.renderEventNotice(this.enemyNotice, now);
    this.renderUwd(now);
    this.renderProgress(now);
  }

  blocksBattleInput(): boolean {
    return this.pointerOverControl || this.uwdState === 5;
  }

  showWarningState(state: 2 | 3 | 4): void {
    this.showTemporaryMessage(state, this.scene.time.now);
  }

  showProgress(logicalId: string, value?: number): void {
    this.setLogicalFrame(this.progressImage, logicalId);
    this.progressText.setText(value === undefined ? "" : String(value));
    if (logicalId === "battle_progress.rules.no_enemy_base_attack_warning") {
      this.progressState = "rules";
      this.progressImage.setPosition(0, 0);
      this.progressTimeline.playOnce(this.scene.time.now, 1, 165, 166);
    } else if (logicalId.startsWith("battle_progress.mode_notice.")) {
      this.progressState = "mode";
      this.progressImage.setPosition(0, 27);
      this.progressTimeline.playOnce(this.scene.time.now, 167, 243, 244);
    } else {
      this.progressState = "counter";
      const growth = logicalId.endsWith("growth_remaining_panel");
      this.progressImage.setPosition(-13, growth ? -6.4 : -6);
      this.progressText.setPosition(growth ? 85 : 8, growth ? -0.4 : 0);
      this.progressTimeline.stopAt(growth ? 249 : 246);
    }
  }

  hideProgress(): void {
    this.progressState = null;
    this.progressContainer.setVisible(false);
  }

  private addField(variable: UiTextKey, area: string): void {
    const field = getBattlePanelDynamicField(variable, area);
    if (!field) throw new Error(`Missing dynamic field ${area}.${variable}`);
    const text = this.scene.add
      .text(field.x, field.y, "", {
        fontFamily: '"MS Mincho", "Yu Mincho", serif',
        fontSize: "12px",
        align: variable === "tm" ? "right" : "left",
        color: "#ffffff",
        stroke: "#20160d",
        strokeThickness: 1,
      })
      .setOrigin(0);
    if (variable === "tm") text.setFixedSize(31, 15);
    this.text.set(variable, text);
    this.root.add(text);
  }

  private setField(variable: UiTextKey, value: string | number): void {
    this.text.get(variable)?.setText(String(value));
  }

  private updateStatus(
    left: CharacterStatusView | null,
    right: CharacterStatusView | null,
  ): void {
    this.setField("mnm", left?.name ?? "--");
    this.setField("mhp", left?.hp ?? "0/0");
    this.setField("mpw", left?.power ?? 0);
    this.setField("mdf", left?.defense ?? 0);
    this.setField("tnm", right?.name ?? "--");
    this.setField("thp", right?.hp ?? "0/0");
    this.setField("tpw", right?.power ?? 0);
    this.setField("tdf", right?.defense ?? 0);
    this.setField("tmp", right?.skill ?? 0);
    this.setField("ts", right?.foot ?? 0);
    this.allegianceIcon.setVisible(Boolean(right));
    if (right)
      this.setLogicalFrame(
        this.allegianceIcon,
        right.team === "enemy"
          ? "bottom_character_status.allegiance_selector.enemy_icon"
          : "bottom_character_status.allegiance_selector.friendly_icon",
      );
  }

  update(
    now: number,
    soldiers: readonly Soldier[],
    bases: readonly BattleBase[],
    left: Soldier | null | undefined,
    right: Soldier | null | undefined,
    remainingSeconds: number,
  ): void {
    const model: BattlePanelViewModel = buildBattlePanelViewModel(
      soldiers,
      bases,
      left,
      right,
    );
    this.setField("mb", model.playerBaseHp);
    this.setField("mm", model.playerAlive);
    this.setField("em", model.enemyAlive);
    this.setField("eb", model.enemyBaseHp);
    this.setField("tm", formatBattleTime(remainingSeconds));
    const targetBalanceFrame = getBattleBalanceTargetFrame(
      calculateBattleSituation(soldiers, bases),
    );
    const frameDurationMs = 1_000 / SWF_BATTLE_FPS;
    const elapsedFrames = Math.floor(
      Math.max(0, now - this.balanceGaugeUpdatedAt) / frameDurationMs,
    );
    for (let frame = 0; frame < elapsedFrames; frame += 1) {
      this.balanceGaugeFrame = smoothBattleBalanceFrame(
        this.balanceGaugeFrame,
        targetBalanceFrame,
      );
    }
    if (elapsedFrames > 0) {
      this.balanceGaugeUpdatedAt += elapsedFrames * frameDurationMs;
      this.balanceGauge.setFrame(Math.round(this.balanceGaugeFrame) - 1);
    }
    this.updateStatus(model.leftStatus, model.rightStatus);
    const gaugeWidth = getTechniqueGaugeFillWidth(left?.playerTechniqueGauge ?? 0);
    this.techniqueGaugeFill
      .setVisible(Boolean(left) && gaugeWidth > 0)
      .setCrop(0, 0, gaugeWidth, TECHNIQUE_GAUGE_SIZE.height);

    const snapshot = collectBattleUiSnapshot(soldiers, bases);
    if (this.previousSnapshot) {
      for (const notification of diffBattleUiSnapshots(
        this.previousSnapshot,
        snapshot,
      )) {
        if (notification.kind === "event")
          this.triggerEventNotice(notification.side, notification.message, now);
        else this.showTemporaryMessage(notification.state, now);
      }
    }
    this.previousSnapshot = snapshot;
    this.renderTimelines(now);
  }

  showResult(
    result: Exclude<BattleResult, null>,
    bases: readonly BattleBase[],
    reason: BattleEndReason,
  ): void {
    if (this.shownResult) return;
    this.shownResult = result;
    const playerBase = bases.find((base) => base.team === "player");
    const enemyBase = bases.find((base) => base.team === "enemy");
    const terminalState: 6 | 7 | 8 | null =
      playerBase && playerBase.hp <= 0
        ? 6
        : enemyBase && enemyBase.hp <= 0
          ? 7
          : reason === "ADVANTAGE"
            ? 8
          : null;
    this.playerNotice.controller.timeline.stopAt(1);
    this.enemyNotice.controller.timeline.stopAt(1);
    this.promptTimeline.stopAt(1);
    if (terminalState) {
      this.uwdState = terminalState;
      this.uwdTimeline.stopAt(13);
    } else this.uwdTimeline.stopAt(1);
    this.renderTimelines(this.scene.time.now);
  }

  showAdvantageVictory(): void {
    if (this.shownResult) return;
    this.uwdState = 8;
    this.promptTimeline.stopAt(1);
    this.uwdTimeline.stopAt(13);
    this.renderTimelines(this.scene.time.now);
  }

  updateViewport(camera: Phaser.Cameras.Scene2D.Camera): void {
    const scale = BATTLE_PANEL_UI_CONFIG.stageScale / camera.zoom;
    const offsetX =
      (GAME_WIDTH -
        BATTLE_PANEL_STAGE_SIZE.width * BATTLE_PANEL_UI_CONFIG.stageScale) /
      2;
    this.root.setPosition(offsetX / camera.zoom, 0).setScale(scale);
  }

  destroy(): void {
    this.scene.input.keyboard?.off("keydown-ESC", this.onEscape);
    this.scene.input.keyboard?.off("keydown-ENTER", this.onEnter);
    this.root.destroy(true);
  }
}
