export interface BattlefieldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const BATTLEFIELD_SOURCE_SIZE = {
  width: 1736,
  height: 885,
} as const;

export const BATTLEFIELD_WORLD_SIZE = {
  width: 2400,
  height: 900,
} as const;

export const BATTLEFIELD_SOURCE_TO_WORLD = {
  offsetX: 0,
  offsetY: 0,
  scaleX: BATTLEFIELD_WORLD_SIZE.width / BATTLEFIELD_SOURCE_SIZE.width,
  scaleY: BATTLEFIELD_WORLD_SIZE.height / BATTLEFIELD_SOURCE_SIZE.height,
} as const;

export function battlefieldSourceRectToWorld(rect: BattlefieldRect): BattlefieldRect {
  return {
    x: BATTLEFIELD_SOURCE_TO_WORLD.offsetX + rect.x * BATTLEFIELD_SOURCE_TO_WORLD.scaleX,
    y: BATTLEFIELD_SOURCE_TO_WORLD.offsetY + rect.y * BATTLEFIELD_SOURCE_TO_WORLD.scaleY,
    width: rect.width * BATTLEFIELD_SOURCE_TO_WORLD.scaleX,
    height: rect.height * BATTLEFIELD_SOURCE_TO_WORLD.scaleY,
  };
}

// Exact full-base crop bounds recorded by assets/bases/base_reconstruction_manifest.json.
export const BATTLEFIELD_BASE_SOURCE_RECTS = {
  player: { x: 0, y: 225, width: 189, height: 400 },
  enemy: { x: 1547, y: 224, width: 189, height: 400 },
} as const;

export const BATTLEFIELD_BASE_WORLD_RECTS = {
  player: battlefieldSourceRectToWorld(BATTLEFIELD_BASE_SOURCE_RECTS.player),
  enemy: battlefieldSourceRectToWorld(BATTLEFIELD_BASE_SOURCE_RECTS.enemy),
} as const;

// Alpha bounds of the upper/lower horizontal base fences (the actual entry corridors).
// The player upper fence placement is also recorded in base_reconstruction_manifest.json;
// the other three bounds come from the mirrored/embedded reconstruction at the same origin.
export const BATTLEFIELD_BASE_GATE_SOURCE_RECTS = {
  player: {
    TOP: { x: 0, y: 225, width: 181, height: 59 },
    BOTTOM: { x: 0, y: 577, width: 182, height: 48 },
  },
  enemy: {
    TOP: { x: 1554, y: 224, width: 182, height: 60 },
    BOTTOM: { x: 1554, y: 576, width: 182, height: 48 },
  },
} as const;

export const BATTLEFIELD_BASE_GATE_WORLD_RECTS = {
  player: {
    TOP: battlefieldSourceRectToWorld(BATTLEFIELD_BASE_GATE_SOURCE_RECTS.player.TOP),
    BOTTOM: battlefieldSourceRectToWorld(BATTLEFIELD_BASE_GATE_SOURCE_RECTS.player.BOTTOM),
  },
  enemy: {
    TOP: battlefieldSourceRectToWorld(BATTLEFIELD_BASE_GATE_SOURCE_RECTS.enemy.TOP),
    BOTTOM: battlefieldSourceRectToWorld(BATTLEFIELD_BASE_GATE_SOURCE_RECTS.enemy.BOTTOM),
  },
} as const;

// Center-safe rectangles derived from the reconstructed base PNG alpha masks. A soldier
// centered anywhere in these bounds has at least SOLDIER_RADIUS (8 world pixels) of
// clearance from the base exterior, front fence, and both gate-fence assemblies.
export const BATTLEFIELD_BASE_HEALING_SAFE_SOURCE_RECTS = {
  player: { x: 6, y: 292, width: 136, height: 277 },
  enemy: { x: 1593, y: 292, width: 137, height: 276 },
} as const;

export const BATTLEFIELD_BASE_HEALING_SAFE_WORLD_RECTS = {
  player: battlefieldSourceRectToWorld(BATTLEFIELD_BASE_HEALING_SAFE_SOURCE_RECTS.player),
  enemy: battlefieldSourceRectToWorld(BATTLEFIELD_BASE_HEALING_SAFE_SOURCE_RECTS.enemy),
} as const;

// Exact non-base fence alpha-component bounds from battlefield_overlay_clean.png.
export const BATTLEFIELD_FIXED_FENCE_SOURCE_RECTS = [
  { id: "player-upper", x: 578, y: 131, width: 38, height: 142 },
  { id: "enemy-upper", x: 1119, y: 130, width: 38, height: 142 },
  { id: "player-vanguard", x: 470, y: 347, width: 38, height: 142 },
  { id: "enemy-vanguard", x: 1227, y: 346, width: 38, height: 142 },
  { id: "player-lower", x: 578, y: 599, width: 38, height: 142 },
  { id: "enemy-lower", x: 1119, y: 598, width: 38, height: 142 },
] as const;

export const BATTLEFIELD_FIXED_FENCE_WORLD_RECTS = BATTLEFIELD_FIXED_FENCE_SOURCE_RECTS.map((fence) => ({
  id: fence.id,
  type: "FENCE" as const,
  ...battlefieldSourceRectToWorld(fence),
}));
