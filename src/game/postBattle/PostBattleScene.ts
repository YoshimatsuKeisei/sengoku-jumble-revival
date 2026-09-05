import Phaser from "phaser";
import uiManifestJson from "../../../assets/post_battle_ui/config/post_battle_ui_manifest.json";
import {
  CHARACTER_FRAME_HEIGHT,
  CHARACTER_FRAME_WIDTH,
  CHARACTER_SPRITESHEETS,
  getCharacterFrameIndex,
  getCharacterRenderConfig,
  getCharacterTextureKey,
  isSpriteUnitType,
} from "../rendering/characterSprite";
import { configureMapUiCamera } from "../map/mapUiRenderer";
import {
  createPostBattleImage,
  preloadPostBattleAtlas,
  registerPostBattleAtlasFrames,
  requirePostBattleAsset,
} from "./postBattleAssets";
import {
  clampPostBattleListScroll,
  getBattleResultRevealState,
  maxPostBattleListScroll,
  sortEnemyRows,
  sortMeritRows,
  type EnemySortKey,
  type MeritSortKey,
} from "./postBattleModel";
import {
  routeAfterBattleResult,
  routeAfterMeritList,
  type PostBattleScreen,
} from "./postBattleRoutePolicy";
import {
  displayPostBattleValue,
  type PostBattleSceneData,
  type PostBattleSnapshot,
  type PostBattleSoldierSnapshot,
} from "./postBattleState";
import {
  ENEMY_DETAIL_LAYOUT,
  resolveEnemyDetailActionSlots,
  resolveEnemyDetailSpecialSlots,
  resolveEnemyDetailTechnique,
  resolveEnemyDetailUnitType,
  type EnemyDetailTextPlacement,
} from "./enemyDetailMapping";

const ui = uiManifestJson;
const TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  color: "#ffffff",
  fontFamily: "sans-serif",
  fontSize: "9px",
  stroke: "#000000",
  strokeThickness: 1,
};
const ROW_STYLE = { ...TEXT_STYLE, fontSize: "8px" } as const;
const DETAIL_TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  color: "#cec0a9",
  fontFamily: "sans-serif",
  fontSize: "16px",
};
const LIST_TRACK_TOP = 73;
const LIST_TRACK_BOTTOM = 303;

type ButtonId = keyof typeof ui.buttons;
type ListScreen = "merit_list" | "enemy_list";

interface ListRuntime {
  screen: ListScreen;
  scrollRow: number;
  rows: PostBattleSoldierSnapshot[];
  rowObjects: Phaser.GameObjects.GameObject[];
  thumb: Phaser.GameObjects.Image;
  sortKey: string | null;
}

export class PostBattleScene extends Phaser.Scene {
  private snapshot!: PostBattleSnapshot;
  private screen: PostBattleScreen = "battle_result";
  private screenObjects: Phaser.GameObjects.GameObject[] = [];
  private resultStartedAt = 0;
  private resultPanel: Phaser.GameObjects.Image | null = null;
  private resultGroups: Record<"base" | "soldier" | "retreat" | "totals" | "final", Phaser.GameObjects.GameObject[]> = {
    base: [], soldier: [], retreat: [], totals: [], final: [],
  };
  private listRuntime: ListRuntime | null = null;
  private selectedEnemyIndex = 0;
  private notice: Phaser.GameObjects.Text | null = null;

  constructor() {
    super("PostBattle");
  }

  init(data: PostBattleSceneData): void {
    if (!data?.snapshot) throw new Error("PostBattleScene requires an immutable PostBattleSnapshot");
    this.snapshot = data.snapshot;
    this.screen = "battle_result";
    this.selectedEnemyIndex = 0;
    this.listRuntime = null;
  }

  preload(): void {
    preloadPostBattleAtlas(this);
    for (const definition of CHARACTER_SPRITESHEETS) {
      if (!this.textures.exists(definition.key)) {
        this.load.spritesheet(definition.key, definition.url, {
          frameWidth: CHARACTER_FRAME_WIDTH,
          frameHeight: CHARACTER_FRAME_HEIGHT,
        });
      }
    }
  }

  create(): void {
    configureMapUiCamera(this);
    registerPostBattleAtlasFrames(this);
    for (const definition of CHARACTER_SPRITESHEETS) {
      if (this.textures.exists(definition.key)) this.textures.get(definition.key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    this.input.on("wheel", (_pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
      if (!this.listRuntime || dy === 0) return;
      this.setListScroll(this.listRuntime.scrollRow + (dy > 0 ? 1 : -1));
    });
    this.showScreen("battle_result");
  }

  update(time: number): void {
    if (this.screen !== "battle_result" || !this.resultPanel) return;
    const reveal = getBattleResultRevealState(time - this.resultStartedAt);
    this.resultPanel.setAlpha(reveal.panelAlpha);
    this.setGroupVisible("base", reveal.baseRow);
    this.setGroupVisible("soldier", reveal.soldierRow);
    this.setGroupVisible("retreat", reveal.retreatRow);
    this.setGroupVisible("totals", reveal.totalsRow);
    this.setGroupVisible("final", reveal.finalUi);
  }

  private track<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.screenObjects.push(object);
    return object;
  }

  private clearScreen(): void {
    this.notice = null;
    this.listRuntime = null;
    for (const object of this.screenObjects) object.destroy();
    this.screenObjects = [];
    this.resultPanel = null;
    this.resultGroups = { base: [], soldier: [], retreat: [], totals: [], final: [] };
  }

  private showScreen(screen: PostBattleScreen): void {
    this.clearScreen();
    this.screen = screen;
    if (screen === "battle_result") this.createBattleResult();
    else if (screen === "merit_list") this.createListScreen("merit_list");
    else if (screen === "enemy_list") this.createListScreen("enemy_list");
    else this.createEnemyDetail();
  }

  private image(id: string | number, x: number, y: number, depth = 0): Phaser.GameObjects.Image {
    return this.track(createPostBattleImage(this, id, x, y).setDepth(depth));
  }

  private text(x: number, y: number, value: string, style = TEXT_STYLE): Phaser.GameObjects.Text {
    return this.track(this.add.text(x, y, value, style).setDepth(20));
  }

  private createBattleResult(): void {
    const screen = ui.screens.battle_result;
    this.image(screen.background, 0, 0);
    this.resultPanel = this.image(screen.panel.asset, screen.panel.x, screen.panel.y, 2).setAlpha(0);
    const anchors = screen.dynamic_text_anchors;
    this.resultGroups.base.push(
      this.resultValue(anchors.player_base, this.snapshot.playerBaseHp),
      this.resultValue(anchors.enemy_base, this.snapshot.enemyBaseHp),
    );
    this.resultGroups.soldier.push(
      this.resultValue(anchors.player_soldiers, this.snapshot.playerRemaining),
      this.resultValue(anchors.enemy_soldiers, this.snapshot.enemyRemaining),
    );
    this.resultGroups.retreat.push(
      this.resultValue(anchors.player_retreats, this.snapshot.resultMetrics.playerRetreats),
      this.resultValue(anchors.enemy_retreats, this.snapshot.resultMetrics.enemyRetreats),
    );
    this.resultGroups.totals.push(
      this.resultValue(anchors.player_total, this.snapshot.resultMetrics.playerTotal, "16px"),
      this.resultValue(anchors.enemy_total, this.snapshot.resultMetrics.enemyTotal, "16px"),
    );

    // Sprite 3216 frame 67 places these at local (1,-2), (0,301)
    // and (11,306) under the panel root (31,22).
    const badgeX = this.snapshot.battleResult === "VICTORY" ? 32 : 244.25;
    this.resultGroups.final.push(this.image("winner_badge", badgeX, 20, 8));
    this.resultGroups.final.push(this.image("result_footer", 31, 323, 7));
    this.resultGroups.final.push(this.image("money_acquired_strip", 42, 328, 8));
    this.resultGroups.final.push(this.resultValue(anchors.money, this.snapshot.resultMetrics.acquiredMoney, "12px"));
    this.resultGroups.final.push(...this.createButton("result_next", () => {
      const target = routeAfterBattleResult(this.snapshot);
      if (target === "map") {
        this.scene.start("Map", this.snapshot.selectedMapCell ? { currentCellId: this.snapshot.selectedMapCell.cellId } : {});
      } else {
        this.showScreen(target);
      }
    }));
    for (const group of Object.values(this.resultGroups)) {
      for (const object of group) this.setObjectVisible(object, false);
    }
    this.resultStartedAt = this.time.now;
  }

  private resultValue(anchor: readonly number[], value: number | null, fontSize = "13px"): Phaser.GameObjects.Text {
    return this.text(anchor[0], anchor[1], displayPostBattleValue(value), {
      ...TEXT_STYLE,
      fontSize,
      align: "center",
    }).setOrigin(0.5, 0);
  }

  private setGroupVisible(group: keyof typeof this.resultGroups, visible: boolean): void {
    for (const object of this.resultGroups[group]) this.setObjectVisible(object, visible);
  }

  private setObjectVisible(object: Phaser.GameObjects.GameObject, visible: boolean): void {
    if ("setVisible" in object) {
      (object as Phaser.GameObjects.GameObject & { setVisible(value: boolean): unknown }).setVisible(visible);
    }
  }

  private createButton(
    id: ButtonId,
    onPress: () => void,
    position?: { x: number; y: number },
  ): Phaser.GameObjects.GameObject[] {
    const button = ui.buttons[id];
    const x = position?.x ?? button.x;
    const y = position?.y ?? button.y;
    const up = requirePostBattleAsset(button.up);
    const over = requirePostBattleAsset(button.over);
    const image = this.image(button.up, x, y, 30);
    const objects: Phaser.GameObjects.GameObject[] = [image];
    if ("label" in button) {
      objects.push(this.image(button.label, x + button.label_offset[0], y + button.label_offset[1], 31));
    }
    const zone = this.track(this.add.zone(x, y, button.width, button.height)
      .setOrigin(0)
      .setDepth(32)
      .setInteractive({ useHandCursor: true })
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => image.setTexture(over.textureKey, over.frameKey))
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => image.setTexture(up.textureKey, up.frameKey))
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
        image.setTexture(over.textureKey, over.frameKey);
        onPress();
      })
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => image.setTexture(over.textureKey, over.frameKey)));
    objects.push(zone);
    return objects;
  }

  private createListScreen(screenName: ListScreen): void {
    const config = ui.screens[screenName];
    this.image(config.background, 0, 0);
    this.image(config.header.asset, config.header.x, config.source.root_y + config.header.y, 2);
    this.image(config.footer.asset, config.footer.x, config.footer.y, 8);
    const rows = screenName === "merit_list"
      ? [...this.snapshot.playerRoster].slice(0, config.list.allocated_rows)
      : [...this.snapshot.enemyRoster].slice(0, config.list.allocated_rows);
    const thumb = this.image(config.scrollbar.thumb_asset, config.scrollbar.x, config.scrollbar.y, 15)
      .setInteractive({ useHandCursor: true, draggable: true });
    this.input.setDraggable(thumb);
    thumb.on(Phaser.Input.Events.DRAG, (_pointer: Phaser.Input.Pointer, _dragX: number, dragY: number) => {
      const maxScroll = maxPostBattleListScroll(rows.length, config.list.visible_rows);
      const y = Phaser.Math.Clamp(dragY, LIST_TRACK_TOP, LIST_TRACK_BOTTOM);
      const row = maxScroll === 0 ? 0 : Math.round((y - LIST_TRACK_TOP) / (LIST_TRACK_BOTTOM - LIST_TRACK_TOP) * maxScroll);
      this.setListScroll(row);
    });
    this.listRuntime = { screen: screenName, scrollRow: 0, rows, rowObjects: [], thumb, sortKey: null };
    this.createSortZones(screenName);
    if (screenName === "merit_list") {
      this.createButton("to_enemy_recruit", () => this.showScreen(routeAfterMeritList() as "enemy_list"));
    } else {
      // Sprite 3312 frame 8 places Button 3233 at local (147,310)
      // under the list root y=30.
      this.createButton("do_not_recruit", () => this.showUnconnectedNotice(), { x: 147, y: 340 });
    }
    this.renderListRows();
  }

  private createSortZones(screen: ListScreen): void {
    const definitions: Array<{ x: number; width: number; key: EnemySortKey | MeritSortKey }> = screen === "enemy_list"
      ? [
        { x: 84, width: 42, key: "unit_type" }, { x: 126, width: 39, key: "action_type" },
        { x: 165, width: 42, key: "hp" }, { x: 207, width: 43, key: "skill" },
        { x: 250, width: 42, key: "attack" }, { x: 292, width: 40, key: "defense" },
        { x: 332, width: 43, key: "speed" },
      ]
      : [
        { x: 80, width: 28, key: "battle_win" }, { x: 108, width: 40, key: "battle_loss" },
        { x: 148, width: 35, key: "retreat" }, { x: 183, width: 35, key: "kills" },
        { x: 218, width: 35, key: "soldier_attack" }, { x: 253, width: 34, key: "base_attack" },
        { x: 287, width: 35, key: "defense" }, { x: 322, width: 53, key: "recovery" },
      ];
    for (const definition of definitions) {
      const sortIndices = ui.screens[screen].sort.indices as Record<string, number>;
      this.track(this.add.zone(definition.x, 31, definition.width, 43)
        .setOrigin(0)
        .setDepth(12)
        .setData("sortIndex", sortIndices[definition.key])
        .setInteractive({ useHandCursor: true })
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.sortList(definition.key)));
    }
  }

  private sortList(key: EnemySortKey | MeritSortKey): void {
    const runtime = this.listRuntime;
    if (!runtime) return;
    if (runtime.sortKey === key) {
      runtime.rows = [...runtime.rows].reverse();
    } else if (runtime.screen === "enemy_list") {
      runtime.rows = sortEnemyRows(this.snapshot.enemyRoster, key as EnemySortKey);
    } else {
      runtime.rows = sortMeritRows(this.snapshot.playerRoster, key as MeritSortKey);
    }
    runtime.sortKey = key;
    runtime.scrollRow = 0;
    this.renderListRows();
  }

  private setListScroll(scrollRow: number): void {
    const runtime = this.listRuntime;
    if (!runtime) return;
    const config = ui.screens[runtime.screen].list;
    runtime.scrollRow = clampPostBattleListScroll(scrollRow, runtime.rows.length, config.visible_rows);
    this.renderListRows();
  }

  private renderListRows(): void {
    const runtime = this.listRuntime;
    if (!runtime) return;
    for (const object of runtime.rowObjects) {
      const index = this.screenObjects.indexOf(object);
      if (index >= 0) this.screenObjects.splice(index, 1);
      object.destroy();
    }
    runtime.rowObjects = [];
    const config = ui.screens[runtime.screen];
    const first = runtime.scrollRow;
    const last = Math.min(runtime.rows.length, first + config.list.visible_rows);
    for (let index = first; index < last; index += 1) {
      const soldier = runtime.rows[index];
      const y = config.list.y + (index - first) * config.list.row_height;
      const values = runtime.screen === "enemy_list"
        ? [soldier.name, soldier.unitType, soldier.technique, soldier.maxHp, soldier.skill, soldier.attack, soldier.defense, soldier.speed]
        : [soldier.name, null, null, null, null, null, null, null, null];
      const xs = runtime.screen === "enemy_list"
        ? [18, 88, 130, 170, 213, 255, 298, 337]
        : [18, 89, 115, 150, 184, 219, 254, 289, 325];
      values.forEach((value, column) => {
        const text = this.text(xs[column], y + 7, displayPostBattleValue(value), ROW_STYLE);
        if (column > 0) text.setOrigin(0.5, 0);
        runtime.rowObjects.push(text);
      });
      if (runtime.screen === "enemy_list") {
        const zone = this.track(this.add.zone(config.list.x, y, 343, config.list.row_height)
          .setOrigin(0)
          .setDepth(25)
          .setInteractive({ useHandCursor: true })
          .on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
            this.selectedEnemyIndex = this.snapshot.enemyRoster.findIndex((entry) => entry.id === soldier.id);
            this.showScreen("enemy_detail");
          }));
        runtime.rowObjects.push(zone);
      }
    }
    const max = maxPostBattleListScroll(runtime.rows.length, config.list.visible_rows);
    const ratio = max === 0 ? 0 : runtime.scrollRow / max;
    runtime.thumb.y = LIST_TRACK_TOP + ratio * (LIST_TRACK_BOTTOM - LIST_TRACK_TOP);
  }

  private createEnemyDetail(): void {
    const config = ui.screens.enemy_detail;
    const soldier = this.snapshot.enemyRoster[this.selectedEnemyIndex];
    this.image(config.panel.asset, config.panel.x, config.panel.y);
    if (!soldier) {
      this.text(190, 180, "敵兵データなし", { ...TEXT_STYLE, fontSize: "14px" }).setOrigin(0.5);
      this.createButton("back_to_enemy_list", () => this.showScreen("enemy_list"));
      return;
    }
    this.createEnemyPortrait(soldier);
    this.enemyDetailText(ENEMY_DETAIL_LAYOUT.name, soldier.name);
    this.enemyDetailText(ENEMY_DETAIL_LAYOUT.hp, soldier.maxHp);
    this.enemyDetailText(ENEMY_DETAIL_LAYOUT.skill, soldier.skill);
    this.enemyDetailText(ENEMY_DETAIL_LAYOUT.speed, soldier.speed);
    this.enemyDetailText(ENEMY_DETAIL_LAYOUT.attack, soldier.attack);
    this.enemyDetailText(ENEMY_DETAIL_LAYOUT.defense, soldier.defense);
    this.enemyDetailText(ENEMY_DETAIL_LAYOUT.stipend, null);

    const unitType = resolveEnemyDetailUnitType(soldier.unitType);
    if (unitType) this.image(unitType.bitmapId, ENEMY_DETAIL_LAYOUT.unitType.tx, ENEMY_DETAIL_LAYOUT.unitType.ty, 10);
    else this.text(ENEMY_DETAIL_LAYOUT.unitType.tx + 26, ENEMY_DETAIL_LAYOUT.unitType.ty + 5, "--", DETAIL_TEXT_STYLE).setOrigin(0.5, 0);

    const technique = resolveEnemyDetailTechnique(soldier.technique);
    if (technique) this.image(technique.bitmapId, ENEMY_DETAIL_LAYOUT.technique.tx, ENEMY_DETAIL_LAYOUT.technique.ty, 10);
    else this.text(ENEMY_DETAIL_LAYOUT.technique.tx + 26, ENEMY_DETAIL_LAYOUT.technique.ty + 5, "--", DETAIL_TEXT_STYLE).setOrigin(0.5, 0);

    // The original frame contains this static label. There is no growth counter
    // in the current domain model, so no synthetic number is layered over it.
    this.image(2709, ENEMY_DETAIL_LAYOUT.growthLabel.tx, ENEMY_DETAIL_LAYOUT.growthLabel.ty, 10);

    for (const slot of resolveEnemyDetailActionSlots(soldier.strategy)) {
      this.image(slot.bitmapId, slot.x, slot.y, 10);
    }
    for (const slot of resolveEnemyDetailSpecialSlots(soldier.specialAbilities, soldier.rareSpecialAbilities)) {
      this.image(slot.bitmapId, slot.x, slot.y, 10);
    }
    this.createButton("previous_enemy", () => {
      if (this.selectedEnemyIndex <= 0) return;
      this.selectedEnemyIndex -= 1;
      this.showScreen("enemy_detail");
    });
    this.createButton("next_enemy", () => {
      if (this.selectedEnemyIndex >= this.snapshot.enemyRoster.length - 1) return;
      this.selectedEnemyIndex += 1;
      this.showScreen("enemy_detail");
    });
    this.createButton("recruit_this_soldier", () => this.showUnconnectedNotice());
    this.createButton("do_not_recruit", () => this.showUnconnectedNotice());
    this.createButton("back_to_enemy_list", () => this.showScreen("enemy_list"));
  }

  private enemyDetailText(placement: EnemyDetailTextPlacement, value: string | number | null): Phaser.GameObjects.Text {
    return this.text(placement.x, placement.y, displayPostBattleValue(value), {
      ...DETAIL_TEXT_STYLE,
      align: placement.align,
    }).setFixedSize(placement.width, placement.height);
  }

  private createEnemyPortrait(soldier: PostBattleSoldierSnapshot): void {
    if (!isSpriteUnitType(soldier.unitType)) return;
    const config = ui.screens.enemy_detail.portrait_anchor;
    const render = getCharacterRenderConfig(soldier.unitType);
    const sprite = this.track(this.add.sprite(
      config.x,
      config.y,
      getCharacterTextureKey(soldier.unitType, "enemy"),
      getCharacterFrameIndex("walk_1", "south"),
    ).setOrigin(render.originX, render.originY).setScale(config.swf_scale).setDepth(5));
    const maskShape = this.track(this.add.graphics().fillStyle(0xffffff).fillRect(20, 43, 103, 83).setVisible(false));
    sprite.setMask(maskShape.createGeometryMask());
  }

  private showUnconnectedNotice(): void {
    this.notice?.destroy();
    this.notice = this.text(190, 285, "未接続：軍団・所持銭・俸給は変更されません", {
      ...TEXT_STYLE,
      fontSize: "8px",
      backgroundColor: "#24150dcc",
      align: "center",
    }).setOrigin(0.5).setPadding(5, 3);
    this.time.delayedCall(1_500, () => {
      if (!this.notice) return;
      const object = this.notice;
      this.notice = null;
      const index = this.screenObjects.indexOf(object);
      if (index >= 0) this.screenObjects.splice(index, 1);
      object.destroy();
    });
  }
}
