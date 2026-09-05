import atlasJson from "../../../assets/post_battle_ui/config/atlas_manifest.json";
import atlasUrl from "../../../assets/post_battle_ui/atlas/post_battle_ui_atlas.png";

export interface PostBattleAtlasEntry {
  bitmap_id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  trimmed: false;
  rotated: false;
}

interface AtlasManifest {
  width: number;
  height: number;
  entries: Record<string, PostBattleAtlasEntry>;
  aliases: Record<string, string>;
}

const manifest = atlasJson as unknown as AtlasManifest;
export const POST_BATTLE_ATLAS_KEY = "post-battle-ui-atlas";
export const POST_BATTLE_ATLAS_URL = atlasUrl;
export const POST_BATTLE_ATLAS_ENTRIES = manifest.entries;

export interface ResolvedPostBattleAsset extends PostBattleAtlasEntry {
  logicalId: string;
  entryKey: string;
  textureKey: string;
  frameKey: string;
}

export function resolvePostBattleAsset(id: string | number): ResolvedPostBattleAsset | null {
  const logicalId = typeof id === "number" ? `bitmap_${id}` : id;
  const entryKey = manifest.aliases[logicalId] ?? logicalId;
  const entry = manifest.entries[entryKey];
  if (!entry) return null;
  return { ...entry, logicalId, entryKey, textureKey: POST_BATTLE_ATLAS_KEY, frameKey: entryKey };
}

export function requirePostBattleAsset(id: string | number): ResolvedPostBattleAsset {
  const asset = resolvePostBattleAsset(id);
  if (!asset) throw new Error(`Unknown post-battle UI asset: ${id}`);
  return asset;
}
