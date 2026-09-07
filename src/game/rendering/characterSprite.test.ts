import { describe, expect, it } from "vitest";
import { createSoldier } from "../entities/Soldier";
import type { Team } from "../types";
import {
  CHARACTER_DIRECTION_COLUMNS,
  CHARACTER_FRAME_COUNT,
  CHARACTER_FRAME_HEIGHT,
  CHARACTER_FRAME_WIDTH,
  CHARACTER_POSE_ROWS,
  CHARACTER_RENDER_CONFIG,
  CHARACTER_SHEET_COLUMNS,
  CHARACTER_SHEET_ROWS,
  CHARACTER_SPRITESHEET_DEFINITIONS,
  CHARACTER_SPRITESHEETS,
  UNIT_TYPE_TO_CHARACTER_ASSET,
  characterVariantForTeam,
  createCharacterVisualRuntime,
  directionFromFacing,
  getBattleOutFrameIndex,
  getCharacterFrameIndex,
  getCharacterRenderConfig,
  getCharacterTextureKey,
  isSpriteUnitType,
  resolveCharacterVisualFrame,
  type CharacterAssetType,
  type CharacterVisualVariant,
  type SpriteUnitType,
} from "./characterSprite";

const expectedAssets: Record<SpriteUnitType, CharacterAssetType> = {
  TEPPOU: "teppou",
  CAVALRY: "cavalry",
  ARCHER: "archer",
  ASHIGARU: "ashigaru",
  NINJA: "ninja",
  GENERAL: "admiral",
  STRATEGIST: "strategist",
  MOSA: "mosa",
};

describe("common character spritesheet contract", () => {
  it("defines a 165x120, 8x7, 56-frame sheet", () => {
    expect({ width: CHARACTER_FRAME_WIDTH, height: CHARACTER_FRAME_HEIGHT }).toEqual({ width: 165, height: 120 });
    expect({ columns: CHARACTER_SHEET_COLUMNS, rows: CHARACTER_SHEET_ROWS, frames: CHARACTER_FRAME_COUNT })
      .toEqual({ columns: 8, rows: 7, frames: 56 });
  });

  it("registers all eight character types in all three visual variants", () => {
    expect(UNIT_TYPE_TO_CHARACTER_ASSET).toEqual(expectedAssets);
    expect(CHARACTER_SPRITESHEETS).toHaveLength(24);
    for (const [unitType, assetType] of Object.entries(expectedAssets) as Array<[SpriteUnitType, CharacterAssetType]>) {
      expect(isSpriteUnitType(unitType)).toBe(true);
      for (const variant of ["blue", "red", "orange"] as const) {
        expect(getCharacterTextureKey(unitType, "player", variant))
          .toBe(CHARACTER_SPRITESHEET_DEFINITIONS[assetType][variant].key);
      }
    }
    expect(isSpriteUnitType("PROTOTYPE")).toBe(false);
  });

  it("assigns blue/red by team and never assigns orange implicitly", () => {
    const teams: readonly Team[] = ["player", "enemy"];
    const variants: readonly CharacterVisualVariant[] = ["blue", "red", "orange"];
    expect(characterVariantForTeam("player")).toBe("blue");
    expect(characterVariantForTeam("enemy")).toBe("red");
    for (const unitType of Object.keys(expectedAssets) as SpriteUnitType[]) {
      for (const team of teams) {
        const key = getCharacterTextureKey(unitType, team);
        expect(key).toContain(`-${characterVariantForTeam(team)}`);
        expect(key).not.toContain(`-${variants[2]}`);
      }
    }
  });

  it("maps all eight facing vectors to their dedicated columns", () => {
    expect(directionFromFacing(-1, 0, "south")).toBe("west");
    expect(directionFromFacing(-1, -1, "south")).toBe("northwest");
    expect(directionFromFacing(0, -1, "south")).toBe("north");
    expect(directionFromFacing(1, -1, "south")).toBe("northeast");
    expect(directionFromFacing(1, 0, "south")).toBe("east");
    expect(directionFromFacing(1, 1, "south")).toBe("southeast");
    expect(directionFromFacing(0, 1, "north")).toBe("south");
    expect(directionFromFacing(-1, 1, "north")).toBe("southwest");
    expect(CHARACTER_DIRECTION_COLUMNS).toEqual({
      west: 0, northwest: 1, north: 2, northeast: 3,
      east: 4, southeast: 5, south: 6, southwest: 7,
    });
  });

  it("computes frameIndex as row * 8 + column", () => {
    expect(getCharacterFrameIndex("walk_1", "west")).toBe(0);
    expect(getCharacterFrameIndex("walk_1", "south")).toBe(6);
    expect(getCharacterFrameIndex("walk_2", "southeast")).toBe(13);
    expect(getCharacterFrameIndex("hit", "west")).toBe(24);
    expect(getCharacterFrameIndex("attack_1", "east")).toBe(36);
    expect(getCharacterFrameIndex("attack_2", "north")).toBe(42);
    expect(getCharacterFrameIndex("guard", "southwest")).toBe(55);
    expect(CHARACTER_POSE_ROWS).toEqual({ walk_1: 0, walk_2: 1, walk_3: 2, hit: 3, attack_1: 4, attack_2: 5, guard: 6 });
  });

  it("keeps the archer baseline and only adjusts cavalry's measured foot origin", () => {
    expect(getCharacterRenderConfig("ARCHER")).toMatchObject(CHARACTER_RENDER_CONFIG);
    expect(getCharacterRenderConfig("CAVALRY").originY).toBe(102 / CHARACTER_FRAME_HEIGHT);
  });

  it("uses the closed-feet walk baseline in the team battle-out direction", () => {
    expect(getBattleOutFrameIndex("player"))
      .toBe(getCharacterFrameIndex("walk_1", "west"));
    expect(getBattleOutFrameIndex("enemy"))
      .toBe(getCharacterFrameIndex("walk_1", "east"));
  });
});

describe("common character visual frame resolution", () => {
  it("holds the last facing and uses walk_1 while stopped", () => {
    const soldier = createSoldier("a", "player", "ai", 100, 100);
    soldier.facingX = 1;
    soldier.facingY = 0;
    const runtime = createCharacterVisualRuntime(soldier, 0);
    soldier.facingX = 0;
    soldier.facingY = 0;
    const visual = resolveCharacterVisualFrame(soldier, runtime, 100);
    expect(visual.direction).toBe("east");
    expect(visual.pose).toBe("walk_1");
    expect(visual.frameIndex).toBe(4);
  });

  it("loops walk_1, walk_2, walk_3 independently while moving", () => {
    const soldier = createSoldier("a", "player", "ai", 100, 100);
    soldier.facingX = 1;
    soldier.facingY = 1;
    let runtime = createCharacterVisualRuntime(soldier, 0);
    const poses = [];
    for (const now of [1, 1 + CHARACTER_RENDER_CONFIG.walkFrameDurationMs, 1 + CHARACTER_RENDER_CONFIG.walkFrameDurationMs * 2]) {
      soldier.x += 1;
      const visual = resolveCharacterVisualFrame(soldier, runtime, now);
      poses.push(visual.pose);
      runtime = visual.runtime;
    }
    expect(poses).toEqual(["walk_1", "walk_2", "walk_3"]);
  });

  it("uses hit during HIT_STUN without changing direction", () => {
    const soldier = createSoldier("a", "player", "ai", 100, 100);
    soldier.facingX = -1;
    soldier.facingY = -1;
    soldier.reactionState = "HIT_STUN";
    const visual = resolveCharacterVisualFrame(soldier, createCharacterVisualRuntime(soldier), 10);
    expect(visual.direction).toBe("northwest");
    expect(visual.pose).toBe("hit");
    expect(visual.frameIndex).toBe(25);
  });

  it("uses attack_1 then attack_2 across existing WINDUP and attack_1 during RECOVERY", () => {
    const soldier = createSoldier("a", "player", "ai", 100, 100);
    soldier.combatActionState = "ATTACK_WINDUP";
    soldier.attackStartedAt = 0;
    soldier.attackHitAt = 180;
    const runtime = createCharacterVisualRuntime(soldier);
    expect(resolveCharacterVisualFrame(soldier, runtime, 40).pose).toBe("attack_1");
    expect(resolveCharacterVisualFrame(soldier, runtime, 100).pose).toBe("attack_2");
    soldier.combatActionState = "ATTACK_RECOVERY";
    expect(resolveCharacterVisualFrame(soldier, runtime, 200).pose).toBe("attack_1");
  });

  it("uses guard only while the existing successful-defense marker is active", () => {
    const soldier = createSoldier("a", "player", "ai", 100, 100);
    soldier.combatFeedbackMarker = "S";
    soldier.combatFeedbackUntil = 250;
    const runtime = createCharacterVisualRuntime(soldier);
    expect(resolveCharacterVisualFrame(soldier, runtime, 200).pose).toBe("guard");
    expect(resolveCharacterVisualFrame(soldier, runtime, 251).pose).toBe("walk_1");
  });
});
