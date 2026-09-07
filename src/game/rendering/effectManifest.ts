import actionEffectMapJson from "../../../assets/effect/runtime/action_effect_map.json";
import effectAtlasJson from "../../../assets/effect/runtime/effect_atlas.json";
import effectSequencesJson from "../../../assets/effect/runtime/effect_sequences.json";
import casterAtlasUrl from "../../../assets/effect/runtime/atlases/caster_0.png";
import hitAtlasUrl from "../../../assets/effect/runtime/atlases/hit_0.png";
import projectileAtlasUrl from "../../../assets/effect/runtime/atlases/projectile_0.png";
import type { UnitTechnique } from "../types";

export interface EffectMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

export interface EffectReference {
  effect_id: string;
  conditional: boolean;
}

export interface ActionEffects {
  caster: EffectReference[];
  projectile: EffectReference[];
  hit: EffectReference[];
}

export interface ActionDefinition {
  action_code: number;
  action_name: string;
  character_action_frame_range: string | null;
  effects: ActionEffects;
}

interface ActionEffectMap {
  units: Record<string, { actions: Record<string, ActionDefinition> }>;
}

export interface EffectSequenceFrame {
  index: number;
  bitmap_id: number;
  region_id: string;
  atlas_id: string;
  width: number;
  height: number;
}

export interface EffectTimelineRow {
  swf_frame: number;
  output_frame_index: number | null;
  bitmap_id: number | null;
  matrix?: EffectMatrix;
}

export interface EffectSequence {
  effect_id: string;
  role: "caster" | "projectile" | "hit";
  runtime_enabled: boolean;
  frames: EffectSequenceFrame[];
  timeline_playback: EffectTimelineRow[];
  fps: number;
  total_swf_frames: number;
  duration_ms: number;
  loop: boolean;
  selector_placement_matrix: EffectMatrix | null;
  unit_mapping_basis: string;
}

interface EffectSequencesManifest {
  fps: number;
  effects: Record<string, EffectSequence>;
}

export interface EffectAtlasPage {
  atlas_id: string;
  role: "caster" | "projectile" | "hit";
  file: string;
  width: number;
  height: number;
}

export interface EffectAtlasRegion {
  region_id: string;
  bitmap_id: number;
  role: "caster" | "projectile" | "hit";
  atlas_id: string;
  atlas_file: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
  trimmed: boolean;
}

interface EffectAtlasManifest {
  atlases: EffectAtlasPage[];
  regions: Record<string, EffectAtlasRegion>;
}

export interface EffectAtlasAsset extends EffectAtlasPage {
  key: string;
  url: string;
}

const actionEffectMap = actionEffectMapJson as unknown as ActionEffectMap;
const effectSequences = effectSequencesJson as unknown as EffectSequencesManifest;
const effectAtlas = effectAtlasJson as unknown as EffectAtlasManifest;

const atlasUrlsByManifestPath: Record<string, string> = {
  "atlases/caster_0.png": casterAtlasUrl,
  "atlases/projectile_0.png": projectileAtlasUrl,
  "atlases/hit_0.png": hitAtlasUrl,
};

export const EFFECT_ATLAS_ASSETS: EffectAtlasAsset[] = effectAtlas.atlases.flatMap((atlas) => {
  const url = atlasUrlsByManifestPath[atlas.file];
  return url ? [{ ...atlas, key: `effect-atlas-${atlas.atlas_id}`, url }] : [];
});

export function resolveActionEffects(unitType: string, actionCode: number): ActionDefinition | null {
  return actionEffectMap.units[unitType]?.actions[String(actionCode)] ?? null;
}

export const UNIT_ACTION_EFFECTS: ReadonlyArray<{ unitType: string; action: ActionDefinition }> =
  Object.entries(actionEffectMap.units).flatMap(([unitType, unit]) =>
    Object.values(unit.actions).map((action) => ({ unitType, action })));

export const UNIT_EFFECT_IDS = UNIT_ACTION_EFFECTS.flatMap(({ action }) => [
  ...action.effects.caster,
  ...action.effects.projectile,
  ...action.effects.hit,
]).filter((effect) => !effect.conditional).map((effect) => effect.effect_id);

export const UNIT_ATLAS_ASSETS = getRequiredAtlasAssets(UNIT_EFFECT_IDS);

export function getEffectSequence(effectId: string): EffectSequence | null {
  const sequence = effectSequences.effects[effectId];
  return sequence?.runtime_enabled ? sequence : null;
}

export function getEffectAtlasRegion(bitmapId: number): EffectAtlasRegion | null {
  return effectAtlas.regions[String(bitmapId)] ?? null;
}

export function getEffectAtlasRegions(atlasId: string): EffectAtlasRegion[] {
  return Object.values(effectAtlas.regions).filter((region) => region.atlas_id === atlasId);
}

export function getEffectAtlasAsset(atlasId: string): EffectAtlasAsset | null {
  return EFFECT_ATLAS_ASSETS.find((atlas) => atlas.atlas_id === atlasId) ?? null;
}

export function getRequiredAtlasAssets(effectIds: readonly string[]): EffectAtlasAsset[] {
  const atlasIds = new Set<string>();
  for (const effectId of effectIds) {
    const sequence = getEffectSequence(effectId);
    if (!sequence) continue;
    for (const frame of sequence.frames) atlasIds.add(frame.atlas_id);
  }
  return EFFECT_ATLAS_ASSETS.filter((atlas) => atlasIds.has(atlas.atlas_id));
}

export const TEPPOU_ACTION_CODE_BY_TECHNIQUE = {
  TEPPOU_SHOOTING: 4,
  TEPPOU_SNIPING: 5,
  TEPPOU_BOMBARDMENT: 17,
} as const satisfies Partial<Record<UnitTechnique, number>>;

export const ACTION_BINDING_BY_TECHNIQUE = {
  ASHIGARU_SPEAR_STRIKE: { unitType: "ashigaru", actionCode: 1 },
  ASHIGARU_SPEAR_TECHNIQUE: { unitType: "ashigaru", actionCode: 21 },
  ARCHER_ARROW: { unitType: "archer", actionCode: 2 },
  ARCHER_LONG_SHOT: { unitType: "archer", actionCode: 3 },
  ARCHER_FIRE_ARROW: { unitType: "archer", actionCode: 15 },
  ARCHER_HOROKU: { unitType: "archer", actionCode: 16 },
  GENERAL_COMMAND: { unitType: "admiral", actionCode: 14 },
  GENERAL_HEROIC: { unitType: "admiral", actionCode: 22 },
  GENERAL_HEAL: { unitType: "admiral", actionCode: 24 },
  GENERAL_FURIOUS: { unitType: "admiral", actionCode: 28 },
  MOSA_SENPUU: { unitType: "mosa", actionCode: 11 },
  MOSA_MUSOU: { unitType: "mosa", actionCode: 23 },
  MOSA_KIJIN: { unitType: "mosa", actionCode: 25 },
  STRATEGIST_FIRE_PLAY: { unitType: "strategist", actionCode: 6 },
  STRATEGIST_FIRE_ATTACK: { unitType: "strategist", actionCode: 7 },
  STRATEGIST_FIRE_PLAN: { unitType: "strategist", actionCode: 8 },
  STRATEGIST_HELLFIRE: { unitType: "strategist", actionCode: 9 },
  STRATEGIST_FLAME_ART: { unitType: "strategist", actionCode: 10 },
  STRATEGIST_SORCERY: { unitType: "strategist", actionCode: 18 },
  STRATEGIST_FALSE_REPORT: { unitType: "strategist", actionCode: 19 },
  STRATEGIST_HEAL: { unitType: "strategist", actionCode: 24 },
  TEPPOU_SHOOTING: { unitType: "teppou", actionCode: 4 },
  TEPPOU_SNIPING: { unitType: "teppou", actionCode: 5 },
  TEPPOU_BOMBARDMENT: { unitType: "teppou", actionCode: 17 },
  NINJA_NINJUTSU: { unitType: "ninja", actionCode: 12 },
  NINJA_SHADOW_RUN: { unitType: "ninja", actionCode: 13 },
  NINJA_GENJUTSU: { unitType: "ninja", actionCode: 20 },
  NINJA_BARRIER: { unitType: "ninja", actionCode: 27 },
  CAVALRY_CHARGE: { unitType: "cavalry", actionCode: 26 },
} as const satisfies Partial<Record<UnitTechnique, { unitType: string; actionCode: number }>>;

export function resolveTechniqueActionEffects(technique: UnitTechnique): ActionDefinition | null {
  const binding = ACTION_BINDING_BY_TECHNIQUE[technique as keyof typeof ACTION_BINDING_BY_TECHNIQUE];
  return binding ? resolveActionEffects(binding.unitType, binding.actionCode) : null;
}

export type TeppouEffectTechnique = keyof typeof TEPPOU_ACTION_CODE_BY_TECHNIQUE;

export function resolveTeppouActionEffects(technique: UnitTechnique): ActionDefinition | null {
  const actionCode = TEPPOU_ACTION_CODE_BY_TECHNIQUE[technique as TeppouEffectTechnique];
  return actionCode === undefined ? null : resolveActionEffects("teppou", actionCode);
}

export const TEPPOU_ACTION_EFFECTS = Object.values(TEPPOU_ACTION_CODE_BY_TECHNIQUE)
  .map((actionCode) => resolveActionEffects("teppou", actionCode))
  .filter((action): action is ActionDefinition => action !== null);
export const TEPPOU_EFFECT_IDS = TEPPOU_ACTION_EFFECTS.flatMap((action) => [
  ...action.effects.caster,
  ...action.effects.projectile,
  ...action.effects.hit,
]).filter((effect) => !effect.conditional).map((effect) => effect.effect_id);
export const TEPPOU_ATLAS_ASSETS = getRequiredAtlasAssets(TEPPOU_EFFECT_IDS);
