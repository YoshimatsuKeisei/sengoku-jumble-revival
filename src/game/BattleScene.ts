import Phaser from "phaser";
import {
  AI_THINK_INTERVAL_MS,
  ARCHER_CONFIG,
  ASHIGARU_CONFIG,
  BATTLEFIELD_CONFIG,
  BATTLE_OBSTACLES,
  CAMERA_CONFIG,
  CAVALRY_CONFIG,
  COMMAND_CONFIG,
  GENERAL_CONFIG,
  GUN_CONFIG,
  MOSA_CONFIG,
  NINJA_CONFIG,
  PLAYER_MOUSE_DEAD_ZONE,
  RECOVERY_CONFIG,
  SOLDIER_RADIUS,
  SPECIAL_ATTACK_CONFIG,
  STRATEGIST_CONFIG,
} from "./config";
import { createArmy, getDefaultArmyPosition } from "./factories/createArmy";
import { updateAiTargets } from "./systems/aiSystem";
import {
  createBattleBases,
  getBaseForTeam,
  resolveBaseAccessCollisions,
} from "./systems/baseSystem";
import { updateAttackStates } from "./systems/attackSystem";
import {
  captureSoldierPositions,
  resolveBaseMovementContacts,
} from "./systems/baseContactSystem";
import {
  issueAdvanceCommand,
  issueDefendCommand,
  issueRallyCommand,
  updateTemporaryOrders,
} from "./systems/commandSystem";
import {
  getPlayerMovementIntent,
  moveAiSoldiers,
  movePlayer,
  resolveObstacleOverlaps,
  separateSoldiers,
} from "./systems/movementSystem";
import { updateRecoveryStates } from "./systems/recoverySystem";
import { updateReactions } from "./systems/reactionSystem";
import { updateNormalCombatContests } from "./systems/normalCombatSystem";
import { isWithinNormalContact } from "./systems/techniqueCombatProfiles";
import { getBattleResult } from "./systems/victorySystem";
import type {
  BattleBase,
  BattleResult,
  Soldier,
  TemporaryOrderType,
} from "./types";
import {
  clampCameraZoom,
  getCameraZoomLimits,
  getFollowScroll,
  getViewModeZoom,
  getZoomAnchoredScroll,
  toggleCameraViewMode,
  type CameraViewMode,
} from "./systems/cameraSystem";
import {
  updateSpecialAttacks,
  type SpecialAttackEvent,
} from "./systems/specialAttackSystem";
import { updateInvaderTrapMovement } from "./systems/trapAbilitySystem";
import {
  canPlayerContinueManualPursuitDuringWindup,
  canPlayerMoveInCurrentState,
} from "./systems/playerControlSystem";
import {
  updateInspectorTarget,
  type InspectorRuntime,
} from "./systems/soldierInspectorSystem";
import {
  isPlayerLoadoutPanelOpen,
  loadStoredPlayerLoadout,
  togglePlayerLoadoutPanel,
} from "./ui/playerLoadoutPanel";
import {
  isArmySetupPanelOpen,
  toggleArmySetupPanel,
} from "./ui/armySetupPanel";
import { loadStoredArmySetup } from "./systems/armySetupSystem";
import { updateTrackedSmoke } from "./systems/bombardmentEffectSystem";
import { clearConfusionByCommand } from "./systems/confusionSystem";
import { updateNinjaDashes } from "./systems/ninjaAttackSystem";
import {
  updateArrowProjectile,
  type ArrowImpactEvent,
  type ArrowProjectileRuntime,
} from "./systems/arrowAttackSystem";
import {
  updateStrategistFireZones,
  type StrategistFireZone,
} from "./systems/strategistAttackSystem";
import { BATTLEFIELD_LAYER_DEFINITIONS } from "./rendering/battlefieldAssets";
import { BATTLEFIELD_SOURCE_TO_WORLD } from "./battlefieldLayout";
import {
  CHARACTER_FRAME_HEIGHT,
  CHARACTER_FRAME_WIDTH,
  CHARACTER_SPRITESHEETS,
  createCharacterVisualRuntime,
  getCharacterFrameIndex,
  getCharacterRenderConfig,
  getCharacterTextureKey,
  isSpriteUnitType,
  resolveCharacterVisualFrame,
  type CharacterPose,
  type CharacterVisualRuntime,
} from "./rendering/characterSprite";
import {
  UNIT_ATLAS_ASSETS,
  getEffectSequence,
  resolveTechniqueActionEffects,
  type ActionDefinition,
  type EffectReference,
} from "./rendering/effectManifest";
import {
  BATTLE_EFFECT_RENDER_CONFIG,
  BattleEffectRenderer,
} from "./rendering/battleEffectRenderer";
import {
  actionHasIndependentEffects,
  isUnresolvedSideTargetReference,
  selectActionEffectReferences,
  type ActionEffectRole,
} from "./rendering/actionEffectPolicy";
import { BATTLE_PANEL_PRELOAD_ATLASES } from "./rendering/battlePanelAssets";
import { BattlePanelUi } from "./rendering/battlePanelUi";
import type {
  BattleSceneData,
  SelectedMapCell,
} from "./map/mapTransitionState";
import { resolveCommittedFormationForRoster } from "./formation/formationState";
import { createPostBattleSnapshot } from "./postBattle/postBattleState";

export class BattleScene extends Phaser.Scene {
  private selectedMapCell: SelectedMapCell | null = null;
  private soldiers: Soldier[] = [];
  private bases: BattleBase[] = [];
  private graphics!: Phaser.GameObjects.Graphics;
  private battlePanelUi: BattlePanelUi | null = null;
  private baseSprites = new Map<string, Phaser.GameObjects.Image>();
  private characterSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private characterVisualRuntimes = new Map<string, CharacterVisualRuntime>();
  private characterPoseOverrides = new Map<
    string,
    { pose: CharacterPose; until: number }
  >();
  private battleEffectRenderer: BattleEffectRenderer | null = null;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private commandKeys!: Record<"A" | "S" | "D", Phaser.Input.Keyboard.Key>;
  private zoomKeys!: Record<
    "out" | "in" | "reset",
    Phaser.Input.Keyboard.Key[]
  > & { toggle: Phaser.Input.Keyboard.Key };
  private specialKey!: Phaser.Input.Keyboard.Key;
  private loadoutPanelKey!: Phaser.Input.Keyboard.Key;
  private armySetupPanelKey!: Phaser.Input.Keyboard.Key;
  private inspectorRuntime: InspectorRuntime = { targetId: null, holdUntil: 0 };
  private selectedStatusSoldierId: string | null = null;
  private previousLeftDown = false;
  private pendingWheelZoomSteps = 0;
  private cameraViewMode: CameraViewMode = "COMBAT";
  private targetZoom = 1;
  private lastAiThinkAt = -AI_THINK_INTERVAL_MS;
  private lastCommandAt = -COMMAND_CONFIG.commandCooldownMs;
  private lastOrder: TemporaryOrderType | null = null;
  private rangeDisplayUntil = 0;
  private rangeDisplayRadius = 0;
  private result: BattleResult = null;
  private arrowProjectiles: ArrowProjectileRuntime[] = [];
  private atlasArrowProjectiles = new WeakMap<
    ArrowProjectileRuntime,
    { arrival: { x: number; y: number } }
  >();
  private spearEffectObjects: Phaser.GameObjects.GameObject[] = [];
  private strategistFireZones: StrategistFireZone[] = [];

  constructor() {
    super("Battle");
  }

  init(data?: Partial<BattleSceneData>): void {
    // Kept as transition context only. Map selection must not alter battle setup yet.
    this.selectedMapCell = data?.selectedMapCell
      ? { ...data.selectedMapCell }
      : null;
  }

  preload(): void {
    for (const layer of BATTLEFIELD_LAYER_DEFINITIONS)
      this.load.image(layer.key, layer.url);
    for (const definition of CHARACTER_SPRITESHEETS) {
      this.load.spritesheet(definition.key, definition.url, {
        frameWidth: CHARACTER_FRAME_WIDTH,
        frameHeight: CHARACTER_FRAME_HEIGHT,
      });
    }
    for (const atlas of UNIT_ATLAS_ASSETS) {
      if (!this.textures.exists(atlas.key))
        this.load.image(atlas.key, atlas.url);
    }
    for (const atlas of BATTLE_PANEL_PRELOAD_ATLASES) {
      if (!this.textures.exists(atlas.key))
        this.load.image(atlas.key, atlas.url);
    }
  }

  create(): void {
    const armySetup = loadStoredArmySetup();
    const playerFormation = resolveCommittedFormationForRoster(
      Array.from({ length: 30 }, (_, rosterIndex) => ({
        id: `player-${rosterIndex}`,
        ...getDefaultArmyPosition("player", rosterIndex),
      })),
    );
    this.soldiers = [
      ...createArmy("player", Math.random, {
        playerLoadout: loadStoredPlayerLoadout(),
        armySetup: armySetup.player,
        initialPositions: playerFormation?.soldiers,
      }),
      ...createArmy("enemy", Math.random, { armySetup: armySetup.enemy }),
    ];
    this.bases = createBattleBases();
    if (RECOVERY_CONFIG.debugStartPlayerLowHp) {
      const player = this.soldiers.find(
        (soldier) => soldier.controller === "player",
      );
      if (player) player.hp = player.maxHp * RECOVERY_CONFIG.dangerHpRatio;
    }
    this.baseSprites.clear();
    const battlefieldLayers = BATTLEFIELD_LAYER_DEFINITIONS.map((layer) => {
      if (layer.kind === "tile") {
        return this.add
          .tileSprite(layer.x, layer.y, layer.width, layer.height, layer.key)
          .setOrigin(0);
      }
      const image = this.add.image(layer.x, layer.y, layer.key).setOrigin(0);
      if ("baseTeam" in layer) {
        const base = getBaseForTeam(this.bases, layer.baseTeam);
        this.baseSprites.set(base.id, image);
      }
      return image;
    });
    this.add
      .container(
        BATTLEFIELD_SOURCE_TO_WORLD.offsetX,
        BATTLEFIELD_SOURCE_TO_WORLD.offsetY,
        battlefieldLayers,
      )
      .setScale(
        BATTLEFIELD_SOURCE_TO_WORLD.scaleX,
        BATTLEFIELD_SOURCE_TO_WORLD.scaleY,
      )
      .setDepth(-1);
    this.graphics = this.add.graphics();
    this.battleEffectRenderer = new BattleEffectRenderer(
      this,
      UNIT_ATLAS_ASSETS,
    );
    this.battlePanelUi = new BattlePanelUi(this, this.time.now);
    this.characterSprites.clear();
    this.characterVisualRuntimes.clear();
    this.characterPoseOverrides.clear();
    for (const definition of CHARACTER_SPRITESHEETS) {
      this.textures
        .get(definition.key)
        .setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    for (const soldier of this.soldiers) {
      if (!isSpriteUnitType(soldier.unitType)) continue;
      const renderConfig = getCharacterRenderConfig(soldier.unitType);
      const runtime = createCharacterVisualRuntime(soldier, this.time.now);
      const sprite = this.add
        .sprite(
          soldier.x + renderConfig.visualOffsetX,
          soldier.y + renderConfig.visualOffsetY,
          getCharacterTextureKey(soldier.unitType, soldier.team),
          getCharacterFrameIndex("walk_1", runtime.lastDirection),
        )
        .setOrigin(renderConfig.originX, renderConfig.originY)
        .setScale(renderConfig.scale)
        .setDepth(renderConfig.depth);
      this.characterSprites.set(soldier.id, sprite);
      this.characterVisualRuntimes.set(soldier.id, runtime);
    }
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.commandKeys = this.input.keyboard!.addKeys("A,S,D") as Record<
      "A" | "S" | "D",
      Phaser.Input.Keyboard.Key
    >;
    this.zoomKeys = {
      out: [
        this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.MINUS),
        this.input.keyboard!.addKey(
          Phaser.Input.Keyboard.KeyCodes.NUMPAD_SUBTRACT,
        ),
      ],
      in: [
        this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.PLUS),
        this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_ADD),
      ],
      reset: [
        this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ZERO),
        this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_ZERO),
      ],
      toggle: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
    };
    this.specialKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.Q,
    );
    this.loadoutPanelKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.L,
    );
    this.armySetupPanelKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.M,
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.arrowProjectiles = [];
      this.strategistFireZones = [];
      this.characterSprites.clear();
      this.characterVisualRuntimes.clear();
      this.characterPoseOverrides.clear();
      this.battleEffectRenderer?.destroy();
      this.battleEffectRenderer = null;
      this.battlePanelUi?.destroy();
      this.battlePanelUi = null;
      this.clearSpearEffects();
    });
    this.input.on(
      "wheel",
      (
        _pointer: Phaser.Input.Pointer,
        _objects: Phaser.GameObjects.GameObject[],
        _dx: number,
        dy: number,
      ) => {
        if (dy !== 0) this.pendingWheelZoomSteps += dy < 0 ? 1 : -1;
      },
    );
    const camera = this.cameras.main;
    camera
      .setBounds(0, 0, BATTLEFIELD_CONFIG.width, BATTLEFIELD_CONFIG.height)
      .setRoundPixels(true);
    this.targetZoom = getCameraZoomLimits(camera.width).defaultZoom;
    camera.setZoom(this.targetZoom);

    this.draw();
  }

  update(time: number, delta: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.loadoutPanelKey))
      togglePlayerLoadoutPanel();
    if (Phaser.Input.Keyboard.JustDown(this.armySetupPanelKey))
      toggleArmySetupPanel();
    this.battleEffectRenderer?.update(time);
    if (this.result) return;
    updateNinjaDashes(this.soldiers, time);
    updateReactions(
      this.soldiers,
      BATTLE_OBSTACLES,
      time,
      delta,
      this.result !== null,
    );
    const fireUpdate = updateStrategistFireZones(
      this.strategistFireZones,
      this.soldiers,
      time,
    );
    this.strategistFireZones = fireUpdate.active;
    for (const victimId of fireUpdate.hitIds)
      this.showStrategistFireZoneHit(victimId);
    updateRecoveryStates(this.soldiers, delta / 1000, this.bases, Math.random, time);
    const player = this.soldiers.find(
      (soldier) => soldier.controller === "player",
    );
    const loadoutPanelOpen =
      isPlayerLoadoutPanelOpen() || isArmySetupPanelOpen();
    if (player && !player.isDead && !loadoutPanelOpen) {
      this.handleCommandInput(player, time);
      updateTemporaryOrders(this.soldiers, player, time);
    }
    if (time - this.lastAiThinkAt >= AI_THINK_INTERVAL_MS) {
      updateAiTargets(this.soldiers, time);
      this.lastAiThinkAt = time;
    }
    const movementStartPositions = captureSoldierPositions(this.soldiers);
    if (
      player &&
      time >= player.ninjaDashUntil &&
      !loadoutPanelOpen &&
      canPlayerMoveInCurrentState(player, this.soldiers)
    ) {
      const pointer = this.input.activePointer;
      const arrowX =
        Number(this.cursors.right.isDown) - Number(this.cursors.left.isDown);
      const arrowY =
        Number(this.cursors.down.isDown) - Number(this.cursors.up.isDown);
      const intent = getPlayerMovementIntent(
        player,
        { x: arrowX, y: arrowY },
        { x: pointer.worldX, y: pointer.worldY },
        false,
        PLAYER_MOUSE_DEAD_ZONE,
      );
      movePlayer(
        player,
        intent.x,
        intent.y,
        delta / 1000,
        BATTLE_OBSTACLES,
        canPlayerContinueManualPursuitDuringWindup(player, this.soldiers),
        time,
      );
      updateAiTargetsForPlayer(player, this.soldiers);
    }
    if (player) this.updateCamera(player);
    moveAiSoldiers(
      this.soldiers,
      delta / 1000,
      BATTLE_OBSTACLES,
      time,
      this.bases,
    );
    updateInvaderTrapMovement(this.soldiers, movementStartPositions, time);
    resolveBaseMovementContacts(
      this.soldiers,
      this.bases,
      movementStartPositions,
      time,
    );
    separateSoldiers(this.soldiers);
    resolveObstacleOverlaps(this.soldiers, BATTLE_OBSTACLES);
    resolveBaseAccessCollisions(this.soldiers, this.bases);
    const leftDown = this.input.activePointer.leftButtonDown();
    const pressedThisFrame = leftDown && !this.previousLeftDown;
    const hoveredStatusSoldier = this.findPointerStatusSoldier(player);
    if (
      pressedThisFrame &&
      hoveredStatusSoldier &&
      !this.battlePanelUi?.blocksBattleInput()
    ) {
      this.selectedStatusSoldierId = hoveredStatusSoldier.id;
    }
    const playerSpecialRequested =
      !loadoutPanelOpen &&
      !this.battlePanelUi?.blocksBattleInput() &&
      (Phaser.Input.Keyboard.JustDown(this.specialKey) || pressedThisFrame);
    this.previousLeftDown = leftDown;
    const specialEvents = updateSpecialAttacks(
      this.soldiers,
      BATTLE_OBSTACLES,
      this.bases,
      time,
      playerSpecialRequested,
    );
    for (const event of specialEvents) this.showSpecialRing(event);
    const activeArrows: ArrowProjectileRuntime[] = [];
    for (const projectile of this.arrowProjectiles) {
      const updated = updateArrowProjectile(
        projectile,
        this.soldiers,
        delta,
        time,
      );
      if (updated.active) activeArrows.push(projectile);
      if (updated.impact) {
        this.showArrowImpactEffect(projectile, updated.impact);
      }
    }
    this.arrowProjectiles = activeArrows;
    updateAttackStates(this.soldiers, this.bases, time, this.result !== null);
    this.result = getBattleResult(this.soldiers, this.bases);
    if (this.result) {
      const snapshot = createPostBattleSnapshot(
        this.result,
        this.soldiers,
        this.bases,
        this.selectedMapCell,
      );
      this.arrowProjectiles = [];
      this.strategistFireZones = [];
      this.clearSpearEffects();
      this.battleEffectRenderer?.destroy();
      this.scene.start("PostBattle", { snapshot });
      return;
    }
    if (!this.result) updateNormalCombatContests(this.soldiers, time);
    this.draw();
  }

  private draw(): void {
    this.graphics.clear();
    const player = this.soldiers.find(
      (soldier) => soldier.controller === "player",
    );
    if (player) {
      this.inspectorRuntime = updateInspectorTarget(
        player,
        this.soldiers,
        this.time.now,
        this.inspectorRuntime,
      );
    }
    if (player && this.time.now < this.rangeDisplayUntil) {
      this.graphics
        .fillStyle(0x9ffcff, 0.08)
        .fillCircle(player.x, player.y, this.rangeDisplayRadius);
      this.graphics
        .lineStyle(2, 0x9ffcff, 0.55)
        .strokeCircle(player.x, player.y, this.rangeDisplayRadius);
    }
    for (const soldier of this.soldiers) {
      const characterSprite = this.characterSprites.get(soldier.id);
      if (soldier.isDead) {
        characterSprite?.setVisible(false);
        continue;
      }
      if (characterSprite && isSpriteUnitType(soldier.unitType)) {
        const renderConfig = getCharacterRenderConfig(soldier.unitType);
        const previous =
          this.characterVisualRuntimes.get(soldier.id) ??
          createCharacterVisualRuntime(soldier, this.time.now);
        const visual = resolveCharacterVisualFrame(
          soldier,
          previous,
          this.time.now,
        );
        this.characterVisualRuntimes.set(soldier.id, visual.runtime);
        const override = this.characterPoseOverrides.get(soldier.id);
        if (override && this.time.now >= override.until)
          this.characterPoseOverrides.delete(soldier.id);
        const frameIndex =
          override && this.time.now < override.until && visual.pose !== "hit"
            ? getCharacterFrameIndex(override.pose, visual.direction)
            : visual.frameIndex;
        characterSprite
          .setVisible(true)
          .setPosition(
            soldier.x + renderConfig.visualOffsetX,
            soldier.y + renderConfig.visualOffsetY,
          )
          .setFrame(frameIndex);
      }
      const attackRadius =
        soldier.combatActionState === "ATTACK_WINDUP"
          ? SOLDIER_RADIUS + 2
          : SOLDIER_RADIUS;
      const soldierColor = soldier.team === "player" ? 0x4e9cff : 0xef5656;
      if (!characterSprite)
        this.graphics
          .fillStyle(soldierColor)
          .fillCircle(soldier.x, soldier.y, attackRadius);
      if (soldier.isConfused) {
        this.graphics
          .lineStyle(2, 0xb77cff, 0.9)
          .beginPath()
          .arc(soldier.x, soldier.y - 29, 5, 0, Math.PI * 1.6)
          .strokePath();
        this.graphics
          .fillStyle(0xe0c5ff, 1)
          .fillCircle(soldier.x + 2, soldier.y - 34, 1.5);
      }
    }
    for (const arrow of this.arrowProjectiles) {
      if (this.atlasArrowProjectiles.has(arrow)) continue;
      const target = this.soldiers.find(
        (soldier) => soldier.id === arrow.targetId,
      );
      const dx = (target?.x ?? arrow.x) - arrow.x;
      const dy = (target?.y ?? arrow.y) - arrow.y;
      const length = Math.hypot(dx, dy) || 1;
      const fx = dx / length;
      const fy = dy / length;
      const px = -fy;
      const py = fx;
      this.graphics
        .lineStyle(2, 0x3b2b20, 1)
        .lineBetween(
          arrow.x - fx * 7,
          arrow.y - fy * 7,
          arrow.x + fx * 7,
          arrow.y + fy * 7,
        );
      this.graphics
        .fillStyle(0x2b211b, 1)
        .fillTriangle(
          arrow.x + fx * 9,
          arrow.y + fy * 9,
          arrow.x + fx * 4 + px * 3,
          arrow.y + fy * 4 + py * 3,
          arrow.x + fx * 4 - px * 3,
          arrow.y + fy * 4 - py * 3,
        );
      if (arrow.technique === "ARCHER_FIRE_ARROW")
        this.graphics
          .fillStyle(0xff6b20, 0.95)
          .fillCircle(arrow.x + fx * 9, arrow.y + fy * 9, 3)
          .fillStyle(0xffd34d, 0.9)
          .fillCircle(arrow.x + fx * 10, arrow.y + fy * 10, 1.5);
      if (arrow.technique === "ARCHER_HOROKU")
        this.graphics
          .fillStyle(0x4a2c20, 1)
          .fillCircle(arrow.x + fx * 7, arrow.y + fy * 7, 4);
    }
    const hovered = this.findPointerStatusSoldier(player);
    const selected = this.soldiers.find(
      (soldier) =>
        soldier.id === this.selectedStatusSoldierId && !soldier.isDead,
    );
    const attackTarget = player
      ? this.soldiers.find(
          (soldier) => soldier.id === player.attackTargetId && !soldier.isDead,
        )
      : undefined;
    const targeted = player
      ? this.soldiers.find(
          (soldier) => soldier.id === player.targetId && !soldier.isDead,
        )
      : undefined;
    const inspected = this.soldiers.find(
      (soldier) =>
        soldier.id === this.inspectorRuntime.targetId && !soldier.isDead,
    );
    // SWF d/atck target drives the right panel. Pointer selection remains an auxiliary fallback only.
    const rightStatus =
      attackTarget ?? targeted ?? inspected ?? selected ?? hovered;
    this.battlePanelUi?.update(
      this.time.now,
      this.soldiers,
      this.bases,
      player,
      rightStatus,
    );
  }

  private handleCommandInput(player: Soldier, time: number): void {
    if (
      player.state !== "NORMAL" ||
      time - this.lastCommandAt < COMMAND_CONFIG.commandCooldownMs
    )
      return;
    let order: TemporaryOrderType | null = null;
    if (Phaser.Input.Keyboard.JustDown(this.commandKeys.A)) {
      issueDefendCommand(player, this.soldiers, time);
      order = "DEFEND_ORDER";
      this.rangeDisplayRadius = COMMAND_CONFIG.defendRadius;
    } else if (Phaser.Input.Keyboard.JustDown(this.commandKeys.S)) {
      issueAdvanceCommand(player, this.soldiers, time);
      order = "ADVANCE";
      this.rangeDisplayRadius = COMMAND_CONFIG.advanceRadius;
    } else if (Phaser.Input.Keyboard.JustDown(this.commandKeys.D)) {
      issueRallyCommand(player, this.soldiers, time);
      order = "RALLY";
      this.rangeDisplayRadius = 0;
    }
    if (!order) return;
    clearConfusionByCommand(player);
    this.lastOrder = order;
    this.lastCommandAt = time;
    this.rangeDisplayUntil =
      this.rangeDisplayRadius > 0 ? time + COMMAND_CONFIG.rangeDisplayMs : 0;
  }

  private updateCamera(player: Soldier): void {
    const camera = this.cameras.main;
    if (this.zoomKeys.out.some((key) => Phaser.Input.Keyboard.JustDown(key)))
      this.targetZoom -= CAMERA_CONFIG.zoomStep;
    if (this.zoomKeys.in.some((key) => Phaser.Input.Keyboard.JustDown(key)))
      this.targetZoom += CAMERA_CONFIG.zoomStep;
    if (this.pendingWheelZoomSteps !== 0) {
      this.targetZoom += this.pendingWheelZoomSteps * CAMERA_CONFIG.zoomStep;
      this.pendingWheelZoomSteps = 0;
    }
    if (Phaser.Input.Keyboard.JustDown(this.zoomKeys.toggle)) {
      this.cameraViewMode = toggleCameraViewMode(this.cameraViewMode);
      this.targetZoom = getViewModeZoom(
        this.cameraViewMode,
        camera.width,
        camera.height,
      );
    }
    if (
      this.zoomKeys.reset.some((key) => Phaser.Input.Keyboard.JustDown(key))
    ) {
      this.cameraViewMode = "COMBAT";
      this.targetZoom = getViewModeZoom("COMBAT", camera.width, camera.height);
    }
    this.targetZoom = clampCameraZoom(this.targetZoom, camera.width);
    const previousZoom = camera.zoom;
    const nextZoom = Phaser.Math.Linear(
      previousZoom,
      this.targetZoom,
      CAMERA_CONFIG.zoomLerp,
    );
    if (Math.abs(nextZoom - previousZoom) > 1e-6) {
      const anchored = getZoomAnchoredScroll(
        { x: camera.scrollX, y: camera.scrollY },
        previousZoom,
        nextZoom,
        player,
        camera.width,
        camera.height,
      );
      camera.setZoom(nextZoom).setScroll(anchored.x, anchored.y);
    } else {
      const scroll = getFollowScroll(
        player.x,
        camera.zoom,
        camera.width,
        camera.height,
      );
      camera.scrollX = Phaser.Math.Linear(
        camera.scrollX,
        scroll.x,
        CAMERA_CONFIG.followLerp,
      );
      camera.scrollY = scroll.y;
    }
    this.battlePanelUi?.updateViewport(camera);
  }

  private findPointerStatusSoldier(
    player: Soldier | undefined,
  ): Soldier | undefined {
    if (!player || this.battlePanelUi?.blocksBattleInput()) return undefined;
    const pointer = this.input.activePointer;
    return this.soldiers
      .filter(
        (soldier) =>
          soldier !== player &&
          !soldier.isDead &&
          soldier.state !== "HEALING" &&
          Math.hypot(soldier.x - pointer.worldX, soldier.y - pointer.worldY) <=
            SOLDIER_RADIUS * 2,
      )
      .sort(
        (a, b) =>
          Math.hypot(a.x - pointer.worldX, a.y - pointer.worldY) -
          Math.hypot(b.x - pointer.worldX, b.y - pointer.worldY),
      )[0];
  }

  private effectReferences(
    action: ActionDefinition,
    role: ActionEffectRole,
    team?: Soldier["team"],
    deferSideTargets = false,
  ): EffectReference[] {
    return selectActionEffectReferences(action, role, team).filter(
      (reference) =>
        !(deferSideTargets && isUnresolvedSideTargetReference(reference)),
    );
  }

  private actionAtlasReady(
    action: ActionDefinition,
    team?: Soldier["team"],
    deferSideTargets = false,
  ): boolean {
    const references = (["caster", "projectile", "hit"] as const).flatMap(
      (role) => this.effectReferences(action, role, team, deferSideTargets),
    );
    return (
      references.length > 0 &&
      references.every((reference) =>
        this.battleEffectRenderer?.canPlay(reference.effect_id),
      )
    );
  }

  private playReferences(
    references: readonly EffectReference[],
    point: { x: number; y: number },
    options: Parameters<BattleEffectRenderer["play"]>[3] = {},
  ): number {
    let started = 0;
    for (const reference of references) {
      if (
        this.battleEffectRenderer?.play(
          reference.effect_id,
          this.time.now,
          point,
          options,
        )
      )
        started += 1;
    }
    return started;
  }

  private playActionRole(
    action: ActionDefinition,
    role: ActionEffectRole,
    point: { x: number; y: number },
    team?: Soldier["team"],
    options: Parameters<BattleEffectRenderer["play"]>[3] = {},
    deferSideTargets = false,
  ): number {
    return this.playReferences(
      this.effectReferences(action, role, team, deferSideTargets),
      point,
      options,
    );
  }

  private soldierPoint(
    id: string,
    fallback?: { x: number; y: number },
  ): { x: number; y: number } | null {
    const soldier = this.soldiers.find((candidate) => candidate.id === id);
    return soldier ? { x: soldier.x, y: soldier.y } : (fallback ?? null);
  }

  private playReferencesAtSoldiers(
    references: readonly EffectReference[],
    ids: readonly string[],
    fallbackById: ReadonlyMap<string, { x: number; y: number }> = new Map(),
  ): number {
    let started = 0;
    for (const id of new Set(ids)) {
      const point = this.soldierPoint(id, fallbackById.get(id));
      if (!point) continue;
      for (const reference of references) {
        const sequence = getEffectSequence(reference.effect_id);
        const played = this.battleEffectRenderer?.play(
          reference.effect_id,
          this.time.now,
          point,
          {
            getRoot: () => this.soldierPoint(id),
            isActive: sequence?.loop
              ? () => {
                  const soldier = this.soldiers.find(
                    (candidate) => candidate.id === id,
                  );
                  return Boolean(
                    soldier && !soldier.isDead && soldier.isConfused,
                  );
                }
              : undefined,
          },
        );
        if (played) started += 1;
      }
    }
    return started;
  }

  private startArrowEffect(projectile: ArrowProjectileRuntime): void {
    this.arrowProjectiles.push(projectile);
    const action = resolveTechniqueActionEffects(projectile.technique);
    const target = this.soldierPoint(projectile.targetId);
    if (!action || !target || !this.actionAtlasReady(action, projectile.team))
      return;
    const arrival = { ...target };
    const started = this.playActionRole(
      action,
      "projectile",
      { x: projectile.startX, y: projectile.startY },
      projectile.team,
      {
        end: arrival,
        travelDurationMs: projectile.durationMs,
        rotateAlongPath: true,
        destroyOnArrival: true,
        persistUntilArrival: true,
      },
    );
    if (started === 0) return;
    this.atlasArrowProjectiles.set(projectile, { arrival });
    this.characterPoseOverrides.set(projectile.shooterId, {
      pose: "attack_2",
      until: this.time.now + projectile.durationMs,
    });
  }

  private showSpecialRing(event: SpecialAttackEvent): void {
    if (event.kind === "ARROW") {
      this.startArrowEffect(event.projectile);
      return;
    }
    if (event.kind === "SPEAR") {
      this.showSpearAttackEffect(event);
      return;
    }
    if (event.kind === "NINJA") {
      this.showNinjaAttackEffect(event);
      return;
    }
    if (event.kind === "GENERAL") {
      this.showGeneralAttackEffect(event);
      return;
    }
    if (event.kind === "STRATEGIST") {
      this.showStrategistAttackEffect(event);
      return;
    }
    if (event.kind === "MOSA") {
      this.showMosaAttackEffect(event);
      return;
    }
    if (event.kind === "CAVALRY") {
      this.showCavalryAttackEffect(event);
      return;
    }
    if (event.kind === "GUN") {
      this.showGunAttackEffect(event);
      return;
    }
    const color = event.team === "player" ? 0x4e9cff : 0xef5656;
    const ring = this.add
      .circle(event.x, event.y, SPECIAL_ATTACK_CONFIG.radius, 0x000000, 0)
      .setStrokeStyle(3, color, 0.9)
      .setScale(0.15)
      .setDepth(1);
    this.tweens.add({
      targets: ring,
      scale: 1,
      alpha: 0,
      duration: SPECIAL_ATTACK_CONFIG.ringDurationMs,
      ease: "Quad.Out",
      onComplete: () => ring.destroy(),
    });
  }

  private showCavalryAttackEffect(
    event: Extract<SpecialAttackEvent, { kind: "CAVALRY" }>,
  ): void {
    const action = resolveTechniqueActionEffects("CAVALRY_CHARGE");
    if (action && this.actionAtlasReady(action, event.team)) {
      this.playActionRole(
        action,
        "caster",
        { x: event.x, y: event.y },
        event.team,
      );
      return;
    }
    const ring = this.add
      .circle(
        event.x,
        event.y,
        SPECIAL_ATTACK_CONFIG.radius * CAVALRY_CONFIG.chargeRadiusMultiplier,
        0x8b3f24,
        0.08,
      )
      .setStrokeStyle(5, 0xa64e2d, 0.9)
      .setScale(0.15)
      .setDepth(1);
    this.tweens.add({
      targets: ring,
      scale: 1,
      alpha: 0,
      duration: CAVALRY_CONFIG.chargeVisualDurationMs,
      ease: "Quad.Out",
      onComplete: () => ring.destroy(),
    });
  }

  private showSpearAttackEffect(
    event: Extract<SpecialAttackEvent, { kind: "SPEAR" }>,
  ): void {
    const action = resolveTechniqueActionEffects(event.technique);
    if (!action) return;
    if (!actionHasIndependentEffects(action)) return;
    if (this.actionAtlasReady(action, event.team)) {
      this.playActionRole(
        action,
        "caster",
        { x: event.x, y: event.y },
        event.team,
      );
      return;
    }
    if (event.technique === "ASHIGARU_SPEAR_STRIKE")
      this.showSpearStrikeGlow(event);
    else {
      const color = event.team === "player" ? 0x4e9cff : 0xef5656;
      const ring = this.add
        .circle(event.x, event.y, SPECIAL_ATTACK_CONFIG.radius, 0x000000, 0)
        .setStrokeStyle(3, color, 0.9)
        .setScale(0.15)
        .setDepth(1);
      this.tweens.add({
        targets: ring,
        scale: 1,
        alpha: 0,
        duration: SPECIAL_ATTACK_CONFIG.ringDurationMs,
        ease: "Quad.Out",
        onComplete: () => ring.destroy(),
      });
    }
  }

  private showMosaAttackEffect(
    event: Extract<SpecialAttackEvent, { kind: "MOSA" }>,
  ): void {
    const action = resolveTechniqueActionEffects(event.technique);
    if (!action) return;
    if (!actionHasIndependentEffects(action)) return;
    if (this.actionAtlasReady(action, event.team)) {
      this.playActionRole(
        action,
        "caster",
        { x: event.x, y: event.y },
        event.team,
      );
      return;
    }
    const teamColor = event.team === "player" ? 0x63b8ff : 0xff7064;
    if (event.technique === "MOSA_SENPUU") {
      const slash = this.add
        .arc(event.x, event.y, event.radius, -70, 70, false, teamColor, 0.12)
        .setStrokeStyle(7, 0xf5e5b5, 0.9)
        .setRotation(Math.atan2(event.facingY, event.facingX))
        .setScale(0.35)
        .setDepth(1.8);
      this.tweens.add({
        targets: slash,
        scale: 1,
        alpha: 0,
        duration: MOSA_CONFIG.senpuuVisualDurationMs,
        ease: "Quad.Out",
        onComplete: () => slash.destroy(),
      });
      return;
    }
    const kijin = event.technique === "MOSA_KIJIN";
    const ring = this.add
      .circle(
        event.x,
        event.y,
        event.radius,
        kijin ? 0x7d2f20 : teamColor,
        kijin ? 0.12 : 0.06,
      )
      .setStrokeStyle(kijin ? 7 : 5, kijin ? 0xb74c2f : teamColor, 0.92)
      .setScale(0.16)
      .setDepth(1.7);
    this.tweens.add({
      targets: ring,
      scale: 1,
      angle: kijin ? 55 : 90,
      alpha: 0,
      duration: kijin
        ? MOSA_CONFIG.kijinVisualDurationMs
        : MOSA_CONFIG.musouVisualDurationMs,
      ease: "Quad.Out",
      onComplete: () => ring.destroy(),
    });
  }

  private showStrategistAttackEffect(
    event: Extract<SpecialAttackEvent, { kind: "STRATEGIST" }>,
  ): void {
    const isFireTechnique = event.technique in STRATEGIST_CONFIG.fireDiameterUnits;
    if (event.fireZone) this.strategistFireZones.push(event.fireZone);
    const action = resolveTechniqueActionEffects(event.technique);
    if (action && this.actionAtlasReady(action, event.team)) {
      const casterPoint = this.soldierPoint(event.attackerId, {
        x: event.x,
        y: event.y,
      })!;
      this.playActionRole(action, "caster", casterPoint, event.team, {
        getRoot: () => this.soldierPoint(event.attackerId),
      });
      const hitIds = isFireTechnique
        ? event.victimIds
        : event.healed.length > 0
          ? event.healed.map((heal) => heal.targetId)
          : event.confusedIds;
      this.playReferencesAtSoldiers(
        this.effectReferences(action, "hit", event.team),
        hitIds,
      );
      return;
    }
    if (isFireTechnique) {
      if (event.fireZone) {
        const ground = this.add
        .circle(event.x, event.y, event.radius, 0xff5b20, 0.14)
        .setStrokeStyle(2, 0xffb02e, 0.75)
        .setDepth(1.1);
      const flames = this.add.container(event.x, event.y).setDepth(1.2);
      const count = Math.max(3, Math.ceil(event.radius / 10));
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * Math.PI * 2;
        const distance = event.radius * (0.25 + (i % 3) * 0.22);
        flames.add(
          this.add.triangle(
            Math.cos(angle) * distance,
            Math.sin(angle) * distance,
            -5,
            7,
            0,
            -9 - (i % 4),
            5,
            7,
            i % 2 ? 0xff7b21 : 0xffc12e,
            0.72,
          ),
        );
      }
      this.tweens.add({
        targets: flames,
        scaleY: 1.12,
        alpha: 0.78,
        duration: 130,
        yoyo: true,
        repeat: Math.max(
          1,
          Math.floor(STRATEGIST_CONFIG.fireZoneDurationMs / 260) - 1,
        ),
        onComplete: () => {
          flames.destroy();
          ground.destroy();
        },
      });
      }
      for (const id of event.victimIds) this.showFireVictimEffect(id);
      return;
    }
    const sorcery = event.technique === "STRATEGIST_SORCERY";
    if (event.technique === "STRATEGIST_FALSE_REPORT" || sorcery) {
      const pulse = this.add
        .circle(event.x, event.y, event.radius, 0, 0)
        .setStrokeStyle(sorcery ? 5 : 3, sorcery ? 0xd47cff : 0x9b61cc, 0.9)
        .setScale(0.08)
        .setDepth(1.6);
      this.tweens.add({
        targets: pulse,
        scale: 1,
        alpha: 0,
        duration: STRATEGIST_CONFIG.pulseDurationMs,
        onComplete: () => pulse.destroy(),
      });
      return;
    }
    const pulse = this.add
      .circle(event.x, event.y, event.radius, 0, 0)
      .setStrokeStyle(3, 0xb9ffbd, 0.85)
      .setScale(0.05)
      .setDepth(1.5);
    this.tweens.add({
      targets: pulse,
      scale: 1,
      alpha: 0,
      duration: STRATEGIST_CONFIG.pulseDurationMs,
      onComplete: () => pulse.destroy(),
    });
    for (const heal of event.healed) {
      const target = this.soldiers.find(
        (soldier) => soldier.id === heal.targetId,
      );
      if (!target) continue;
      const label = this.add
        .text(target.x, target.y - 28, "+1", {
          fontSize: "13px",
          color: "#b9ffbd",
          stroke: "#162016",
          strokeThickness: 2,
        })
        .setOrigin(0.5)
        .setDepth(2.5);
      this.tweens.add({
        targets: label,
        y: label.y - 12,
        alpha: 0,
        duration: 500,
        onComplete: () => label.destroy(),
      });
    }
  }

  private showGeneralAttackEffect(
    event: Extract<SpecialAttackEvent, { kind: "GENERAL" }>,
  ): void {
    const action = resolveTechniqueActionEffects(event.technique);
    if (action && this.actionAtlasReady(action, event.team)) {
      this.playActionRole(
        action,
        "caster",
        { x: event.x, y: event.y },
        event.team,
        {
          getRoot: () => this.soldierPoint(event.attackerId),
        },
      );
      const hitIds =
        event.healed.length > 0
          ? event.healed.map((heal) => heal.targetId)
          : event.recipientIds;
      this.playReferencesAtSoldiers(
        this.effectReferences(action, "hit", event.team),
        hitIds,
      );
      return;
    }
    const accent = event.team === "player" ? 0x4e9cff : 0xef5656;
    if (event.technique !== "GENERAL_HEAL") {
      const outer = this.add
        .circle(event.x, event.y, event.commandRadius, 0, 0)
        .setStrokeStyle(4, 0xe4bb58, 0.9)
        .setScale(0.05)
        .setDepth(1.5);
      const inner = this.add
        .circle(event.x, event.y, event.commandRadius, 0, 0)
        .setStrokeStyle(2, 0xffffff, 0.9)
        .setScale(0.02)
        .setDepth(1.6);
      const teamRing = this.add
        .circle(event.x, event.y, event.commandRadius, 0, 0)
        .setStrokeStyle(2, accent, 0.7)
        .setScale(0.08)
        .setDepth(1.4);
      this.tweens.add({
        targets: [outer, teamRing],
        scale: 1,
        alpha: 0,
        duration: GENERAL_CONFIG.commandPulseDurationMs,
        ease: "Quad.Out",
        onComplete: () => {
          outer.destroy();
          teamRing.destroy();
        },
      });
      this.tweens.add({
        targets: inner,
        scale: 1,
        alpha: 0,
        delay: 70,
        duration: GENERAL_CONFIG.commandPulseDurationMs,
        ease: "Quad.Out",
        onComplete: () => inner.destroy(),
      });
      for (const id of event.recipientIds) {
        const target = this.soldiers.find((soldier) => soldier.id === id);
        if (!target) continue;
        const spark = this.add
          .circle(target.x, target.y - 24, 5, 0xffedaa, 0.95)
          .setStrokeStyle(2, 0xffffff, 1)
          .setDepth(2.5);
        this.tweens.add({
          targets: spark,
          y: spark.y - 8,
          scale: 1.8,
          alpha: 0,
          duration: GENERAL_CONFIG.recipientSparkDurationMs,
          onComplete: () => spark.destroy(),
        });
      }
    }
    if (event.technique === "GENERAL_HEROIC") {
      const ring = this.add
        .circle(event.x, event.y, GENERAL_CONFIG.heroicRadius, 0, 0)
        .setStrokeStyle(3, accent, 0.9)
        .setScale(0.15)
        .setDepth(1.7);
      this.tweens.add({
        targets: ring,
        scale: 1,
        alpha: 0,
        duration: SPECIAL_ATTACK_CONFIG.ringDurationMs,
        onComplete: () => ring.destroy(),
      });
    }
    if (event.technique === "GENERAL_HEAL") {
      const pulse = this.add
        .circle(event.x, event.y, GENERAL_CONFIG.healRadius, 0, 0)
        .setStrokeStyle(3, 0xb9ffbd, 0.85)
        .setScale(0.05)
        .setDepth(1.5);
      this.tweens.add({
        targets: pulse,
        scale: 1,
        alpha: 0,
        duration: GENERAL_CONFIG.healPulseDurationMs,
        onComplete: () => pulse.destroy(),
      });
      for (const heal of event.healed) {
        const target = this.soldiers.find(
          (soldier) => soldier.id === heal.targetId,
        );
        if (!target) continue;
        const label = this.add
          .text(target.x, target.y - 28, `+${heal.amount}`, {
            fontSize: "13px",
            color: "#b9ffbd",
            stroke: "#162016",
            strokeThickness: 2,
          })
          .setOrigin(0.5)
          .setDepth(2.5);
        this.tweens.add({
          targets: label,
          y: label.y - 12,
          alpha: 0,
          duration: 500,
          onComplete: () => label.destroy(),
        });
      }
    }
  }

  private showNinjaAttackEffect(
    event: Extract<SpecialAttackEvent, { kind: "NINJA" }>,
  ): void {
    const action = resolveTechniqueActionEffects(event.technique);
    if (action && !actionHasIndependentEffects(action)) {
      for (const forced of event.forcedEvents)
        this.showNinjaAttackEffect(forced);
      return;
    }
    if (action && this.actionAtlasReady(action, event.team, true)) {
      this.playActionRole(
        action,
        "caster",
        { x: event.fromX, y: event.fromY },
        event.team,
        {
          getRoot: () => this.soldierPoint(event.attackerId),
        },
        true,
      );
      const hitReferences = this.effectReferences(
        action,
        "hit",
        event.team,
        true,
      );
      for (const reference of hitReferences) {
        const basis =
          getEffectSequence(reference.effect_id)?.unit_mapping_basis ?? "";
        const ids = /recovery\/result visual/i.test(basis)
          ? event.healResults.map((heal) => heal.targetId)
          : event.victimIds;
        this.playReferencesAtSoldiers([reference], ids);
      }
      for (const forced of event.forcedEvents)
        this.showNinjaAttackEffect(forced);
      return;
    }
    const trail = this.add
      .line(
        0,
        0,
        event.fromX,
        event.fromY,
        event.x,
        event.y,
        event.team === "player" ? 0x5ca9e8 : 0xe86d6d,
        0.38,
      )
      .setOrigin(0)
      .setLineWidth(8)
      .setDepth(1.4);
    this.tweens.add({
      targets: trail,
      alpha: 0,
      duration: 180,
      onComplete: () => trail.destroy(),
    });
    for (const victimId of event.victimIds)
      this.showBombardmentVictimSmoke(
        victimId,
        GUN_CONFIG.bombardmentVictimSmokeDurationMs,
      );
    if (event.barrierActivated) {
      const ring = this.add
        .circle(
          event.x,
          event.y,
          NINJA_CONFIG.barrierSupportRadius,
          0x9f72d4,
          0.06,
        )
        .setStrokeStyle(3, 0xd9c4ff, 0.75)
        .setScale(0.2)
        .setDepth(1.3);
      this.tweens.add({
        targets: ring,
        scale: 1,
        alpha: 0,
        duration: NINJA_CONFIG.barrierRingDurationMs,
        onComplete: () => ring.destroy(),
      });
    }
    for (const heal of event.healResults) {
      const target = this.soldiers.find(
        (soldier) => soldier.id === heal.targetId,
      );
      if (!target) continue;
      const label = this.add
        .text(target.x, target.y - 28, `+${heal.amount}`, {
          fontSize: "13px",
          color: "#b9ffbd",
          stroke: "#162016",
          strokeThickness: 2,
        })
        .setOrigin(0.5)
        .setDepth(2.5);
      this.tweens.add({
        targets: label,
        y: label.y - 12,
        alpha: 0,
        duration: 500,
        onComplete: () => label.destroy(),
      });
    }
    for (const forced of event.forcedEvents) this.showNinjaAttackEffect(forced);
  }

  private showSpearStrikeGlow(
    event: Extract<SpecialAttackEvent, { kind: "SPEAR" }>,
  ): void {
    const color = event.team === "player" ? 0x69c5ff : 0xff7777;
    const startX = event.x + event.facingX * 22;
    const startY = event.y + event.facingY * 22;
    const endX = event.x + event.facingX * 43;
    const endY = event.y + event.facingY * 43;
    const glow = this.add
      .line(0, 0, startX, startY, endX, endY, color, 0.48)
      .setOrigin(0)
      .setLineWidth(9)
      .setDepth(1.7);
    const core = this.add
      .line(0, 0, startX, startY, endX, endY, 0xffffff, 1)
      .setOrigin(0)
      .setLineWidth(3)
      .setDepth(1.8);
    this.spearEffectObjects.push(glow, core);
    this.tweens.add({
      targets: [glow, core],
      alpha: 0,
      duration: ASHIGARU_CONFIG.spearTipGlowDurationMs,
      onUpdate: () => {
        const soldier = this.soldiers.find(
          (candidate) => candidate.id === event.attackerId,
        );
        if (soldier?.isDead) {
          glow.destroy();
          core.destroy();
        }
      },
      onComplete: () => {
        glow.destroy();
        core.destroy();
        this.spearEffectObjects = this.spearEffectObjects.filter(
          (object) => object !== glow && object !== core,
        );
      },
    });
  }

  private clearSpearEffects(): void {
    for (const object of this.spearEffectObjects) object.destroy();
    this.spearEffectObjects = [];
  }

  private showArrowImpactEffect(
    projectile: ArrowProjectileRuntime,
    impact: ArrowImpactEvent,
  ): void {
    const atlasState = this.atlasArrowProjectiles.get(projectile);
    const action = resolveTechniqueActionEffects(projectile.technique);
    if (atlasState && action) {
      const affectedIds = [
        ...new Set([...impact.flameVictimIds, ...impact.brownSmokeVictimIds]),
      ];
      const fallbacks = new Map<string, { x: number; y: number }>();
      fallbacks.set(impact.targetId, atlasState.arrival);
      this.playReferencesAtSoldiers(
        this.effectReferences(action, "hit", projectile.team),
        affectedIds,
        fallbacks,
      );
      return;
    }
    this.showArrowImpact(impact.x, impact.y, impact.defended);
    for (const victimId of impact.flameVictimIds)
      this.showFireVictimEffect(victimId);
    for (const victimId of impact.brownSmokeVictimIds)
      this.showBombardmentVictimSmoke(
        victimId,
        GUN_CONFIG.bombardmentVictimSmokeDurationMs,
      );
  }

  private showStrategistFireZoneHit(victimId: string): void {
    const zone = this.strategistFireZones.find((candidate) =>
      candidate.damagedSoldierIds.has(victimId),
    );
    const owner = zone
      ? this.soldiers.find((soldier) => soldier.id === zone.ownerId)
      : undefined;
    const action = owner
      ? resolveTechniqueActionEffects(owner.technique)
      : null;
    if (owner && action && this.actionAtlasReady(action, owner.team)) {
      const point = this.soldierPoint(victimId);
      if (point) this.playActionRole(action, "hit", point, owner.team);
      return;
    }
    this.showFireVictimEffect(victimId);
  }

  private showArrowImpact(x: number, y: number, defended: boolean): void {
    const flash = this.add
      .circle(x, y, 5, defended ? 0xd8f2ff : 0xffefad, 0.9)
      .setDepth(2);
    this.tweens.add({
      targets: flash,
      scale: 2,
      alpha: 0,
      duration: ARCHER_CONFIG.impactFlashDurationMs,
      onComplete: () => flash.destroy(),
    });
  }

  private showFireVictimEffect(victimId: string): void {
    const victim = this.soldiers.find((soldier) => soldier.id === victimId);
    if (!victim) return;
    const flames = this.add.container(victim.x, victim.y).setDepth(1.6);
    for (let index = 0; index < 6; index += 1) {
      const x = ((index % 3) - 1) * 6;
      const y = index < 3 ? 3 : -5;
      flames.add(
        this.add.triangle(
          x,
          y,
          0,
          8,
          3,
          -5 - (index % 2) * 3,
          6,
          8,
          index % 2 ? 0xff7b21 : 0xffb52e,
          0.78,
        ),
      );
    }
    let tracking = { victimSoldierId: victimId, x: victim.x, y: victim.y };
    this.tweens.add({
      targets: flames,
      alpha: 0.75,
      scaleY: 1.15,
      duration: 120,
      yoyo: true,
      repeat: Math.max(0, Math.floor(ARCHER_CONFIG.flameDurationMs / 240) - 1),
      onUpdate: () => {
        tracking = updateTrackedSmoke(tracking, this.soldiers);
        flames.setPosition(tracking.x, tracking.y);
      },
      onComplete: () =>
        this.tweens.add({
          targets: flames,
          alpha: 0,
          duration: 100,
          onUpdate: () => {
            tracking = updateTrackedSmoke(tracking, this.soldiers);
            flames.setPosition(tracking.x, tracking.y);
          },
          onComplete: () => flames.destroy(),
        }),
    });
  }

  private showGunAttackEffect(
    event: Extract<SpecialAttackEvent, { kind: "GUN" }>,
  ): void {
    const attacker = this.soldiers.find(
      (soldier) => soldier.id === event.attackerId,
    );
    const action =
      attacker?.unitType === "TEPPOU"
        ? resolveTechniqueActionEffects(attacker.technique)
        : null;
    if (attacker && action && this.actionAtlasReady(action, event.team)) {
      const now = this.time.now;
      let projectileStarted = false;
      let hitStarted = false;
      const arrival = { x: event.targetX, y: event.targetY };
      const hitReferences = event.bombardmentVictimIds.includes(event.targetId)
        ? action.effects.hit.filter((reference) => !reference.conditional)
        : [];
      for (const reference of action.effects.projectile) {
        if (reference.conditional) continue;
        const sequence = getEffectSequence(reference.effect_id);
        if (!sequence) continue;
        projectileStarted =
          this.battleEffectRenderer?.play(
            reference.effect_id,
            now,
            { x: event.x, y: event.y },
            {
              end: arrival,
              travelDurationMs:
                BATTLE_EFFECT_RENDER_CONFIG.projectileTravelDurationMs,
              rotateAlongPath: true,
              destroyOnArrival: true,
              onArrive: (arrivalTime) => {
                if (hitStarted) return;
                hitStarted = true;
                for (const hitReference of hitReferences) {
                  this.battleEffectRenderer?.play(
                    hitReference.effect_id,
                    arrivalTime,
                    arrival,
                  );
                }
              },
            },
          ) === true || projectileStarted;
      }
      if (projectileStarted) {
        this.characterPoseOverrides.set(event.attackerId, {
          pose: "attack_2",
          until: now + BATTLE_EFFECT_RENDER_CONFIG.projectileTravelDurationMs,
        });
      }
      if (projectileStarted) return;
    }
    const color = event.team === "player" ? 0xbde8ff : 0xffc4c4;
    const line = this.add
      .line(0, 0, event.x, event.y, event.targetX, event.targetY, color, 0.95)
      .setOrigin(0)
      .setLineWidth(2)
      .setDepth(2);
    this.tweens.add({
      targets: line,
      alpha: 0,
      duration: GUN_CONFIG.shotLineDurationMs,
      onComplete: () => line.destroy(),
    });
    for (let index = 0; index < 3; index += 1) {
      const smoke = this.add
        .circle(
          event.x + (index - 1) * 3,
          event.y + (index % 2 ? -3 : 2),
          3 + index,
          0xe7e7e7,
          0.75,
        )
        .setDepth(2);
      this.tweens.add({
        targets: smoke,
        scale: 2.5,
        alpha: 0,
        duration: GUN_CONFIG.smokeDurationMs,
        onComplete: () => smoke.destroy(),
      });
    }
    const flash = this.add
      .circle(
        event.shooterX,
        event.shooterY,
        SOLDIER_RADIUS + 7,
        0xffffff,
        0.75,
      )
      .setDepth(2);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: GUN_CONFIG.shooterFlashDurationMs,
      onComplete: () => flash.destroy(),
    });
    for (const victimId of event.bombardmentVictimIds)
      this.showBombardmentVictimSmoke(
        victimId,
        event.bombardmentSmokeDurationMs,
      );
  }

  private showBombardmentVictimSmoke(
    victimId: string,
    durationMs: number,
  ): void {
    const victim = this.soldiers.find((soldier) => soldier.id === victimId);
    if (!victim) return;
    const cloud = this.add.container(victim.x, victim.y).setDepth(1.5);
    const radius = GUN_CONFIG.bombardmentVictimSmokeRadius;
    for (let index = 0; index < 7; index += 1) {
      const angle = (index * Math.PI * 2) / 7;
      cloud.add(
        this.add.circle(
          Math.cos(angle) * radius * 0.35,
          Math.sin(angle) * radius * 0.3,
          radius * (0.55 + (index % 3) * 0.12),
          index % 2 ? 0x70452d : 0x4f3427,
          0.62,
        ),
      );
    }
    let tracking = { victimSoldierId: victimId, x: victim.x, y: victim.y };
    this.tweens.add({
      targets: cloud,
      scale: 1.18,
      duration: 100,
      yoyo: true,
      hold: Math.max(0, durationMs - 300),
      onUpdate: () => {
        tracking = updateTrackedSmoke(tracking, this.soldiers);
        cloud.setPosition(tracking.x, tracking.y);
      },
      onComplete: () =>
        this.tweens.add({
          targets: cloud,
          alpha: 0,
          duration: 100,
          onUpdate: () => {
            tracking = updateTrackedSmoke(tracking, this.soldiers);
            cloud.setPosition(tracking.x, tracking.y);
          },
          onComplete: () => cloud.destroy(),
        }),
    });
  }
}

function updateAiTargetsForPlayer(player: Soldier, soldiers: Soldier[]): void {
  let nearest: Soldier | undefined;
  let distance = Number.POSITIVE_INFINITY;
  for (const soldier of soldiers) {
    if (
      soldier.isDead ||
      soldier.team === player.team ||
      soldier.state === "HEALING"
    )
      continue;
    const candidateDistance = Math.hypot(
      player.x - soldier.x,
      player.y - soldier.y,
    );
    if (isWithinNormalContact(player, soldier) && candidateDistance < distance) {
      nearest = soldier;
      distance = candidateDistance;
    }
  }
  player.targetId = nearest?.id ?? null;
}
