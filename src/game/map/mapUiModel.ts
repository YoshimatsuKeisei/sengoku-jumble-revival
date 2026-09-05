import mapCellsJson from "../../../assets/map_ui/config/map_cells.json";
import mapManifestJson from "../../../assets/map_ui/config/map_ui_manifest.json";
import type { SelectedMapCell } from "./mapTransitionState";

export interface MapCell {
  cell_id: string;
  grid_x: number;
  grid_y: number;
  stage_x: number;
  stage_y: number;
  hit_area: { x: number; y: number; w: number; h: number };
  type_code: number;
  type: string;
  icon: string;
  bottom_label: string;
  description: string;
  hover: {
    level: number;
    leader: string;
    opponent_army: string;
    formation_id: number | null;
  };
}

interface MapCellMetadata {
  cell_id: string;
  aliases_cell: string;
  display_condition: string;
  display_state: string;
}

interface MapUiManifest {
  coordinate_space: { width: number; height: number; fps: number };
  cell_grid: {
    columns: number;
    rows: number;
    cell_pitch: number;
    origin: { x: number; y: number };
    land_cell_count: number;
  };
  movement: {
    rectangle_radius_each_axis: number;
    sea_route_pairs: [string, string][];
    forced_movable: string[];
  };
  cell_states: {
    movable: { asset: string; local_x: number; local_y: number };
    hover: {
      bitmap: string;
      bitmap_local: { x: number; y: number };
      root_formula: { x: string; y: string };
    };
    current_marker: {
      frames: string[];
      frame_holds: number[];
      local_x: number;
      local_y: number;
    };
    cleared: { regular: string; enemy_castle: string; special_castle: string };
  };
  bottom_ui: {
    x: number;
    y: number;
    background: string;
    location_label: { x: number; y: number };
    level: { x: number; y: number };
    dynamic_block: { x: number; y: number };
    money: { x: number; y: number; font_px: number };
    total_rank: { x: number; y: number; font_px: number };
    buttons: Array<{ id: string; x: number; y: number; normal: string; over_down: string }>;
    entry_tip: {
      asset: string;
      visible_frames: [number, number];
      slide_frames: [number, number];
      remove_frame: number;
      slide_y: number[];
    };
  };
  notices: {
    move_rule: { asset: string; frames: [number, number] };
    azuchi_locked: { asset: string; frames: [number, number]; requires_cleared: string[] };
    level_up_tip: {
      asset: string;
      fade_in: [number, number];
      hold: [number, number];
      fade_out: [number, number];
      remove_frame: number;
    };
  };
  training_modal: {
    trigger_cell: string;
    x: number;
    y: number;
    slide_frames: [number, number];
    panel_y: number[];
    panel: string;
  };
}

const cellsSource = (mapCellsJson as unknown as { cells: Array<MapCell | MapCellMetadata> }).cells;
export const MAP_UI_MANIFEST = mapManifestJson as unknown as MapUiManifest;
export const MAP_CELL_METADATA = cellsSource.filter((cell): cell is MapCellMetadata => !("grid_x" in cell));
export const MAP_CELLS = cellsSource.filter((cell): cell is MapCell => "grid_x" in cell && Number.isInteger(cell.grid_x));
export const DEFAULT_MAP_CELL_ID = "x8y14";

export function getMapCell(cellId: string): MapCell | null {
  return MAP_CELLS.find((cell) => cell.cell_id === cellId) ?? null;
}

export function expectedCellStagePosition(gridX: number, gridY: number): { x: number; y: number } {
  const { origin, cell_pitch: pitch } = MAP_UI_MANIFEST.cell_grid;
  return { x: origin.x + gridX * pitch, y: origin.y + gridY * pitch };
}

export function isMapCellMovable(cell: MapCell, current: MapCell): boolean {
  const movement = MAP_UI_MANIFEST.movement;
  if (movement.forced_movable.includes(cell.cell_id)) return true;
  if (Math.abs(cell.grid_x - current.grid_x) <= movement.rectangle_radius_each_axis
    && Math.abs(cell.grid_y - current.grid_y) <= movement.rectangle_radius_each_axis) return true;
  return movement.sea_route_pairs.some(([a, b]) =>
    (current.cell_id === a && cell.cell_id === b) || (current.cell_id === b && cell.cell_id === a));
}

export function isAzuchiLocked(cell: MapCell, clearedCellIds: ReadonlySet<string>): boolean {
  return cell.cell_id === "x9y7"
    && MAP_UI_MANIFEST.notices.azuchi_locked.requires_cleared.some((required) => !clearedCellIds.has(required));
}

export function toSelectedMapCell(cell: MapCell): SelectedMapCell {
  return { cellId: cell.cell_id, gridX: cell.grid_x, gridY: cell.grid_y, type: cell.type };
}

export interface MapHoverState {
  hoveredCellId: string | null;
  infoCellId: string;
}

export function enterMapCell(state: MapHoverState, cellId: string): MapHoverState {
  return { ...state, hoveredCellId: cellId, infoCellId: cellId };
}

export function leaveMapCell(state: MapHoverState, cellId: string): MapHoverState {
  return state.hoveredCellId === cellId ? { ...state, hoveredCellId: null } : state;
}

export function markerAssetAtElapsed(elapsedMs: number): string {
  const marker = MAP_UI_MANIFEST.cell_states.current_marker;
  const cycleFrames = marker.frame_holds.reduce((sum, count) => sum + count, 0);
  let frame = Math.floor(Math.max(0, elapsedMs) * MAP_UI_MANIFEST.coordinate_space.fps / 1_000) % cycleFrames;
  for (let index = 0; index < marker.frames.length; index += 1) {
    if (frame < marker.frame_holds[index]) return marker.frames[index];
    frame -= marker.frame_holds[index];
  }
  return marker.frames[0];
}

export function entryTipYAtFrame(frame: number): number | null {
  const tip = MAP_UI_MANIFEST.bottom_ui.entry_tip;
  if (frame < tip.visible_frames[0] || frame >= tip.remove_frame) return null;
  if (frame <= tip.visible_frames[1]) return 0;
  return tip.slide_y[Math.min(tip.slide_y.length - 1, frame - tip.visible_frames[1])];
}

export function levelUpTipAlphaAtFrame(frame: number): number | null {
  const tip = MAP_UI_MANIFEST.notices.level_up_tip;
  if (frame < tip.fade_in[0] || frame >= tip.remove_frame) return null;
  if (frame <= tip.fade_in[1]) return (frame - tip.fade_in[0]) / (tip.fade_in[1] - tip.fade_in[0]);
  if (frame <= tip.hold[1]) return 1;
  return Math.max(0, (tip.fade_out[1] - frame) / (tip.fade_out[1] - tip.fade_out[0]));
}

export function trainingPanelYAtFrame(frame: number): number {
  const modal = MAP_UI_MANIFEST.training_modal;
  if (frame <= modal.slide_frames[0]) return modal.y + modal.panel_y[0];
  const index = Math.min(modal.panel_y.length - 1, frame - modal.slide_frames[0]);
  return modal.y + modal.panel_y[index];
}
