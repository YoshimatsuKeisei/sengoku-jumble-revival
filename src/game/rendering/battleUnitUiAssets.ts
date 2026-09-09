import hpBarEmptyUrl from "../../../assets/battle/ui/unit_hp_bar/hp_bar_empty.png";
import hpBarFullUrl from "../../../assets/battle/ui/unit_hp_bar/hp_bar_full_neutral.png";
import bottomPanelUrl from "../../../assets/battle/ui/technique_gauge/bottom_panel_bitmap_2571.png";
import techniqueGaugeFillUrl from "../../../assets/battle/ui/technique_gauge/technique_gauge_fill_vector_rasterized.png";

export const BATTLE_UNIT_UI_TEXTURES = {
  hpBarEmpty: "battle-unit-hp-bar-empty",
  hpBarFull: "battle-unit-hp-bar-full",
  bottomPanel: "battle-technique-bottom-panel",
  techniqueGaugeFill: "battle-technique-gauge-fill",
} as const;

export const BATTLE_UNIT_UI_ASSETS = [
  { key: BATTLE_UNIT_UI_TEXTURES.hpBarEmpty, url: hpBarEmptyUrl },
  { key: BATTLE_UNIT_UI_TEXTURES.hpBarFull, url: hpBarFullUrl },
  { key: BATTLE_UNIT_UI_TEXTURES.bottomPanel, url: bottomPanelUrl },
  { key: BATTLE_UNIT_UI_TEXTURES.techniqueGaugeFill, url: techniqueGaugeFillUrl },
] as const;

export const UNIT_HP_BAR_SIZE = { width: 30, height: 2 } as const;
export const TECHNIQUE_GAUGE_SIZE = { width: 35, height: 5 } as const;

// Direct Sprite2455 PlaceObject2 for the child movie clip named `h`.
// The extracted 30x2 images are Sprite667-local pixels; the original applies
// this second transform when the HP bar is placed above each soldier.
export const SWF_UNIT_HP_BAR_SOURCE_OFFSET = { x: -6, y: -26 } as const;
export const SWF_UNIT_HP_BAR_LOCAL_SCALE = {
  x: 0.4666595458984375,
  y: 1.0000457763671875,
} as const;

// Sprite2455 applies CXFORMWITHALPHA to h: mult=(230,230,230,256),
// add=(-79,0,83,0), divisor 256. The two source fills are black and #adadad.
export const SWF_UNIT_HP_BAR_COLOR_TRANSFORM = {
  multiplier: { r: 230, g: 230, b: 230, a: 256 },
  additive: { r: -79, g: 0, b: 83, a: 0 },
  divisor: 256,
} as const;
export const SWF_UNIT_HP_BAR_COLORS = {
  empty: 0x000053,
  fill: 0x4c9bee,
} as const;

// Sprite667 is a 100-frame clip. Its depth-2 fill is shape 665 (40 source px
// wide) transformed by the following exact 16.16 X-scale values. The active
// frame is 101-floor(hp/mp*100), so the full bar is frame 1 and 1% is frame 100.
const SWF_HP_BAR_FRAME_SCALE_X_16_16 = [
  49141, 48653, 48165, 47677, 47189, 46700, 46212, 45724, 45236, 44748,
  44260, 43772, 43284, 42795, 42307, 41819, 41331, 40843, 40355, 39867,
  39379, 38891, 38402, 37914, 37426, 36939, 36451, 35963, 35474, 34986,
  34498, 34010, 33522, 33034, 32546, 32058, 31570, 31081, 30593, 30105,
  29617, 29129, 28641, 28153, 27665, 27177, 26688, 26200, 25712, 25224,
  24736, 24248, 23760, 23272, 22783, 22295, 21807, 21319, 20831, 20343,
  19855, 19367, 18879, 18390, 17902, 17414, 16926, 16438, 15950, 15462,
  14974, 14486, 13997, 13509, 13021, 12534, 12046, 11558, 11069, 10581,
  10093, 9605, 9117, 8629, 8141, 7653, 7165, 6676, 6188, 5700,
  5212, 4724, 4236, 3748, 3260, 2771, 2283, 1795, 1307, 819,
] as const;
const SWF_HP_BAR_FILL_SOURCE_SHAPE_WIDTH = 40;
const SWF_FIXED_16_16 = 65536;

export function getClampedPercent(value: number, maximum: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(maximum) || maximum <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor(value / maximum * 100)));
}

export function getUnitHpFillWidth(hp: number, maxHp: number): number {
  const percent = getClampedPercent(hp, maxHp);
  if (percent <= 0) return 0;
  const frame = 101 - percent;
  const rawScale = SWF_HP_BAR_FRAME_SCALE_X_16_16[frame - 1] / SWF_FIXED_16_16;
  return Math.min(UNIT_HP_BAR_SIZE.width, SWF_HP_BAR_FILL_SOURCE_SHAPE_WIDTH * rawScale);
}

export function getTechniqueGaugeFillWidth(value: number): number {
  return TECHNIQUE_GAUGE_SIZE.width * getClampedPercent(value, 100) / 100;
}
