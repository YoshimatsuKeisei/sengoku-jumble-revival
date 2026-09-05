import formationAtlasJson from "../../../assets/formation_ui/atlas/formation_ui_atlas.json";
import formationManifestJson from "../../../assets/formation_ui/config/formation_asset_manifest.json";
import formationAtlasUrl from "../../../assets/formation_ui/atlas/formation_ui_atlas.png";
import upperFenceUrl from "../../../assets/formation_ui/source_parts/230_upper_fence.png";
import groundPatchUrl from "../../../assets/formation_ui/source_parts/2637_formation_ground_patch.png";
import terrainPieceAUrl from "../../../assets/formation_ui/source_parts/2638_formation_terrain_piece_a.png";
import terrainPieceSmallUrl from "../../../assets/formation_ui/source_parts/2639_formation_terrain_piece_small.png";
import terrainPieceBUrl from "../../../assets/formation_ui/source_parts/2641_formation_terrain_piece_b.png";
import gatePostUrl from "../../../assets/formation_ui/source_parts/2644_formation_gate_post.png";
import tallPoleUrl from "../../../assets/formation_ui/source_parts/2647_formation_tall_pole.png";
import crossedFenceUrl from "../../../assets/formation_ui/source_parts/2651_formation_crossed_fence.png";

interface FormationAtlasFrame {
  frame: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
  bitmap_id: number;
}

interface FormationAtlasJson {
  frames: Record<string, FormationAtlasFrame>;
  meta: { size: { w: number; h: number } };
}

const atlas = formationAtlasJson as unknown as FormationAtlasJson;
const manifest = formationManifestJson as unknown as {
  runtime_assets: Array<{ alias: string; bitmap_id: number }>;
  reference_parts: Array<{ alias: string; bitmap_id: number }>;
};
const runtimeAssets = new Map(manifest.runtime_assets.map((asset) => [asset.alias, asset]));
const referenceBitmapId = (alias: string): number => {
  const asset = manifest.reference_parts.find((candidate) => candidate.alias === alias);
  if (!asset) throw new Error(`Missing formation reference asset: ${alias}`);
  return asset.bitmap_id;
};

export const FORMATION_ATLAS = {
  key: "formation-ui-atlas",
  url: formationAtlasUrl,
  width: atlas.meta.size.w,
  height: atlas.meta.size.h,
  frames: atlas.frames,
} as const;

export const FORMATION_SOURCE_PARTS = {
  upper_fence: { key: "formation-upper-fence", url: upperFenceUrl, bitmapId: referenceBitmapId("upper_fence") },
  formation_ground_patch: { key: "formation-ground-patch", url: groundPatchUrl, bitmapId: referenceBitmapId("formation_ground_patch") },
  formation_terrain_piece_a: { key: "formation-terrain-piece-a", url: terrainPieceAUrl, bitmapId: referenceBitmapId("formation_terrain_piece_a") },
  formation_terrain_piece_small: { key: "formation-terrain-piece-small", url: terrainPieceSmallUrl, bitmapId: referenceBitmapId("formation_terrain_piece_small") },
  formation_terrain_piece_b: { key: "formation-terrain-piece-b", url: terrainPieceBUrl, bitmapId: referenceBitmapId("formation_terrain_piece_b") },
  formation_gate_post: { key: "formation-gate-post", url: gatePostUrl, bitmapId: referenceBitmapId("formation_gate_post") },
  formation_tall_pole: { key: "formation-tall-pole", url: tallPoleUrl, bitmapId: referenceBitmapId("formation_tall_pole") },
  formation_crossed_fence: { key: "formation-crossed-fence", url: crossedFenceUrl, bitmapId: referenceBitmapId("formation_crossed_fence") },
} as const;

export type FormationSourcePartId = keyof typeof FORMATION_SOURCE_PARTS;

export interface ResolvedFormationAsset {
  alias: string;
  textureKey: string;
  frameKey: string;
  bitmapId: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function resolveFormationAsset(alias: string): ResolvedFormationAsset | null {
  const logical = runtimeAssets.get(alias);
  const definition = FORMATION_ATLAS.frames[alias];
  if (!logical || !definition || logical.bitmap_id !== definition.bitmap_id) return null;
  return {
    alias,
    textureKey: FORMATION_ATLAS.key,
    frameKey: alias,
    bitmapId: logical.bitmap_id,
    x: definition.frame.x,
    y: definition.frame.y,
    width: definition.sourceSize.w,
    height: definition.sourceSize.h,
  };
}

export function requireFormationAsset(alias: string): ResolvedFormationAsset {
  const asset = resolveFormationAsset(alias);
  if (!asset) throw new Error(`Unknown formation UI asset: ${alias}`);
  return asset;
}
