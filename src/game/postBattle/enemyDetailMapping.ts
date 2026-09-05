import enemyDetailJson from "../../../assets/post_battle_ui/config/enemy_detail_mapping.json";
import actionSlotVariantsJson from "../../../assets/post_battle_ui/post_battle_ui_reference/enemy_detail_supplement/enemy_detail_action_slot_variants.json";
import specialSlotVariantsJson from "../../../assets/post_battle_ui/post_battle_ui_reference/enemy_detail_supplement/enemy_detail_special_slot_variants.json";
import activeDisplayListJson from "../../../assets/post_battle_ui/post_battle_ui_reference/enemy_detail_supplement/enemy_detail_active_display_list.json";
import type {
  CommonSpecialAbilityId,
  RareSpecialAbilityId,
  Strategy,
  UnitTechnique,
  UnitType,
} from "../types";

interface BitmapFrame {
  frame: number;
  bitmap_id: number;
  label: string;
}

interface SlotVariant {
  slot_name: string;
  sprite_id: number;
  frames: BitmapFrame[];
}

interface DetailSlot {
  slot: string;
  label: string;
  sprite_id: number;
  x: number;
  y: number;
  frame_map?: BitmapFrame[];
}

interface EnemyDetailMapping {
  enemy_detail: {
    unit_type_movieclip: { frame_map: BitmapFrame[] };
    action_type_movieclip: { frame_map: BitmapFrame[] };
    actions_grid: { slots: DetailSlot[] };
    special_abilities_grid: { slots: DetailSlot[]; slot_count: number };
  };
}

const detail = (enemyDetailJson as unknown as EnemyDetailMapping).enemy_detail;
const actionVariants = actionSlotVariantsJson as SlotVariant[];
const specialVariants = specialSlotVariantsJson as SlotVariant[];

interface ActiveDisplayEntry {
  meaning: string | null;
  matrix: { tx: number; ty: number };
  edit_text?: {
    bounds: { xmin: number; xmax: number; ymin: number; ymax: number };
    layout: { align: number };
  };
}

const activeDisplayList = activeDisplayListJson as ActiveDisplayEntry[];

function requireDisplayEntry(meaning: string): ActiveDisplayEntry {
  const entry = activeDisplayList.find((candidate) => candidate.meaning === meaning);
  if (!entry) throw new Error(`Missing enemy-detail display-list entry: ${meaning}`);
  return entry;
}

function textPlacement(meaning: string): EnemyDetailTextPlacement {
  const entry = requireDisplayEntry(meaning);
  if (!entry.edit_text) throw new Error(`Enemy-detail entry is not a text field: ${meaning}`);
  const bounds = entry.edit_text.bounds;
  return {
    x: entry.matrix.tx,
    y: entry.matrix.ty,
    width: bounds.xmax - bounds.xmin,
    height: bounds.ymax - bounds.ymin,
    align: entry.edit_text.layout.align === 1 ? "center" : "left",
  };
}

const UNIT_TYPE_FRAME: Partial<Record<UnitType, number>> = {
  ASHIGARU: 1,
  ARCHER: 2,
  GENERAL: 3,
  MOSA: 4,
  STRATEGIST: 5,
  TEPPOU: 6,
  NINJA: 7,
  CAVALRY: 8,
};

// These frame numbers are the action codes already established by the SWF
// extraction. PROTOTYPE_AREA has no original-game frame and stays unmapped.
const TECHNIQUE_FRAME: Partial<Record<UnitTechnique, number>> = {
  ASHIGARU_SPEAR_STRIKE: 1,
  ARCHER_ARROW: 2,
  ARCHER_LONG_SHOT: 3,
  TEPPOU_SHOOTING: 4,
  TEPPOU_SNIPING: 5,
  STRATEGIST_FIRE_PLAY: 6,
  STRATEGIST_FIRE_ATTACK: 7,
  STRATEGIST_FIRE_PLAN: 8,
  STRATEGIST_HELLFIRE: 9,
  STRATEGIST_FLAME_ART: 10,
  MOSA_SENPUU: 11,
  NINJA_NINJUTSU: 12,
  NINJA_SHADOW_RUN: 13,
  GENERAL_COMMAND: 14,
  ARCHER_FIRE_ARROW: 15,
  ARCHER_HOROKU: 16,
  TEPPOU_BOMBARDMENT: 17,
  STRATEGIST_SORCERY: 18,
  STRATEGIST_FALSE_REPORT: 19,
  NINJA_GENJUTSU: 20,
  ASHIGARU_SPEAR_TECHNIQUE: 21,
  GENERAL_HEROIC: 22,
  MOSA_MUSOU: 23,
  GENERAL_HEAL: 24,
  STRATEGIST_HEAL: 24,
  MOSA_KIJIN: 25,
  CAVALRY_CHARGE: 26,
  NINJA_BARRIER: 27,
};

const STRATEGY_SLOT: Record<Strategy, string> = {
  charge: "t1",
  defend: "t2",
  intercept: "t3",
  melee: "t4",
  wait: "t5",
};

const COMMON_ABILITY_SLOT: Record<CommonSpecialAbilityId, string> = {
  RUSH: "t7",
  SIEGE: "t8",
  MIGHT: "t10",
  DOUBLE_SPECIAL: "t21",
  IRON_WALL: "t11",
  FORESIGHT: "t19",
  FINISHER: "t9",
  RALLY_SPIRIT: "t13",
  INSPIRE: "t15",
  RECOVERY_BOOST: "t20",
  TREATMENT: "t14",
  FIELD_HOSPITAL: "t16",
  TRAP: "t17",
  FORTIFY: "t18",
  HORO: "t12",
  FLEET_FOOT: "t22",
};

const RARE_ABILITY_FRAME: Record<RareSpecialAbilityId, number> = {
  MOUTAI: 2,
  VANGUARD: 3,
  KATON: 4,
  FIRE_ESCAPE: 4,
  NINJA_HUNTER: 5,
};

export interface EnemyDetailBadge {
  readonly frame: number;
  readonly bitmapId: number;
}

export interface EnemyDetailTextPlacement {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly align: "left" | "center";
}

export const ENEMY_DETAIL_LAYOUT = Object.freeze({
  name: textPlacement("field_name_text"),
  hp: textPlacement("field_hp_text"),
  skill: textPlacement("field_skill_text"),
  speed: textPlacement("field_speed_text"),
  attack: textPlacement("field_attack_text"),
  defense: textPlacement("field_defense_text"),
  stipend: textPlacement("field_stipend_text"),
  unitType: requireDisplayEntry("field_unit_type").matrix,
  technique: requireDisplayEntry("field_action_type").matrix,
  growthLabel: requireDisplayEntry("growth_label").matrix,
});

export interface EnemyDetailSlotVisual {
  readonly slot: string;
  readonly x: number;
  readonly y: number;
  readonly bitmapId: number;
  readonly active: boolean;
}

function frameFromMap(frames: readonly BitmapFrame[], frame: number): EnemyDetailBadge | null {
  const match = frames.find((candidate) => candidate.frame === frame);
  return match ? { frame: match.frame, bitmapId: match.bitmap_id } : null;
}

function variantsForSlot(variants: readonly SlotVariant[], slot: string): readonly BitmapFrame[] {
  return variants.find((candidate) => candidate.slot_name === slot)?.frames ?? [];
}

export function resolveEnemyDetailUnitType(unitType: UnitType): EnemyDetailBadge | null {
  const frame = UNIT_TYPE_FRAME[unitType];
  return frame === undefined ? null : frameFromMap(detail.unit_type_movieclip.frame_map, frame);
}

export function resolveEnemyDetailTechnique(technique: UnitTechnique): EnemyDetailBadge | null {
  const frame = TECHNIQUE_FRAME[technique];
  return frame === undefined ? null : frameFromMap(detail.action_type_movieclip.frame_map, frame);
}

export function resolveEnemyDetailActionSlots(strategy: Strategy): EnemyDetailSlotVisual[] {
  const activeSlot = STRATEGY_SLOT[strategy];
  return detail.actions_grid.slots.map((slot) => {
    const active = slot.slot === activeSlot;
    const frames = variantsForSlot(actionVariants, slot.slot);
    const frame = active && frames.some((candidate) => candidate.frame === 3) ? 3 : 1;
    const badge = frameFromMap(frames, frame);
    if (!badge) throw new Error(`Missing SWF action-slot bitmap mapping: ${slot.slot} frame ${frame}`);
    return { slot: slot.slot, x: slot.x, y: slot.y, bitmapId: badge.bitmapId, active };
  });
}

export function resolveEnemyDetailSpecialSlots(
  commonAbilities: readonly CommonSpecialAbilityId[],
  rareAbilities: readonly RareSpecialAbilityId[],
): EnemyDetailSlotVisual[] {
  const activeCommonSlots = new Set(commonAbilities.map((ability) => COMMON_ABILITY_SLOT[ability]));
  let rareIndex = 0;
  const result = detail.special_abilities_grid.slots.map((slot) => {
    if (slot.slot === "t30" || slot.slot === "t31") {
      const ability = rareAbilities[rareIndex];
      rareIndex += 1;
      const frame = ability ? RARE_ABILITY_FRAME[ability] : 1;
      const badge = frameFromMap(slot.frame_map ?? [], frame);
      if (!badge) throw new Error(`Missing SWF rare-ability bitmap mapping: ${slot.slot} frame ${frame}`);
      return { slot: slot.slot, x: slot.x, y: slot.y, bitmapId: badge.bitmapId, active: Boolean(ability) };
    }
    const active = activeCommonSlots.has(slot.slot);
    const frames = variantsForSlot(specialVariants, slot.slot);
    const badge = frameFromMap(frames, active ? 2 : 1);
    if (!badge) throw new Error(`Missing SWF special-ability bitmap mapping: ${slot.slot}`);
    return { slot: slot.slot, x: slot.x, y: slot.y, bitmapId: badge.bitmapId, active };
  });
  if (result.length !== detail.special_abilities_grid.slot_count) {
    throw new Error(`Expected ${detail.special_abilities_grid.slot_count} SWF special slots, received ${result.length}`);
  }
  return result;
}
