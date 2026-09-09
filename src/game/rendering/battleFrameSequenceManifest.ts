import type { Soldier, Team, TemporaryOrderType, UnitTechnique } from "../types";

export const BATTLE_FRAME_SEQUENCE_FPS = 24;

export type BattleFrameSequenceId =
  | "critical_retreat"
  | "battle_out_player"
  | "battle_out_enemy"
  | "command_retreat"
  | "command_charge"
  | "command_gather"
  | "target_retreat"
  | "target_charge"
  | "target_gather"
  | "caster_muso_cyan"
  | "caster_oni_magenta"
  | "caster_kiba_magenta"
  | "aux_gri"
  | "aux_charge_player"
  | "aux_charge_enemy"
  | "aux_barrier_player"
  | "aux_barrier_enemy";

export interface BattleFrameSequenceDefinition {
  id: BattleFrameSequenceId;
  directory: string;
  frameCount: number;
  fps: number;
  loop: boolean;
  holdFrameIndex?: number;
  /**
   * Source-coordinate correction from the extracted PNG canvas center to the
   * raw Sprite664 child placement. The effect root itself is the soldier.
   */
  renderOffsetSourceUnits?: { x: number; y: number };
  frameRenderOffsetsSourceUnits?: readonly { x: number; y: number }[];
}

export interface SwfBattleMarkerGeometry {
  role: "critical" | "issuer" | "recipient";
  parentSpriteId: number;
  parentFrame: number;
  parentLabel: string;
  spriteId: number;
  bitmapId: number;
  bitmapSizeSourceUnits: { width: number; height: number };
  parentPlacementSourceUnits: { x: number; y: number };
  renderOffsetSourceUnits: { x: number; y: number };
  frameCount: number;
  actionStopFrame?: number;
  finalFrameRemovesMark?: boolean;
  frameRenderOffsetsSourceUnits?: readonly { x: number; y: number }[];
}

export const SWF_RECIPIENT_MARK_FRAME_CENTER_OFFSETS_SOURCE_UNITS = [
  { x: 18, y: -23.5 },
  { x: 20, y: -25.5 },
  { x: 22, y: -27.5 },
  { x: 23, y: -28.5 },
  { x: 24, y: -29.5 },
  { x: 24, y: -29.5 },
  { x: 21, y: -26.5 },
  { x: 19, y: -24.5 },
  { x: 18, y: -23.5 },
] as const;

/**
 * Directly recovered from Sprite664 in sgjbgm.swf.
 *
 * The parent placement is the true child-movie-clip coordinate relative to
 * the soldier's `as` origin. `renderOffsetSourceUnits` is the texture-center
 * offset used by the revival renderer after accounting for either the fixed
 * extraction canvas (critical/issuer) or the raw 18x19 recipient bitmap.
 */
export const SWF_BATTLE_MARK_GEOMETRY: Partial<
  Record<BattleFrameSequenceId, SwfBattleMarkerGeometry>
> = {
  critical_retreat: {
    role: "critical",
    parentSpriteId: 664,
    parentFrame: 34,
    parentLabel: "chp",
    spriteId: 625,
    bitmapId: 622,
    bitmapSizeSourceUnits: { width: 19, height: 16 },
    parentPlacementSourceUnits: { x: -9, y: -27 },
    renderOffsetSourceUnits: { x: 0, y: -20 },
    frameCount: 9,
    actionStopFrame: 9,
  },
  command_gather: {
    role: "issuer",
    parentSpriteId: 664,
    parentFrame: 29,
    parentLabel: "shugo",
    spriteId: 605,
    bitmapId: 602,
    bitmapSizeSourceUnits: { width: 49, height: 54 },
    parentPlacementSourceUnits: { x: -19, y: -21 },
    renderOffsetSourceUnits: { x: -19, y: -37 },
    frameCount: 14,
    finalFrameRemovesMark: true,
  },
  command_charge: {
    role: "issuer",
    parentSpriteId: 664,
    parentFrame: 30,
    parentLabel: "ttgk",
    spriteId: 609,
    bitmapId: 606,
    bitmapSizeSourceUnits: { width: 49, height: 54 },
    parentPlacementSourceUnits: { x: -19, y: -21 },
    renderOffsetSourceUnits: { x: -19, y: -37 },
    frameCount: 14,
    finalFrameRemovesMark: true,
  },
  command_retreat: {
    role: "issuer",
    parentSpriteId: 664,
    parentFrame: 31,
    parentLabel: "shubi",
    spriteId: 613,
    bitmapId: 610,
    bitmapSizeSourceUnits: { width: 48, height: 54 },
    parentPlacementSourceUnits: { x: -19, y: -21 },
    renderOffsetSourceUnits: { x: -19, y: -37 },
    frameCount: 14,
    finalFrameRemovesMark: true,
  },
  target_gather: {
    role: "recipient",
    parentSpriteId: 664,
    parentFrame: 22,
    parentLabel: "szch",
    spriteId: 540,
    bitmapId: 537,
    bitmapSizeSourceUnits: { width: 18, height: 19 },
    parentPlacementSourceUnits: { x: 17, y: -14 },
    renderOffsetSourceUnits: SWF_RECIPIENT_MARK_FRAME_CENTER_OFFSETS_SOURCE_UNITS[0],
    frameRenderOffsetsSourceUnits: SWF_RECIPIENT_MARK_FRAME_CENTER_OFFSETS_SOURCE_UNITS,
    frameCount: 9,
    actionStopFrame: 9,
  },
  target_charge: {
    role: "recipient",
    parentSpriteId: 664,
    parentFrame: 23,
    parentLabel: "sztt",
    spriteId: 544,
    bitmapId: 541,
    bitmapSizeSourceUnits: { width: 18, height: 19 },
    parentPlacementSourceUnits: { x: 17, y: -14 },
    renderOffsetSourceUnits: SWF_RECIPIENT_MARK_FRAME_CENTER_OFFSETS_SOURCE_UNITS[0],
    frameRenderOffsetsSourceUnits: SWF_RECIPIENT_MARK_FRAME_CENTER_OFFSETS_SOURCE_UNITS,
    frameCount: 9,
    actionStopFrame: 9,
  },
  target_retreat: {
    role: "recipient",
    parentSpriteId: 664,
    parentFrame: 24,
    parentLabel: "szsh",
    spriteId: 548,
    bitmapId: 545,
    bitmapSizeSourceUnits: { width: 18, height: 19 },
    parentPlacementSourceUnits: { x: 17, y: -14 },
    renderOffsetSourceUnits: SWF_RECIPIENT_MARK_FRAME_CENTER_OFFSETS_SOURCE_UNITS[0],
    frameRenderOffsetsSourceUnits: SWF_RECIPIENT_MARK_FRAME_CENTER_OFFSETS_SOURCE_UNITS,
    frameCount: 9,
    actionStopFrame: 9,
  },
};

const sourceUrls = import.meta.glob("../../../assets/battle/**/*.png", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;

const DEFINITIONS: readonly BattleFrameSequenceDefinition[] = [
  {
    id: "critical_retreat",
    directory: "status-effects/critical_retreat/frames",
    frameCount: 9,
    fps: 24,
    loop: false,
    holdFrameIndex: 8,
    renderOffsetSourceUnits: SWF_BATTLE_MARK_GEOMETRY.critical_retreat!.renderOffsetSourceUnits,
  },
  { id: "battle_out_player", directory: "status-effects/battle-out/player", frameCount: 3, fps: 24, loop: true },
  { id: "battle_out_enemy", directory: "status-effects/battle-out/enemy", frameCount: 3, fps: 24, loop: true },
  {
    id: "command_retreat",
    directory: "player-commands/retreat",
    frameCount: 14,
    fps: 24,
    loop: false,
    renderOffsetSourceUnits: SWF_BATTLE_MARK_GEOMETRY.command_retreat!.renderOffsetSourceUnits,
  },
  {
    id: "command_charge",
    directory: "player-commands/charge",
    frameCount: 14,
    fps: 24,
    loop: false,
    renderOffsetSourceUnits: SWF_BATTLE_MARK_GEOMETRY.command_charge!.renderOffsetSourceUnits,
  },
  {
    id: "command_gather",
    directory: "player-commands/gather",
    frameCount: 14,
    fps: 24,
    loop: false,
    renderOffsetSourceUnits: SWF_BATTLE_MARK_GEOMETRY.command_gather!.renderOffsetSourceUnits,
  },
  {
    id: "target_retreat",
    directory: "command-target-raw/szsh",
    frameCount: 9,
    fps: 24,
    loop: false,
    holdFrameIndex: 8,
    renderOffsetSourceUnits: SWF_BATTLE_MARK_GEOMETRY.target_retreat!.renderOffsetSourceUnits,
    frameRenderOffsetsSourceUnits: SWF_RECIPIENT_MARK_FRAME_CENTER_OFFSETS_SOURCE_UNITS,
  },
  {
    id: "target_charge",
    directory: "command-target-raw/sztt",
    frameCount: 9,
    fps: 24,
    loop: false,
    holdFrameIndex: 8,
    renderOffsetSourceUnits: SWF_BATTLE_MARK_GEOMETRY.target_charge!.renderOffsetSourceUnits,
    frameRenderOffsetsSourceUnits: SWF_RECIPIENT_MARK_FRAME_CENTER_OFFSETS_SOURCE_UNITS,
  },
  {
    id: "target_gather",
    directory: "command-target-raw/szch",
    frameCount: 9,
    fps: 24,
    loop: false,
    holdFrameIndex: 8,
    renderOffsetSourceUnits: SWF_BATTLE_MARK_GEOMETRY.target_gather!.renderOffsetSourceUnits,
    frameRenderOffsetsSourceUnits: SWF_RECIPIENT_MARK_FRAME_CENTER_OFFSETS_SOURCE_UNITS,
  },
  { id: "caster_muso_cyan", directory: "special-attacks/caster_flash/fr_muso_cyan_shared", frameCount: 13, fps: 24, loop: false },
  { id: "caster_oni_magenta", directory: "special-attacks/caster_flash/fr_oni_magenta_technique", frameCount: 13, fps: 24, loop: false },
  { id: "caster_kiba_magenta", directory: "special-attacks/caster_flash/fr_kiba_magenta_technique", frameCount: 13, fps: 24, loop: false },
  { id: "aux_gri", directory: "special-attacks/auxiliary_effects/as_gri", frameCount: 15, fps: 24, loop: false },
  { id: "aux_charge_player", directory: "special-attacks/auxiliary_effects/ally_as_ttgk", frameCount: 14, fps: 24, loop: false },
  { id: "aux_charge_enemy", directory: "special-attacks/auxiliary_effects/enemy_as_ettgk", frameCount: 14, fps: 24, loop: false },
  { id: "aux_barrier_player", directory: "special-attacks/auxiliary_effects/ally_as_sztt", frameCount: 9, fps: 24, loop: false },
  { id: "aux_barrier_enemy", directory: "special-attacks/auxiliary_effects/enemy_as_esztt", frameCount: 9, fps: 24, loop: false },
] as const;

function frameName(index: number): string {
  return `frame_${String(index + 1).padStart(3, "0")}.png`;
}

export function getBattleFrameTextureKey(id: BattleFrameSequenceId, frameIndex: number): string {
  return `battle-frame:${id}:${frameIndex}`;
}

export const BATTLE_FRAME_SEQUENCE_DEFINITIONS = DEFINITIONS.map((definition) => {
  const frames = Array.from({ length: definition.frameCount }, (_, index) => {
    const suffix = `/assets/battle/${definition.directory}/${frameName(index)}`;
    const entry = Object.entries(sourceUrls).find(([path]) => path.replaceAll("\\", "/").endsWith(suffix));
    if (!entry) throw new Error(`Missing battle frame asset: ${suffix}`);
    return { key: getBattleFrameTextureKey(definition.id, index), url: entry[1] };
  });
  return { ...definition, frames };
});

export const BATTLE_FRAME_SEQUENCE_ASSETS = BATTLE_FRAME_SEQUENCE_DEFINITIONS.flatMap((definition) => definition.frames);

export function getBattleFrameSequence(id: BattleFrameSequenceId) {
  return BATTLE_FRAME_SEQUENCE_DEFINITIONS.find((definition) => definition.id === id) ?? null;
}

export function getBattleFrameRenderOffsetSourceUnits(
  id: BattleFrameSequenceId,
  frameIndex = 0,
): { x: number; y: number } {
  const definition = getBattleFrameSequence(id);
  return definition?.frameRenderOffsetsSourceUnits?.[frameIndex]
    ?? definition?.renderOffsetSourceUnits
    ?? { x: 0, y: 0 };
}

export interface BattleFrameSequenceSample {
  frameIndex: number;
  ended: boolean;
}

export function sampleBattleFrameSequence(id: BattleFrameSequenceId, elapsedMs: number): BattleFrameSequenceSample | null {
  const definition = getBattleFrameSequence(id);
  if (!definition) return null;
  const rawFrame = Math.floor(Math.max(0, elapsedMs) * definition.fps / 1000);
  if (definition.holdFrameIndex !== undefined && rawFrame >= definition.holdFrameIndex) {
    return { frameIndex: definition.holdFrameIndex, ended: false };
  }
  const ended = !definition.loop && rawFrame >= definition.frameCount;
  return {
    frameIndex: definition.loop ? rawFrame % definition.frameCount : Math.min(rawFrame, definition.frameCount - 1),
    ended,
  };
}

export function commandSequenceFor(order: Extract<TemporaryOrderType, "DEFEND_ORDER" | "ADVANCE" | "RALLY">): BattleFrameSequenceId {
  return order === "DEFEND_ORDER" ? "command_retreat" : order === "ADVANCE" ? "command_charge" : "command_gather";
}

export function battleOutSequenceFor(team: Team): BattleFrameSequenceId {
  return team === "player" ? "battle_out_player" : "battle_out_enemy";
}

export function shouldShowCriticalRetreat(
  soldier: Pick<Soldier, "isDead" | "state">,
): boolean {
  return !soldier.isDead
    && (soldier.state === "EMERGENCY_RETREAT" || soldier.state === "HEALING");
}

export function shouldShowTreatmentHealerMark(healerId: string, soldiers: readonly Soldier[]): boolean {
  return soldiers.some((patient) => !patient.isDead
    && patient.state === "EMERGENCY_RETREAT"
    && patient.recoveryTargetKind === "HEALER"
    && patient.recoveryHealerId === healerId);
}

export function specialCasterSequencesFor(technique: UnitTechnique): readonly BattleFrameSequenceId[] {
  switch (technique) {
    case "ASHIGARU_SPEAR_TECHNIQUE":
    case "MOSA_MUSOU": return ["caster_muso_cyan"];
    case "GENERAL_HEROIC": return ["caster_muso_cyan", "aux_gri"];
    case "GENERAL_FURIOUS": return ["caster_oni_magenta", "aux_gri"];
    case "MOSA_KIJIN": return ["caster_oni_magenta"];
    case "CAVALRY_CHARGE": return ["caster_kiba_magenta"];
    default: return [];
  }
}

export function temporaryOrderSequenceFor(order: TemporaryOrderType, team: Team): BattleFrameSequenceId | null {
  if (order === "DEFEND_ORDER") return "target_retreat";
  if (order === "ADVANCE") return "target_charge";
  if (order === "RALLY") return "target_gather";
  if (order === "JINTO_CHARGE") return team === "player" ? "aux_charge_player" : "aux_charge_enemy";
  if (order === "NINJA_BARRIER_CHARGE") return team === "player" ? "aux_barrier_player" : "aux_barrier_enemy";
  return null;
}
