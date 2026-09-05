import type { CommonSpecialAbilityId, RareSpecialAbilityId, SoldierLoadout, UnitTechnique, UnitType } from "../types";
import { COMMON_SPECIAL_ABILITY_LABELS, COMMON_SPECIAL_ABILITY_POOL } from "../systems/specialAbilitySystem";
import { DEFAULT_PLAYER_LOADOUT, makePlayerDebugPreset, TECHNIQUE_DEFINITIONS, validateSoldierLoadout } from "../systems/unitLoadoutSystem";

const STORAGE_KEY = "sengoku-debug-player-loadout";
export const LOADOUT_PANEL_KEY = "L" as const;
let panel: HTMLElement | null = null;
export function loadStoredPlayerLoadout(): SoldierLoadout {
  try { const value = localStorage.getItem(STORAGE_KEY); return value ? validateSoldierLoadout(JSON.parse(value)) : DEFAULT_PLAYER_LOADOUT; }
  catch { return DEFAULT_PLAYER_LOADOUT; }
}
function options(values: Array<[string, string]>, selected: string): string {
  return values.map(([value, label]) => `<option value="${value}"${value === selected ? " selected" : ""}>${label}</option>`).join("");
}
export function initializePlayerLoadoutPanel(): void {
  if (panel) return;
  const value = loadStoredPlayerLoadout();
  panel = document.createElement("aside"); panel.id = "loadout-panel"; panel.hidden = true;
  panel.innerHTML = `<h2>Player Debug Loadout</h2>
    <label>兵種<select data-field="unitType">${options([["PROTOTYPE","Prototype"],["TEPPOU","鉄砲"],["CAVALRY","騎馬"],["ARCHER","弓兵"],["ASHIGARU","足軽"],["NINJA","忍者"],["GENERAL","武将"],["STRATEGIST","軍師"],["MOSA","猛者"]], value.unitType)}</select></label>
    <label>駒種<select data-field="technique"></select></label>
    ${(["maxHp","skill","foot","combat","defense"] as const).map((key) => `<label>${key}<input type="number" data-stat="${key}" value="${value.stats[key]}" ${key === "foot" ? 'min="1" max="6"' : 'min="0"'}></label>`).join("")}
    <h3>特殊能力</h3><div class="ability-grid">${COMMON_SPECIAL_ABILITY_POOL.map((id) => `<label><input type="checkbox" data-ability="${id}"${value.specialAbilities.includes(id) ? " checked" : ""}>${COMMON_SPECIAL_ABILITY_LABELS[id]}</label>`).join("")}</div>
    <h3>希少能力</h3><div class="ability-grid"><label><input type="checkbox" data-rare-ability="KATON"${value.rareSpecialAbilities?.includes("KATON") ? " checked" : ""}>火遁</label></div><p data-rare>${value.unitType === "CAVALRY" ? "猛退（固定）" : ""}</p>
    <div class="panel-actions"><button data-action="close">Close</button><button data-action="all">全選択</button><button data-action="none">全解除</button>
    <button data-action="reset">Reset Default</button><button data-action="apply">Apply & Restart Battle</button></div>`;
  document.body.append(panel);
  const unit = panel.querySelector<HTMLSelectElement>('[data-field="unitType"]')!;
  const technique = panel.querySelector<HTMLSelectElement>('[data-field="technique"]')!;
  const refreshTechniques = (selected?: string) => {
    const type = unit.value as UnitType;
    const entries = Object.entries(TECHNIQUE_DEFINITIONS).filter(([, definition]) => definition.unitType === type)
      .map(([id, definition]) => [id, definition.label] as [string, string]);
    technique.innerHTML = options(entries, selected ?? entries[0][0]);
  };
  refreshTechniques(value.technique); unit.addEventListener("change", () => {
    refreshTechniques();
    const preset = makePlayerDebugPreset(technique.value as UnitTechnique);
    if (preset.unitType === "CAVALRY") preset.stats = { maxHp: 82, skill: 95, foot: 6, combat: 125, defense: 52 };
    for (const input of Array.from(panel!.querySelectorAll<HTMLInputElement>("[data-stat]"))) input.value = String(preset.stats[input.dataset.stat as keyof typeof preset.stats]);
    panel!.querySelector("[data-rare]")!.textContent = preset.unitType === "CAVALRY" ? "希少能力：猛退（固定）" : "";
  });
  panel.querySelector('[data-action="close"]')!.addEventListener("click", () => { panel!.hidden = true; });
  panel.querySelector('[data-action="all"]')!.addEventListener("click", () => panel!.querySelectorAll<HTMLInputElement>("[data-ability]").forEach((input) => input.checked = true));
  panel.querySelector('[data-action="none"]')!.addEventListener("click", () => panel!.querySelectorAll<HTMLInputElement>("[data-ability]").forEach((input) => input.checked = false));
  panel.querySelector('[data-action="reset"]')!.addEventListener("click", () => { localStorage.removeItem(STORAGE_KEY); location.reload(); });
  panel.querySelector('[data-action="apply"]')!.addEventListener("click", () => {
    const stats = Object.fromEntries(Array.from(panel!.querySelectorAll<HTMLInputElement>("[data-stat]")).map((input) => [input.dataset.stat!, Number(input.value)])) as unknown as SoldierLoadout["stats"];
    const specialAbilities = Array.from(panel!.querySelectorAll<HTMLInputElement>("[data-ability]:checked")).map((input) => input.dataset.ability as CommonSpecialAbilityId);
    const rareSpecialAbilities = Array.from(panel!.querySelectorAll<HTMLInputElement>("[data-rare-ability]:checked"))
      .map((input) => input.dataset.rareAbility as RareSpecialAbilityId);
    const loadout = validateSoldierLoadout({ unitType: unit.value as UnitType, technique: technique.value as UnitTechnique, stats, specialAbilities, rareSpecialAbilities });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loadout)); location.reload();
  });
}
export function togglePlayerLoadoutPanel(): void {
  if (!panel) return; const opening = panel.hidden; panel.hidden = !panel.hidden;
  if (opening) { const other = document.querySelector<HTMLElement>("#army-setup-panel"); if (other) other.hidden = true; }
}
export function isPlayerLoadoutPanelOpen(): boolean { return Boolean(panel && !panel.hidden); }
