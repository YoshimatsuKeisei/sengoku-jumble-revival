import admiralBlueUrl from "../../../assets/characters/admiral/admiral_blue.png";
import admiralOrangeUrl from "../../../assets/characters/admiral/admiral_orange.png";
import admiralRedUrl from "../../../assets/characters/admiral/admiral_red.png";
import archerBlueUrl from "../../../assets/characters/archer/archer_blue.png";
import archerOrangeUrl from "../../../assets/characters/archer/archer_orange.png";
import archerRedUrl from "../../../assets/characters/archer/archer_red.png";
import ashigaruBlueUrl from "../../../assets/characters/ashigaru/ashigaru_blue.png";
import ashigaruOrangeUrl from "../../../assets/characters/ashigaru/ashigaru_orange.png";
import ashigaruRedUrl from "../../../assets/characters/ashigaru/ashigaru_red.png";
import cavalryBlueUrl from "../../../assets/characters/cavalry/cavalry_blue.png";
import cavalryOrangeUrl from "../../../assets/characters/cavalry/cavalry_orange.png";
import cavalryRedUrl from "../../../assets/characters/cavalry/cavalry_red.png";
import mosaBlueUrl from "../../../assets/characters/mosa/mosa_blue.png";
import mosaOrangeUrl from "../../../assets/characters/mosa/mosa_orange.png";
import mosaRedUrl from "../../../assets/characters/mosa/mosa_red.png";
import ninjaBlueUrl from "../../../assets/characters/ninja/ninja_blue.png";
import ninjaOrangeUrl from "../../../assets/characters/ninja/ninja_orange.png";
import ninjaRedUrl from "../../../assets/characters/ninja/ninja_red.png";
import strategistBlueUrl from "../../../assets/characters/strategist/strategist_blue.png";
import strategistOrangeUrl from "../../../assets/characters/strategist/strategist_orange.png";
import strategistRedUrl from "../../../assets/characters/strategist/strategist_red.png";
import teppouBlueUrl from "../../../assets/characters/teppou/teppou_blue.png";
import teppouOrangeUrl from "../../../assets/characters/teppou/teppou_orange.png";
import teppouRedUrl from "../../../assets/characters/teppou/teppou_red.png";
import type { Soldier, Team, UnitType } from "../types";

export type CharacterAssetType =
  | "admiral" | "archer" | "ashigaru" | "cavalry"
  | "mosa" | "ninja" | "strategist" | "teppou";
export type SpriteUnitType = Exclude<UnitType, "PROTOTYPE">;
export type EightDirection =
  | "north" | "northeast" | "east" | "southeast"
  | "south" | "southwest" | "west" | "northwest";
export type CharacterVisualVariant = "blue" | "red" | "orange";
export type CharacterPose = "walk_1" | "walk_2" | "walk_3" | "hit" | "attack_1" | "attack_2" | "guard";

interface CharacterSpritesheetDefinition {
  key: string;
  url: string;
}

export const CHARACTER_FRAME_WIDTH = 165;
export const CHARACTER_FRAME_HEIGHT = 120;
export const CHARACTER_SHEET_COLUMNS = 8;
export const CHARACTER_SHEET_ROWS = 7;
export const CHARACTER_FRAME_COUNT = CHARACTER_SHEET_COLUMNS * CHARACTER_SHEET_ROWS;

export const UNIT_TYPE_TO_CHARACTER_ASSET: Record<SpriteUnitType, CharacterAssetType> = {
  TEPPOU: "teppou",
  CAVALRY: "cavalry",
  ARCHER: "archer",
  ASHIGARU: "ashigaru",
  NINJA: "ninja",
  GENERAL: "admiral",
  STRATEGIST: "strategist",
  MOSA: "mosa",
};

export const CHARACTER_SPRITESHEET_DEFINITIONS: Record<
  CharacterAssetType,
  Record<CharacterVisualVariant, CharacterSpritesheetDefinition>
> = {
  admiral: {
    blue: { key: "character-admiral-blue", url: admiralBlueUrl },
    red: { key: "character-admiral-red", url: admiralRedUrl },
    orange: { key: "character-admiral-orange", url: admiralOrangeUrl },
  },
  archer: {
    blue: { key: "character-archer-blue", url: archerBlueUrl },
    red: { key: "character-archer-red", url: archerRedUrl },
    orange: { key: "character-archer-orange", url: archerOrangeUrl },
  },
  ashigaru: {
    blue: { key: "character-ashigaru-blue", url: ashigaruBlueUrl },
    red: { key: "character-ashigaru-red", url: ashigaruRedUrl },
    orange: { key: "character-ashigaru-orange", url: ashigaruOrangeUrl },
  },
  cavalry: {
    blue: { key: "character-cavalry-blue", url: cavalryBlueUrl },
    red: { key: "character-cavalry-red", url: cavalryRedUrl },
    orange: { key: "character-cavalry-orange", url: cavalryOrangeUrl },
  },
  mosa: {
    blue: { key: "character-mosa-blue", url: mosaBlueUrl },
    red: { key: "character-mosa-red", url: mosaRedUrl },
    orange: { key: "character-mosa-orange", url: mosaOrangeUrl },
  },
  ninja: {
    blue: { key: "character-ninja-blue", url: ninjaBlueUrl },
    red: { key: "character-ninja-red", url: ninjaRedUrl },
    orange: { key: "character-ninja-orange", url: ninjaOrangeUrl },
  },
  strategist: {
    blue: { key: "character-strategist-blue", url: strategistBlueUrl },
    red: { key: "character-strategist-red", url: strategistRedUrl },
    orange: { key: "character-strategist-orange", url: strategistOrangeUrl },
  },
  teppou: {
    blue: { key: "character-teppou-blue", url: teppouBlueUrl },
    red: { key: "character-teppou-red", url: teppouRedUrl },
    orange: { key: "character-teppou-orange", url: teppouOrangeUrl },
  },
};

export const CHARACTER_SPRITESHEETS = Object.values(CHARACTER_SPRITESHEET_DEFINITIONS)
  .flatMap((variants) => Object.values(variants));

export const CHARACTER_DIRECTION_COLUMNS: Record<EightDirection, number> = {
  west: 0,
  northwest: 1,
  north: 2,
  northeast: 3,
  east: 4,
  southeast: 5,
  south: 6,
  southwest: 7,
};

export const CHARACTER_POSE_ROWS: Record<CharacterPose, number> = {
  walk_1: 0,
  walk_2: 1,
  walk_3: 2,
  hit: 3,
  attack_1: 4,
  attack_2: 5,
  guard: 6,
};

export const CHARACTER_RENDER_CONFIG = {
  scale: 1,
  originX: 64 / CHARACTER_FRAME_WIDTH,
  originY: 98 / CHARACTER_FRAME_HEIGHT,
  visualOffsetX: 0,
  visualOffsetY: 0,
  depth: -0.05,
  walkFrameDurationMs: 140,
  movementEpsilon: 0.01,
} as const;

const CHARACTER_RENDER_OVERRIDES: Partial<Record<CharacterAssetType, { originY: number }>> = {
  cavalry: { originY: 102 / CHARACTER_FRAME_HEIGHT },
};

export function getCharacterRenderConfig(unitType: SpriteUnitType) {
  const assetType = UNIT_TYPE_TO_CHARACTER_ASSET[unitType];
  return { ...CHARACTER_RENDER_CONFIG, ...CHARACTER_RENDER_OVERRIDES[assetType] };
}

export interface CharacterVisualRuntime {
  lastX: number;
  lastY: number;
  lastDirection: EightDirection;
  lastUpdatedAt: number;
  walkElapsedMs: number;
  wasMoving: boolean;
}

export interface CharacterVisualFrame {
  runtime: CharacterVisualRuntime;
  direction: EightDirection;
  pose: CharacterPose;
  frameIndex: number;
  moving: boolean;
}

export function isSpriteUnitType(unitType: UnitType): unitType is SpriteUnitType {
  return unitType in UNIT_TYPE_TO_CHARACTER_ASSET;
}

export function characterVariantForTeam(team: Team): Exclude<CharacterVisualVariant, "orange"> {
  return team === "player" ? "blue" : "red";
}

export function getCharacterTextureKey(
  unitType: SpriteUnitType,
  team: Team,
  explicitVariant?: CharacterVisualVariant,
): string {
  const assetType = UNIT_TYPE_TO_CHARACTER_ASSET[unitType];
  return CHARACTER_SPRITESHEET_DEFINITIONS[assetType][explicitVariant ?? characterVariantForTeam(team)].key;
}

export function directionFromFacing(
  facingX: number,
  facingY: number,
  previousDirection: EightDirection,
): EightDirection {
  if (Math.hypot(facingX, facingY) <= Number.EPSILON) return previousDirection;
  const sector = ((Math.round(Math.atan2(facingY, facingX) / (Math.PI / 4)) % 8) + 8) % 8;
  const directionsFromEast: readonly EightDirection[] = [
    "east", "southeast", "south", "southwest", "west", "northwest", "north", "northeast",
  ];
  return directionsFromEast[sector];
}

export function getCharacterFrameIndex(pose: CharacterPose, direction: EightDirection): number {
  return CHARACTER_POSE_ROWS[pose] * CHARACTER_SHEET_COLUMNS + CHARACTER_DIRECTION_COLUMNS[direction];
}

function attackPose(
  soldier: Pick<Soldier, "combatActionState" | "attackStartedAt" | "attackHitAt">,
  now: number,
): CharacterPose | null {
  if (soldier.combatActionState === "ATTACK_RECOVERY") return "attack_1";
  if (soldier.combatActionState !== "ATTACK_WINDUP") return null;
  if (soldier.attackStartedAt === null || soldier.attackHitAt === null) return "attack_1";
  return now < (soldier.attackStartedAt + soldier.attackHitAt) / 2 ? "attack_1" : "attack_2";
}

export function selectCharacterPose(
  soldier: Pick<Soldier,
    "reactionState" | "combatActionState" | "attackStartedAt" | "attackHitAt" | "combatFeedbackMarker" | "combatFeedbackUntil"
  >,
  moving: boolean,
  walkFrame: 0 | 1 | 2,
  now: number,
): CharacterPose {
  if (soldier.reactionState === "HIT_STUN") return "hit";
  const attacking = attackPose(soldier, now);
  if (attacking) return attacking;
  if (soldier.combatFeedbackMarker === "S" && now < soldier.combatFeedbackUntil) return "guard";
  if (!moving) return "walk_1";
  return (["walk_1", "walk_2", "walk_3"] as const)[walkFrame];
}

export function createCharacterVisualRuntime(
  soldier: Pick<Soldier, "x" | "y" | "facingX" | "facingY">,
  now = 0,
): CharacterVisualRuntime {
  return {
    lastX: soldier.x,
    lastY: soldier.y,
    lastDirection: directionFromFacing(soldier.facingX, soldier.facingY, "south"),
    lastUpdatedAt: now,
    walkElapsedMs: 0,
    wasMoving: false,
  };
}

export function resolveCharacterVisualFrame(
  soldier: Soldier,
  previous: CharacterVisualRuntime,
  now: number,
): CharacterVisualFrame {
  const moving = Math.hypot(soldier.x - previous.lastX, soldier.y - previous.lastY) > CHARACTER_RENDER_CONFIG.movementEpsilon;
  const elapsed = moving && previous.wasMoving
    ? previous.walkElapsedMs + Math.max(0, now - previous.lastUpdatedAt)
    : 0;
  const walkFrame = Math.floor(elapsed / CHARACTER_RENDER_CONFIG.walkFrameDurationMs) % 3 as 0 | 1 | 2;
  const direction = directionFromFacing(soldier.facingX, soldier.facingY, previous.lastDirection);
  const pose = selectCharacterPose(soldier, moving, walkFrame, now);
  const runtime: CharacterVisualRuntime = {
    lastX: soldier.x,
    lastY: soldier.y,
    lastDirection: direction,
    lastUpdatedAt: now,
    walkElapsedMs: moving ? elapsed : 0,
    wasMoving: moving,
  };
  return { runtime, direction, pose, frameIndex: getCharacterFrameIndex(pose, direction), moving };
}
