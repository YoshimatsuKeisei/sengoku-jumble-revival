import Phaser from "phaser";
import uiManifestJson from "../../../assets/post_battle_ui/config/post_battle_ui_manifest.json";
import {
  getCharacterFrameIndex,
  getCharacterRenderConfig,
  getCharacterTextureKey,
  isSpriteUnitType,
} from "./characterSprite";
import {
  ENEMY_DETAIL_LAYOUT,
  resolveEnemyDetailActionSlots,
  resolveEnemyDetailSpecialSlots,
  resolveEnemyDetailTechnique,
  resolveEnemyDetailUnitType,
  type EnemyDetailTextPlacement,
} from "../postBattle/enemyDetailMapping";
import { createPostBattleImage } from "../postBattle/postBattleAssets";
import type {
  CommonSpecialAbilityId,
  RareSpecialAbilityId,
  Strategy,
  Team,
  UnitTechnique,
  UnitType,
} from "../types";

const ui = uiManifestJson;
const DETAIL_TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  color: "#cec0a9",
  fontFamily: "sans-serif",
  fontSize: "16px",
};

export interface SoldierDetailViewModel {
  readonly name: string;
  readonly unitType: UnitType;
  readonly technique: UnitTechnique;
  readonly strategy: Strategy;
  readonly maxHp: number;
  readonly skill: number;
  readonly speed: number;
  readonly attack: number;
  readonly defense: number;
  readonly stipend: number;
  readonly specialAbilities: readonly CommonSpecialAbilityId[];
  readonly rareSpecialAbilities: readonly RareSpecialAbilityId[];
}

export interface SoldierDetailRenderOptions {
  readonly team: Team;
  readonly showGrowthLabel?: boolean;
  readonly blockBackgroundInput?: boolean;
}

/**
 * Renders the exact SWF-derived st01/st02 soldier panel body. Both formation
 * and post-battle detail screens use this function so their slot bitmaps,
 * coordinates, portrait crop and dynamic fields cannot drift apart.
 */
export function createSoldierDetailDisplay(
  scene: Phaser.Scene,
  soldier: SoldierDetailViewModel,
  options: SoldierDetailRenderOptions,
): Phaser.GameObjects.GameObject[] {
  const objects: Phaser.GameObjects.GameObject[] = [];
  const add = <T extends Phaser.GameObjects.GameObject>(object: T): T => {
    objects.push(object);
    return object;
  };
  const image = (id: string | number, x: number, y: number, depth = 0): Phaser.GameObjects.Image =>
    add(createPostBattleImage(scene, id, x, y).setDepth(depth));
  const text = (placement: EnemyDetailTextPlacement, value: string | number): Phaser.GameObjects.Text =>
    add(scene.add.text(placement.x, placement.y, String(value), {
      ...DETAIL_TEXT_STYLE,
      align: placement.align,
    }).setFixedSize(placement.width, placement.height).setDepth(20));

  const config = ui.screens.enemy_detail;
  const panel = image(config.panel.asset, config.panel.x, config.panel.y);
  if (options.blockBackgroundInput) panel.setInteractive();

  if (isSpriteUnitType(soldier.unitType)) {
    const portrait = config.portrait_anchor;
    const render = getCharacterRenderConfig(soldier.unitType);
    const sprite = add(scene.add.sprite(
      portrait.x,
      portrait.y,
      getCharacterTextureKey(soldier.unitType, options.team),
      getCharacterFrameIndex("walk_1", "south"),
    ).setOrigin(render.originX, render.originY).setScale(portrait.swf_scale).setDepth(5));
    const maskShape = add(scene.add.graphics()
      .fillStyle(0xffffff)
      .fillRect(20, 43, 103, 83)
      .setVisible(false));
    sprite.setMask(maskShape.createGeometryMask());
  }

  text(ENEMY_DETAIL_LAYOUT.name, soldier.name);
  text(ENEMY_DETAIL_LAYOUT.hp, soldier.maxHp);
  text(ENEMY_DETAIL_LAYOUT.skill, soldier.skill);
  text(ENEMY_DETAIL_LAYOUT.speed, soldier.speed);
  text(ENEMY_DETAIL_LAYOUT.attack, soldier.attack);
  text(ENEMY_DETAIL_LAYOUT.defense, soldier.defense);
  text(ENEMY_DETAIL_LAYOUT.stipend, soldier.stipend);

  const unitType = resolveEnemyDetailUnitType(soldier.unitType);
  if (unitType) image(unitType.bitmapId, ENEMY_DETAIL_LAYOUT.unitType.tx, ENEMY_DETAIL_LAYOUT.unitType.ty, 10);
  else add(scene.add.text(
    ENEMY_DETAIL_LAYOUT.unitType.tx + 26,
    ENEMY_DETAIL_LAYOUT.unitType.ty + 5,
    "--",
    DETAIL_TEXT_STYLE,
  ).setOrigin(0.5, 0).setDepth(20));
  const technique = resolveEnemyDetailTechnique(soldier.technique);
  if (technique) image(technique.bitmapId, ENEMY_DETAIL_LAYOUT.technique.tx, ENEMY_DETAIL_LAYOUT.technique.ty, 10);
  else add(scene.add.text(
    ENEMY_DETAIL_LAYOUT.technique.tx + 26,
    ENEMY_DETAIL_LAYOUT.technique.ty + 5,
    "--",
    DETAIL_TEXT_STYLE,
  ).setOrigin(0.5, 0).setDepth(20));
  if (options.showGrowthLabel) {
    image(2709, ENEMY_DETAIL_LAYOUT.growthLabel.tx, ENEMY_DETAIL_LAYOUT.growthLabel.ty, 10);
  }
  for (const slot of resolveEnemyDetailActionSlots(soldier.strategy)) {
    image(slot.bitmapId, slot.x, slot.y, 10);
  }
  for (const slot of resolveEnemyDetailSpecialSlots(soldier.specialAbilities, soldier.rareSpecialAbilities)) {
    image(slot.bitmapId, slot.x, slot.y, 10);
  }
  return objects;
}
