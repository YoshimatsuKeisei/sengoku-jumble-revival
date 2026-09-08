export interface BattlefieldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The reconstructed battlefield PNGs use Bitmap 226 local coordinates.
 * Raw AVM1 battle logic uses the parent Sprite 2456 coordinate space instead.
 * Bitmap 226 is placed at SWF (53,149), so these spaces must never be treated
 * as interchangeable.
 */
export const BATTLEFIELD_BITMAP_SIZE = {
  width: 1736,
  height: 885,
} as const;

/** @deprecated Bitmap-local size retained for asset-layout compatibility. */
export const BATTLEFIELD_SOURCE_SIZE = BATTLEFIELD_BITMAP_SIZE;

export const BATTLEFIELD_SWF_BITMAP_ORIGIN = {
  x: 53,
  y: 149,
} as const;

export const BATTLEFIELD_WORLD_SIZE = {
  width: 2400,
  height: 900,
} as const;

/** Bitmap-local -> revival world transform. Rendering uses this transform. */
export const BATTLEFIELD_BITMAP_TO_WORLD = {
  offsetX: 0,
  offsetY: 0,
  scaleX: BATTLEFIELD_WORLD_SIZE.width / BATTLEFIELD_BITMAP_SIZE.width,
  scaleY: BATTLEFIELD_WORLD_SIZE.height / BATTLEFIELD_BITMAP_SIZE.height,
} as const;

/** @deprecated Historical name. This transform is bitmap-local, not raw SWF. */
export const BATTLEFIELD_SOURCE_TO_WORLD = BATTLEFIELD_BITMAP_TO_WORLD;

export function battlefieldBitmapRectToWorld(rect: BattlefieldRect): BattlefieldRect {
  return {
    x: BATTLEFIELD_BITMAP_TO_WORLD.offsetX + rect.x * BATTLEFIELD_BITMAP_TO_WORLD.scaleX,
    y: BATTLEFIELD_BITMAP_TO_WORLD.offsetY + rect.y * BATTLEFIELD_BITMAP_TO_WORLD.scaleY,
    width: rect.width * BATTLEFIELD_BITMAP_TO_WORLD.scaleX,
    height: rect.height * BATTLEFIELD_BITMAP_TO_WORLD.scaleY,
  };
}

export function battlefieldBitmapPointToWorld(point: { x: number; y: number }): { x: number; y: number } {
  return {
    x: BATTLEFIELD_BITMAP_TO_WORLD.offsetX + point.x * BATTLEFIELD_BITMAP_TO_WORLD.scaleX,
    y: BATTLEFIELD_BITMAP_TO_WORLD.offsetY + point.y * BATTLEFIELD_BITMAP_TO_WORLD.scaleY,
  };
}

export function battlefieldWorldPointToBitmap(point: { x: number; y: number }): { x: number; y: number } {
  return {
    x: (point.x - BATTLEFIELD_BITMAP_TO_WORLD.offsetX) / BATTLEFIELD_BITMAP_TO_WORLD.scaleX,
    y: (point.y - BATTLEFIELD_BITMAP_TO_WORLD.offsetY) / BATTLEFIELD_BITMAP_TO_WORLD.scaleY,
  };
}

export function battlefieldSwfPointToBitmap(point: { x: number; y: number }): { x: number; y: number } {
  return {
    x: point.x - BATTLEFIELD_SWF_BITMAP_ORIGIN.x,
    y: point.y - BATTLEFIELD_SWF_BITMAP_ORIGIN.y,
  };
}

export function battlefieldBitmapPointToSwf(point: { x: number; y: number }): { x: number; y: number } {
  return {
    x: point.x + BATTLEFIELD_SWF_BITMAP_ORIGIN.x,
    y: point.y + BATTLEFIELD_SWF_BITMAP_ORIGIN.y,
  };
}

/** Raw Sprite2456 battle coordinate -> revival world coordinate. */
export function battlefieldSwfPointToWorld(point: { x: number; y: number }): { x: number; y: number } {
  return battlefieldBitmapPointToWorld(battlefieldSwfPointToBitmap(point));
}

/** Revival world coordinate -> raw Sprite2456 battle coordinate. */
export function battlefieldWorldPointToSwf(point: { x: number; y: number }): { x: number; y: number } {
  return battlefieldBitmapPointToSwf(battlefieldWorldPointToBitmap(point));
}

/**
 * Compatibility aliases. Historically "source point" meant SWF logic points,
 * while "source rect" meant extracted bitmap-local rectangles. Keep that API
 * stable but route each alias through the now-explicit correct coordinate space.
 */
export const battlefieldSourcePointToWorld = battlefieldSwfPointToWorld;
export const battlefieldWorldPointToSource = battlefieldWorldPointToSwf;
export const battlefieldSourceRectToWorld = battlefieldBitmapRectToWorld;

export function battlefieldSourceDistanceToWorldX(distance: number): number {
  return distance * BATTLEFIELD_BITMAP_TO_WORLD.scaleX;
}

export function battlefieldSourceDistanceToWorldY(distance: number): number {
  return distance * BATTLEFIELD_BITMAP_TO_WORLD.scaleY;
}

// Coordinates confirmed directly from raw Sprite2456 strategy routines.
export const BATTLEFIELD_STRATEGY_SOURCE_GEOMETRY = {
  chargeDestinationX: { player: 1600, enemy: 0 },
  defendFrontLineX: { player: 434, enemy: 1445 },
  interceptFrontLineX: { player: 834, enemy: 1045 },
  meleeRoamRect: { x: 334, y: 359, width: 1211, height: 409 },
  meleeArrivalManhattanDistance: 150,
} as const;

export const BATTLEFIELD_STRATEGY_WORLD_GEOMETRY = {
  chargeDestinationX: {
    player: battlefieldSwfPointToWorld({ x: BATTLEFIELD_STRATEGY_SOURCE_GEOMETRY.chargeDestinationX.player, y: 0 }).x,
    enemy: battlefieldSwfPointToWorld({ x: BATTLEFIELD_STRATEGY_SOURCE_GEOMETRY.chargeDestinationX.enemy, y: 0 }).x,
  },
  defendFrontLineX: {
    player: battlefieldSwfPointToWorld({ x: BATTLEFIELD_STRATEGY_SOURCE_GEOMETRY.defendFrontLineX.player, y: 0 }).x,
    enemy: battlefieldSwfPointToWorld({ x: BATTLEFIELD_STRATEGY_SOURCE_GEOMETRY.defendFrontLineX.enemy, y: 0 }).x,
  },
  interceptFrontLineX: {
    player: battlefieldSwfPointToWorld({ x: BATTLEFIELD_STRATEGY_SOURCE_GEOMETRY.interceptFrontLineX.player, y: 0 }).x,
    enemy: battlefieldSwfPointToWorld({ x: BATTLEFIELD_STRATEGY_SOURCE_GEOMETRY.interceptFrontLineX.enemy, y: 0 }).x,
  },
  meleeRoamRect: (() => {
    const raw = BATTLEFIELD_STRATEGY_SOURCE_GEOMETRY.meleeRoamRect;
    const topLeft = battlefieldSwfPointToWorld({ x: raw.x, y: raw.y });
    const bottomRight = battlefieldSwfPointToWorld({ x: raw.x + raw.width, y: raw.y + raw.height });
    return { x: topLeft.x, y: topLeft.y, width: bottomRight.x - topLeft.x, height: bottomRight.y - topLeft.y };
  })(),
} as const;

// Bitmap-local crop bounds recorded by assets/bases/base_reconstruction_manifest.json.
export const BATTLEFIELD_BASE_SOURCE_RECTS = {
  player: { x: 0, y: 225, width: 189, height: 400 },
  enemy: { x: 1547, y: 224, width: 189, height: 400 },
} as const;

export const BATTLEFIELD_BASE_WORLD_RECTS = {
  player: battlefieldBitmapRectToWorld(BATTLEFIELD_BASE_SOURCE_RECTS.player),
  enemy: battlefieldBitmapRectToWorld(BATTLEFIELD_BASE_SOURCE_RECTS.enemy),
} as const;

// Bitmap-alpha bounds. These remain rendering/reference geometry, not the active SWF collision source.
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
    TOP: battlefieldBitmapRectToWorld(BATTLEFIELD_BASE_GATE_SOURCE_RECTS.player.TOP),
    BOTTOM: battlefieldBitmapRectToWorld(BATTLEFIELD_BASE_GATE_SOURCE_RECTS.player.BOTTOM),
  },
  enemy: {
    TOP: battlefieldBitmapRectToWorld(BATTLEFIELD_BASE_GATE_SOURCE_RECTS.enemy.TOP),
    BOTTOM: battlefieldBitmapRectToWorld(BATTLEFIELD_BASE_GATE_SOURCE_RECTS.enemy.BOTTOM),
  },
} as const;

export const BATTLEFIELD_BASE_HEALING_SAFE_SOURCE_RECTS = {
  player: { x: 6, y: 292, width: 136, height: 277 },
  enemy: { x: 1593, y: 292, width: 137, height: 276 },
} as const;

export const BATTLEFIELD_BASE_HEALING_SAFE_WORLD_RECTS = {
  player: battlefieldBitmapRectToWorld(BATTLEFIELD_BASE_HEALING_SAFE_SOURCE_RECTS.player),
  enemy: battlefieldBitmapRectToWorld(BATTLEFIELD_BASE_HEALING_SAFE_SOURCE_RECTS.enemy),
} as const;

// Exact non-base fence alpha-component bounds in bitmap-local coordinates.
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
  ...battlefieldBitmapRectToWorld(fence),
}));
