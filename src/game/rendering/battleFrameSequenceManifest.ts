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
}

const sourceUrls = import.meta.glob("../../../assets/battle/**/*.png", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;

const DEFINITIONS: readonly BattleFrameSequenceDefinition[] = [
  { id: "critical_retreat", directory: "status-effects/critical_retreat/frames", frameCount: 9, fps: 24, loop: false, holdFrameIndex: 8 },
  { id: "battle_out_player", directory: "status-effects/battle-out/player", frameCount: 3, fps: 24, loop: true },
  { id: "battle_out_enemy", directory: "status-effects/battle-out/enemy", frameCount: 3, fps: 24, loop: true },
  { id: "command_retreat", directory: "player-commands/retreat", frameCount: 14, fps: 24, loop: false },
  { id: "command_charge", directory: "player-commands/charge", frameCount: 14, fps: 24, loop: false },
  { id: "command_gather", directory: "player-commands/gather", frameCount: 14, fps: 24, loop: false },
  { id: "target_retreat", directory: "command_target_marks/A_shubi/frames", frameCount: 14, fps: 24, loop: false, holdFrameIndex: 4 },
  { id: "target_charge", directory: "command_target_marks/S_ttgk/frames", frameCount: 14, fps: 24, loop: false, holdFrameIndex: 4 },
  { id: "target_gather", directory: "command_target_marks/D_shugo/frames", frameCount: 14, fps: 24, loop: false, holdFrameIndex: 4 },
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
