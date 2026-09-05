import manifestJson from "../../../assets/post_battle_ui/config/post_battle_ui_manifest.json";
import type { PostBattleSoldierSnapshot } from "./postBattleState";

const manifest = manifestJson;
export const POST_BATTLE_FPS = manifest.swf.fps;
export const RESULT_HOLD_FRAME = 67;

export interface BattleResultRevealState {
  frame: number;
  panelAlpha: number;
  baseRow: boolean;
  soldierRow: boolean;
  retreatRow: boolean;
  totalsRow: boolean;
  finalUi: boolean;
}

export function getBattleResultRevealState(elapsedMs: number): BattleResultRevealState {
  const elapsed = Math.max(0, elapsedMs);
  const timeline = manifest.screens.battle_result.reveal_timeline;
  const eventTime = (event: string): number => timeline.find((entry) => entry.event === event)?.time_ms ?? Number.POSITIVE_INFINITY;
  let frame = 1 + Math.floor(elapsed * POST_BATTLE_FPS / 1_000 + 1e-9);
  // Manifest millisecond values are integer-rounded from the SWF timeline.
  // At those exact thresholds, prefer the recorded source frame.
  for (const marker of timeline) {
    if (elapsed >= marker.time_ms) frame = Math.max(frame, marker.frame);
  }
  frame = Math.min(RESULT_HOLD_FRAME, frame);
  return {
    frame,
    panelAlpha: Math.min(1, Math.floor(elapsed * POST_BATTLE_FPS / 1_000 + 1e-9) / 16),
    baseRow: elapsed >= eventTime("panel_full_and_base_row"),
    soldierRow: elapsed >= eventTime("soldier_row"),
    retreatRow: elapsed >= eventTime("retreat_row"),
    totalsRow: elapsed >= eventTime("totals_row"),
    finalUi: elapsed >= eventTime("winner_badge_footer_and_button"),
  };
}

export function maxPostBattleListScroll(rowCount: number, visibleRows = 10): number {
  return Math.max(0, rowCount - visibleRows);
}

export function clampPostBattleListScroll(scrollRow: number, rowCount: number, visibleRows = 10): number {
  return Math.max(0, Math.min(maxPostBattleListScroll(rowCount, visibleRows), scrollRow));
}

export type EnemySortKey = "reverse" | "hp" | "skill" | "attack" | "defense" | "speed" | "unit_type" | "action_type" | "cost";
export type MeritSortKey = "reverse" | "battle_win" | "battle_loss" | "retreat" | "kills" | "soldier_attack" | "base_attack" | "defense" | "recovery";

export function sortEnemyRows(
  source: readonly PostBattleSoldierSnapshot[],
  key: EnemySortKey,
): PostBattleSoldierSnapshot[] {
  const rows = [...source];
  if (key === "reverse") return rows.reverse();
  if (key === "cost") return rows;
  const value = (soldier: PostBattleSoldierSnapshot): number | string => {
    if (key === "hp") return soldier.maxHp;
    if (key === "skill") return soldier.skill;
    if (key === "attack") return soldier.attack;
    if (key === "defense") return soldier.defense;
    if (key === "speed") return soldier.speed;
    if (key === "unit_type") return soldier.unitType;
    return soldier.technique;
  };
  return rows.sort((a, b) => {
    const av = value(a);
    const bv = value(b);
    return typeof av === "number" && typeof bv === "number"
      ? bv - av
      : String(av).localeCompare(String(bv), "ja");
  });
}

export function sortMeritRows(
  source: readonly PostBattleSoldierSnapshot[],
  key: MeritSortKey,
): PostBattleSoldierSnapshot[] {
  if (key === "reverse") return [...source].reverse();
  // No trusted merit counters exist. Preserve source order rather than sorting
  // on fabricated values.
  return [...source];
}
