import mapAtlasJson from "../../../assets/map_ui/atlas/map_ui_atlas.json";
import introAtlasJson from "../../../assets/map_ui/atlas/battle_intro_atlas.json";
import mapAtlasUrl from "../../../assets/map_ui/atlas/map_ui_atlas.png";
import introAtlasUrl from "../../../assets/map_ui/atlas/battle_intro_atlas.png";

export type MapUiAtlasId = "map" | "intro";

interface AtlasFrameDefinition {
  frame: { x: number; y: number; w: number; h: number };
  bitmap_id: number;
}

interface AtlasJson {
  frames: Record<string, AtlasFrameDefinition>;
  meta: { size: { w: number; h: number } };
}

export interface MapUiAtlasAsset {
  id: MapUiAtlasId;
  textureKey: string;
  url: string;
  width: number;
  height: number;
  frames: Readonly<Record<string, AtlasFrameDefinition>>;
}

export interface ResolvedMapUiAsset {
  logicalId: string;
  atlas: MapUiAtlasId;
  textureKey: string;
  frameKey: string;
  bitmapId: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

const atlasJson: Record<MapUiAtlasId, AtlasJson> = {
  map: mapAtlasJson as unknown as AtlasJson,
  intro: introAtlasJson as unknown as AtlasJson,
};

export const MAP_UI_ATLASES: Readonly<Record<MapUiAtlasId, MapUiAtlasAsset>> = {
  map: {
    id: "map",
    textureKey: "map-ui-atlas",
    url: mapAtlasUrl,
    width: atlasJson.map.meta.size.w,
    height: atlasJson.map.meta.size.h,
    frames: atlasJson.map.frames,
  },
  intro: {
    id: "intro",
    textureKey: "map-ui-intro-atlas",
    url: introAtlasUrl,
    width: atlasJson.intro.meta.size.w,
    height: atlasJson.intro.meta.size.h,
    frames: atlasJson.intro.frames,
  },
};

export function resolveMapUiAsset(logicalId: string): ResolvedMapUiAsset | null {
  for (const atlas of Object.values(MAP_UI_ATLASES)) {
    const definition = atlas.frames[logicalId];
    if (!definition) continue;
    const frame = definition.frame;
    return {
      logicalId,
      atlas: atlas.id,
      textureKey: atlas.textureKey,
      frameKey: logicalId,
      bitmapId: definition.bitmap_id,
      x: frame.x,
      y: frame.y,
      width: frame.w,
      height: frame.h,
    };
  }
  return null;
}

export function requireMapUiAsset(logicalId: string): ResolvedMapUiAsset {
  const asset = resolveMapUiAsset(logicalId);
  if (!asset) throw new Error(`Unknown map UI asset: ${logicalId}`);
  return asset;
}
