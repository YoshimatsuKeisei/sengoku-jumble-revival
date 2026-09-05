import Phaser from "phaser";
import toolbarJson from "../../../assets/formation_ui/config/bottom_toolbar.json";
import formationSceneJson from "../../../assets/formation_ui/config/formation_scene.json";
import { BATTLEFIELD_LAYER_DEFINITIONS } from "../rendering/battlefieldAssets";
import { createArmy } from "../factories/createArmy";
import { loadStoredArmySetup } from "../systems/armySetupSystem";
import { loadStoredPlayerLoadout } from "../ui/playerLoadoutPanel";
import {
  CHARACTER_FRAME_HEIGHT,
  CHARACTER_FRAME_WIDTH,
  CHARACTER_SPRITESHEETS,
  directionFromFacing,
  getCharacterFrameIndex,
  getCharacterRenderConfig,
  getCharacterTextureKey,
  isSpriteUnitType,
} from "../rendering/characterSprite";
import {
  FORMATION_ATLAS,
  FORMATION_SOURCE_PARTS,
  createFormationAtlasImage,
  preloadFormationAssets,
  registerFormationAtlasFrames,
  requireFormationAsset,
} from "../rendering/formationAssets";
import {
  FORMATION_TOOLBAR_Y,
  createFormationCameraState,
  formationStageToWorld,
  type FormationCameraState,
} from "../formation/formationCamera";
import {
  formationGridToWorld,
  formationWorldToGrid,
  isFormationGridCellInside,
} from "../formation/formationGrid";
import {
  cloneFormationState,
  commitFormationState,
  createWorkingFormationState,
  moveFormationSoldier,
  type FormationState,
} from "../formation/formationState";
import { configureMapUiCamera } from "../map/mapUiRenderer";
import type { MapSceneData } from "../map/MapScene";
import type { Soldier } from "../types";

interface FormationSceneData {
  mapState?: MapSceneData;
}

interface ToolbarConfig {
  root: { stage_x: number; stage_y: number };
  dynamic_text: Array<{ role: "money" | "total_provisions"; stage: [number, number] }>;
  buttons: Array<{
    id: "confirm" | "cancel" | "view";
    stage: [number, number];
    size: [number, number];
    normal: string;
    over: string;
    down: string;
  }>;
}

interface FormationSoldierView {
  soldier: Soldier;
  display: Phaser.GameObjects.Sprite | Phaser.GameObjects.Arc;
  hitZone: Phaser.GameObjects.Zone;
}

interface FormationSceneConfig {
  layers_back_to_front: Array<{
    depth: number;
    symbol_id: number;
    name?: string;
    position?: [number, number];
  }>;
}

interface ActiveFormationDrag {
  soldierId: string;
  startGridX: number;
  startGridY: number;
}

const toolbar = toolbarJson as unknown as ToolbarConfig;
const formationScene = formationSceneJson as unknown as FormationSceneConfig;
const FORMATION_PLAYER_BASE_OFFSET = { x: 56, y: 205 } as const;
const FORMATION_FIXED_FENCE_SYMBOL_ID = 2650;
const FALLBACK_TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  color: "#ffffff",
  fontFamily: "sans-serif",
  fontSize: "10px",
};
let atlasFailureWarned = false;

export class FormationScene extends Phaser.Scene {
  private sceneData: FormationSceneData = {};
  private roster: Soldier[] = [];
  private workingFormation!: FormationState;
  private entrySnapshot!: FormationState;
  private formationCamera: FormationCameraState = createFormationCameraState("overview");
  private worldRoot!: Phaser.GameObjects.Container;
  private soldierViews = new Map<string, FormationSoldierView>();
  private leaderFlag: Phaser.GameObjects.Image | null = null;
  private activeDrag: ActiveFormationDrag | null = null;
  private atlasReady = false;

  constructor() {
    super("Formation");
  }

  init(data?: FormationSceneData): void {
    this.sceneData = data ?? {};
    this.formationCamera = createFormationCameraState("overview");
    this.activeDrag = null;
  }

  preload(): void {
    preloadFormationAssets(this);
    for (const layer of BATTLEFIELD_LAYER_DEFINITIONS.filter(
      (candidate) => candidate.kind === "tile" || candidate.id === "player-base",
    )) {
      if (!this.textures.exists(layer.key)) this.load.image(layer.key, layer.url);
    }
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
    this.atlasReady = this.textures.exists(FORMATION_ATLAS.key);
    if (this.atlasReady) registerFormationAtlasFrames(this);
    else if (!atlasFailureWarned) {
      atlasFailureWarned = true;
      console.warn("Formation UI atlas failed to load; using the simple toolbar fallback.");
    }

    const armySetup = loadStoredArmySetup();
    this.roster = createArmy("player", () => 0.5, {
      playerLoadout: loadStoredPlayerLoadout(),
      armySetup: armySetup.player,
    });
    this.workingFormation = createWorkingFormationState(this.roster);
    this.entrySnapshot = cloneFormationState(this.workingFormation);

    this.worldRoot = this.add.container(0, 0).setDepth(0);
    this.createFormationWorld();
    this.createSoldierViews();
    this.createToolbar();
    this.applyFormationCamera();
    this.refreshSoldierViews();
    this.bindPointerLifecycle();
  }

  private createFormationWorld(): void {
    const groundLayer = BATTLEFIELD_LAYER_DEFINITIONS.find((layer) => layer.kind === "tile")!;
    const overview = createFormationCameraState("overview");
    const worldWidth = Math.ceil(overview.centerX + 190 / overview.scale);
    const worldHeight = Math.ceil(overview.centerY + 190 / overview.scale);
    const extendedGround = this.add.tileSprite(
      0,
      0,
      worldWidth,
      worldHeight,
      groundLayer.key,
    ).setOrigin(0).setDepth(0);
    this.worldRoot.add(extendedGround);

    // Formation uses the PLAYER base at its original bitmap scale, translated
    // from the battle source position to the SWF FormationScene position.
    const playerBase = BATTLEFIELD_LAYER_DEFINITIONS.find((layer) => layer.id === "player-base")!;
    this.worldRoot.add(
      this.add.image(
        FORMATION_PLAYER_BASE_OFFSET.x,
        FORMATION_PLAYER_BASE_OFFSET.y,
        playerBase.key,
      ).setOrigin(0).setDepth(2),
    );

    // s1/s2/s3 are Formation-specific blockers and are not present in the
    // regular battlefield overlay. Their coordinates come from formation_scene.json.
    const fixedFence = FORMATION_SOURCE_PARTS.formation_tall_pole;
    for (const layer of formationScene.layers_back_to_front) {
      if (layer.symbol_id !== FORMATION_FIXED_FENCE_SYMBOL_ID || !layer.name || !layer.position) continue;
      this.worldRoot.add(
        this.add.image(layer.position[0], layer.position[1], fixedFence.key)
          .setOrigin(0)
          .setDepth(layer.depth),
      );
    }
  }

  private createSoldierViews(): void {
    for (const definition of CHARACTER_SPRITESHEETS) {
      if (this.textures.exists(definition.key)) this.textures.get(definition.key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    for (const soldier of this.roster) {
      const position = this.workingFormation.soldiers.find((entry) => entry.soldierId === soldier.id)!;
      let display: Phaser.GameObjects.Sprite | Phaser.GameObjects.Arc;
      if (isSpriteUnitType(soldier.unitType)) {
        const render = getCharacterRenderConfig(soldier.unitType);
        display = this.add.sprite(
          position.worldX + render.visualOffsetX,
          position.worldY + render.visualOffsetY,
          getCharacterTextureKey(soldier.unitType, "player"),
          getCharacterFrameIndex("walk_1", directionFromFacing(soldier.facingX, soldier.facingY, "east")),
        ).setOrigin(render.originX, render.originY).setScale(render.scale);
      } else {
        // This is the same Graphics fallback used by BattleScene for the legacy PROTOTYPE unit.
        display = this.add.circle(position.worldX, position.worldY, 8, 0x4e9cff);
      }
      display.setDepth(57 + position.worldY / 10_000);
      this.worldRoot.add(display);

      const hitZone = this.add.zone(position.worldX, position.worldY - 18, 30, 48)
        .setOrigin(0.5)
        .setDepth(200 + position.worldY / 10_000)
        .setInteractive({ useHandCursor: true });
      this.worldRoot.add(hitZone);
      hitZone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
        const stage = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
        if (stage.y >= FORMATION_TOOLBAR_Y) return;
        this.beginDrag(soldier.id);
      });
      this.soldierViews.set(soldier.id, { soldier, display, hitZone });
    }

    const leader = this.workingFormation.soldiers.find((entry) => entry.rosterIndex === 0);
    const flag = FORMATION_SOURCE_PARTS.formation_crossed_fence;
    if (leader && this.textures.exists(flag.key)) {
      this.leaderFlag = this.add.image(leader.worldX, leader.worldY - 22, flag.key)
        .setOrigin(0.5, 1)
        .setDepth(97);
      this.worldRoot.add(this.leaderFlag);
    }
  }

  private createToolbar(): void {
    if (!this.atlasReady) {
      this.createFallbackToolbar();
      return;
    }
    createFormationAtlasImage(this, "bottom_toolbar", toolbar.root.stage_x, toolbar.root.stage_y)
      .setDepth(300)
      .setInteractive();
    const money = toolbar.dynamic_text.find((field) => field.role === "money")!;
    const provisions = toolbar.dynamic_text.find((field) => field.role === "total_provisions")!;
    this.add.text(money.stage[0], money.stage[1], String(this.sceneData.mapState?.money ?? 0), FALLBACK_TEXT_STYLE)
      .setDepth(302);
    this.add.text(
      provisions.stage[0],
      provisions.stage[1],
      String(this.sceneData.mapState?.totalProvisions ?? 0),
      FALLBACK_TEXT_STYLE,
    ).setDepth(302);
    for (const button of toolbar.buttons) this.createToolbarButton(button);
  }

  private createToolbarButton(button: ToolbarConfig["buttons"][number]): void {
    const normal = requireFormationAsset(button.normal);
    const over = requireFormationAsset(button.over);
    const image = createFormationAtlasImage(this, button.normal, button.stage[0], button.stage[1]).setDepth(303);
    if (button.id === "view") return;
    image.setInteractive(new Phaser.Geom.Rectangle(0, 0, button.size[0], button.size[1]), Phaser.Geom.Rectangle.Contains)
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => image.setTexture(over.textureKey, over.frameKey))
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => image.setTexture(normal.textureKey, normal.frameKey))
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
        image.setTexture(over.textureKey, over.frameKey);
        this.runToolbarAction(button.id);
      })
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => image.setTexture(over.textureKey, over.frameKey));
  }

  private createFallbackToolbar(): void {
    this.add.rectangle(0, FORMATION_TOOLBAR_Y, 380, 43, 0x2d2117).setOrigin(0).setDepth(300).setInteractive();
    const actions: Array<["confirm" | "cancel" | "view", number, string]> = [
      ["confirm", 267, "決定"],
      ["cancel", 303, "取消"],
      ["view", 339, "視点"],
    ];
    for (const [action, x, label] of actions) {
      const text = this.add.text(x, 341, label, {
        ...FALLBACK_TEXT_STYLE,
        backgroundColor: "#4c433a",
        fixedWidth: 36,
        fixedHeight: 36,
      }).setDepth(303);
      if (action !== "view") {
        text.setInteractive({ useHandCursor: true })
          .on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.runToolbarAction(action));
      }
    }
  }

  private runToolbarAction(action: "confirm" | "cancel" | "view"): void {
    if (action === "confirm") {
      commitFormationState(this.workingFormation);
      this.returnToMap();
      return;
    }
    if (action === "cancel") {
      this.workingFormation = cloneFormationState(this.entrySnapshot);
      this.activeDrag = null;
      this.returnToMap();
      return;
    }
    // Formation editing is intentionally fixed to the full overview.
  }

  private returnToMap(): void {
    this.scene.start("Map", { ...this.sceneData.mapState });
  }

  private bindPointerLifecycle(): void {
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => this.updateDrag(pointer));
    this.input.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => this.endDrag(pointer));
    this.input.on("pointercancel", (pointer: Phaser.Input.Pointer) => this.cancelDrag(pointer));
    this.input.on("pointerupoutside", (pointer: Phaser.Input.Pointer) => this.cancelDrag(pointer));
    this.input.on("gameout", (pointer: Phaser.Input.Pointer) => this.cancelDrag(pointer));
  }

  private beginDrag(soldierId: string): void {
    const position = this.workingFormation.soldiers.find((entry) => entry.soldierId === soldierId);
    if (!position) return;
    this.activeDrag = { soldierId, startGridX: position.gridX, startGridY: position.gridY };
  }

  private pointerGridCell(pointer: Phaser.Input.Pointer): { gridX: number; gridY: number } | null {
    const stage = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    if (stage.y >= FORMATION_TOOLBAR_Y) return null;
    const world = formationStageToWorld(stage.x, stage.y, this.formationCamera);
    const cell = formationWorldToGrid(world.x, world.y);
    return isFormationGridCellInside(cell.gridX, cell.gridY) ? cell : null;
  }

  private updateDrag(pointer: Phaser.Input.Pointer): void {
    if (!this.activeDrag) return;
    const cell = this.pointerGridCell(pointer);
    if (!cell) return;
    const world = formationGridToWorld(cell.gridX, cell.gridY);
    const view = this.soldierViews.get(this.activeDrag.soldierId);
    if (!view) return;
    this.setSoldierViewPosition(view, world.x, world.y);
    view.hitZone.setPosition(world.x, world.y - 18);
    if (view.soldier.id === this.roster[0]?.id) this.leaderFlag?.setPosition(world.x, world.y - 22);
  }

  private endDrag(pointer: Phaser.Input.Pointer): void {
    if (!this.activeDrag) return;
    const drag = this.activeDrag;
    const cell = this.pointerGridCell(pointer);
    if (cell) {
      moveFormationSoldier(this.workingFormation, drag.soldierId, cell.gridX, cell.gridY);
    }
    this.activeDrag = null;
    this.refreshSoldierViews();
  }

  private cancelDrag(_pointer?: Phaser.Input.Pointer): void {
    if (!this.activeDrag) return;
    this.activeDrag = null;
    this.refreshSoldierViews();
  }

  private refreshSoldierViews(): void {
    for (const position of this.workingFormation.soldiers) {
      const view = this.soldierViews.get(position.soldierId);
      if (!view) continue;
      this.setSoldierViewPosition(view, position.worldX, position.worldY);
      view.display.setDepth(57 + position.worldY / 10_000);
      view.hitZone.setPosition(position.worldX, position.worldY - 18).setDepth(200 + position.worldY / 10_000);
    }
    const leader = this.workingFormation.soldiers.find((entry) => entry.rosterIndex === 0);
    if (leader) this.leaderFlag?.setPosition(leader.worldX, leader.worldY - 22);
    this.worldRoot.sort("depth");
  }

  private setSoldierViewPosition(view: FormationSoldierView, worldX: number, worldY: number): void {
    if (isSpriteUnitType(view.soldier.unitType)) {
      const render = getCharacterRenderConfig(view.soldier.unitType);
      view.display.setPosition(worldX + render.visualOffsetX, worldY + render.visualOffsetY);
    } else {
      view.display.setPosition(worldX, worldY);
    }
  }

  private applyFormationCamera(): void {
    this.worldRoot
      .setScale(this.formationCamera.scale)
      .setPosition(
        190 - this.formationCamera.centerX * this.formationCamera.scale,
        190 - this.formationCamera.centerY * this.formationCamera.scale,
      );
  }
}
