import atlasManifestJson from "../../../assets/battlefield_panel/config/atlas_manifest.json";
import dynamicFieldsJson from "../../../assets/battlefield_panel/config/dynamic_text_fields.json";
import nonBitmapComponentsJson from "../../../assets/battlefield_panel/config/non_bitmap_components.json";
import panelLayoutJson from "../../../assets/battlefield_panel/config/panel_layout.json";
import hudAtlasJson from "../../../assets/battlefield_panel/atlas/hud_atlas.json";
import introAtlasJson from "../../../assets/battlefield_panel/atlas/intro_atlas.json";
import messagesAtlasJson from "../../../assets/battlefield_panel/atlas/messages_atlas.json";
import hudAtlasUrl from "../../../assets/battlefield_panel/atlas/hud_atlas.png";
import introAtlasUrl from "../../../assets/battlefield_panel/atlas/intro_atlas.png";
import messagesAtlasUrl from "../../../assets/battlefield_panel/atlas/messages_atlas.png";

export type BattlePanelAtlasId = "hud" | "messages" | "intro";

interface AtlasManifestEntry {
  atlas: BattlePanelAtlasId;
  frame: string;
  bitmap_id: number;
}

interface AtlasManifest {
  assets: Record<string, AtlasManifestEntry>;
  atlases: Record<BattlePanelAtlasId, { width: number; height: number }>;
}

interface AtlasFrame {
  frame: { x: number; y: number; w: number; h: number };
}

interface AtlasData {
  frames: Record<string, AtlasFrame>;
  meta: { size: { w: number; h: number } };
}

export interface BattlePanelAtlasAsset {
  atlas: BattlePanelAtlasId;
  key: string;
  url: string;
  width: number;
  height: number;
  frames: Readonly<Record<string, AtlasFrame>>;
}

export interface ResolvedBattlePanelAsset {
  logicalId: string;
  atlas: BattlePanelAtlasId;
  textureKey: string;
  frameKey: string;
  bitmapId: number;
  x: number;
  y: number;
  width: number;
  height: number;
  atlasWidth: number;
  atlasHeight: number;
}

interface PanelLayoutEntry {
  id: string;
  asset?: string;
  assets?: string[];
  x?: number;
  y?: number;
}

interface DynamicField {
  variable: string;
  x: number;
  y: number;
  area: string;
}

interface NonBitmapComponent {
  instance: string;
  x: number;
  y: number;
  area: string;
  kind: string;
}

const manifest = atlasManifestJson as unknown as AtlasManifest;
const panelLayout = panelLayoutJson as unknown as {
  coordinate_space: { width: number; height: number };
  panels: PanelLayoutEntry[];
};
const dynamicFields = (dynamicFieldsJson as unknown as { fields: DynamicField[] }).fields;
const nonBitmapComponents = (nonBitmapComponentsJson as unknown as { components: NonBitmapComponent[] }).components;
const atlasData: Record<BattlePanelAtlasId, AtlasData> = {
  hud: hudAtlasJson as unknown as AtlasData,
  messages: messagesAtlasJson as unknown as AtlasData,
  intro: introAtlasJson as unknown as AtlasData,
};
const atlasUrls: Record<BattlePanelAtlasId, string> = {
  hud: hudAtlasUrl,
  messages: messagesAtlasUrl,
  intro: introAtlasUrl,
};

export const BATTLE_PANEL_ATLASES: Readonly<Record<BattlePanelAtlasId, BattlePanelAtlasAsset>> =
  Object.fromEntries((Object.keys(atlasData) as BattlePanelAtlasId[]).map((atlas) => [atlas, {
    atlas,
    key: `battle-panel-${atlas}`,
    url: atlasUrls[atlas],
    width: atlasData[atlas].meta.size.w,
    height: atlasData[atlas].meta.size.h,
    frames: atlasData[atlas].frames,
  }])) as unknown as Readonly<Record<BattlePanelAtlasId, BattlePanelAtlasAsset>>;

// Intro stays out of the normal battle preload because its source background is incomplete.
export const BATTLE_PANEL_PRELOAD_ATLASES = [BATTLE_PANEL_ATLASES.hud, BATTLE_PANEL_ATLASES.messages] as const;
export const BATTLE_PANEL_STAGE_SIZE = { ...panelLayout.coordinate_space } as const;

export function getBattlePanelLayout(id: string): PanelLayoutEntry | null {
  return panelLayout.panels.find((panel) => panel.id === id) ?? null;
}

export function getBattlePanelDynamicField(variable: string, area: string): DynamicField | null {
  return dynamicFields.find((field) => field.variable === variable && field.area === area) ?? null;
}

export function getBattlePanelNonBitmapComponent(instance: string): NonBitmapComponent | null {
  return nonBitmapComponents.find((component) => component.instance === instance) ?? null;
}

export function resolveBattlePanelAsset(logicalId: string): ResolvedBattlePanelAsset | null {
  const logical = manifest.assets[logicalId];
  if (!logical) return null;
  const atlas = BATTLE_PANEL_ATLASES[logical.atlas];
  const frame = atlas.frames[logical.frame]?.frame;
  if (!frame) return null;
  return {
    logicalId,
    atlas: logical.atlas,
    textureKey: atlas.key,
    frameKey: logical.frame,
    bitmapId: logical.bitmap_id,
    x: frame.x,
    y: frame.y,
    width: frame.w,
    height: frame.h,
    atlasWidth: atlas.width,
    atlasHeight: atlas.height,
  };
}

export function requireBattlePanelAsset(logicalId: string): ResolvedBattlePanelAsset {
  const resolved = resolveBattlePanelAsset(logicalId);
  if (!resolved) throw new Error(`Unknown battlefield panel asset: ${logicalId}`);
  return resolved;
}
