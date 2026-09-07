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

export function getClampedPercent(value: number, maximum: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(maximum) || maximum <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor(value / maximum * 100)));
}

export function getUnitHpFillWidth(hp: number, maxHp: number): number {
  return UNIT_HP_BAR_SIZE.width * getClampedPercent(hp, maxHp) / 100;
}

export function getTechniqueGaugeFillWidth(value: number): number {
  return TECHNIQUE_GAUGE_SIZE.width * getClampedPercent(value, 100) / 100;
}
