import { SOLDIER_INSPECTOR_CONFIG, SOLDIER_RADIUS } from "../config";
import type { Soldier, Strategy } from "../types";
import { COMMON_SPECIAL_ABILITY_LABELS } from "./specialAbilitySystem";
import { TECHNIQUE_DEFINITIONS, UNIT_TYPE_LABELS } from "./unitLoadoutSystem";
import { getGunRange } from "./gunAttackSystem";
import { getArrowRange } from "./arrowAttackSystem";

export const STRATEGY_LABELS: Record<Strategy, string> = {
  charge: "突撃", defend: "守備", intercept: "迎撃", melee: "乱戦", wait: "待機",
};
export interface InspectorRuntime { targetId: string | null; holdUntil: number }

export function updateInspectorTarget(player: Soldier, soldiers: readonly Soldier[], currentTime: number,
  runtime: InspectorRuntime): InspectorRuntime {
  const touching = soldiers.filter((candidate) => candidate !== player && !candidate.isDead && candidate.team === player.team
    && Math.hypot(candidate.x - player.x, candidate.y - player.y) <= SOLDIER_RADIUS * 2)
    .sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y)
      || a.id.localeCompare(b.id))[0];
  if (touching) return { targetId: touching.id, holdUntil: currentTime + SOLDIER_INSPECTOR_CONFIG.holdMs };
  return currentTime <= runtime.holdUntil ? runtime : { targetId: null, holdUntil: 0 };
}
export function formatSoldierInspector(soldier: Soldier): string {
  const abilities = soldier.specialAbilities.length
    ? soldier.specialAbilities.map((id) => `・${COMMON_SPECIAL_ABILITY_LABELS[id]}`).join("\n") : "なし";
  const range = getGunRange(soldier.technique) ?? getArrowRange(soldier.technique);
  const rangeUnits = soldier.technique === "ARCHER_LONG_SHOT" ? 5
    : soldier.unitType === "ARCHER" ? 3 : null;
  const rareLabels = soldier.rareSpecialAbilities.map((id) => ({ MOUTAI: "猛退", JINTO: "陣頭", KATON: "火遁", NINJA_HUNTER: "忍狩" })[id]);
  return `兵士：${soldier.id.toUpperCase()}\n兵種：${UNIT_TYPE_LABELS[soldier.unitType]}\n駒種：${TECHNIQUE_DEFINITIONS[soldier.technique].label}`
    + `${range === null ? "" : `\n射程：${rangeUnits === null ? "" : `約${rangeUnits}マス / `}${Math.round(range)} px`}\n\nHP：${Math.ceil(soldier.hp)} / ${soldier.maxHp}`
    + `\n技量：${soldier.stats.skill}\n脚力：${soldier.stats.foot}\n戦闘：${soldier.stats.combat}\n防御：${soldier.stats.defense}`
    + `\n\n作戦：${STRATEGY_LABELS[soldier.strategy]}\n状態：${soldier.isConfused ? "混乱" : soldier.state}\n反応：${soldier.reactionState}`
    + `\n\n特殊能力：\n${abilities}`
    + (rareLabels.length ? `\n\n希少能力：\n${rareLabels.map((label) => `・${label}`).join("\n")}` : "");
}
