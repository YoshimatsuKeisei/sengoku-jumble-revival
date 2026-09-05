import groundTileUrl from "../../../assets/battlefield/223_ground_tile_416x416.png";
import battlefieldOverlayUrl from "../../../assets/battlefield/battlefield_overlay_clean.png";
import enemyBaseUrl from "../../../assets/bases/enemy_base.png";
import playerBaseUrl from "../../../assets/bases/player_base.png";
import { BATTLEFIELD_SOURCE_SIZE } from "../battlefieldLayout";

export const BATTLEFIELD_LAYER_DEFINITIONS = [
  {
    id: "ground",
    key: "battlefield-ground",
    url: groundTileUrl,
    kind: "tile",
    x: 0,
    y: 0,
    width: BATTLEFIELD_SOURCE_SIZE.width,
    height: BATTLEFIELD_SOURCE_SIZE.height,
  },
  {
    id: "terrain-overlay",
    key: "battlefield-terrain-overlay",
    url: battlefieldOverlayUrl,
    kind: "image",
    x: 0,
    y: 0,
  },
  {
    id: "enemy-base",
    key: "battlefield-enemy-base",
    url: enemyBaseUrl,
    kind: "image",
    baseTeam: "enemy",
    x: 0,
    y: 0,
  },
  {
    id: "player-base",
    key: "battlefield-player-base",
    url: playerBaseUrl,
    kind: "image",
    baseTeam: "player",
    x: 0,
    y: 0,
  },
] as const;
