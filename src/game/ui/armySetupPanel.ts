import type { ArmySetup, Strategy, Team, UnitTechnique } from "../types";
import { ARMY_SETUP_STORAGE_KEY, createDefaultArmySetup, getArmySetupTotal, loadStoredArmySetup, TECHNIQUE_ORDER, validateArmySetup } from "../systems/armySetupSystem";
import { STRATEGY_LABELS } from "../systems/soldierInspectorSystem";
import { TECHNIQUE_DEFINITIONS, UNIT_DEFINITIONS, UNIT_TYPE_LABELS } from "../systems/unitLoadoutSystem";

export const ARMY_SETUP_PANEL_KEY = "M" as const;
let panel: HTMLElement | null = null;
const teams: Team[] = ["player", "enemy"];
const strategies: Strategy[] = ["defend", "wait", "intercept", "melee", "charge"];
function render(setup: ArmySetup): string {
  return `<h2>軍団設定</h2>${teams.map((team) => `<section data-team="${team}"><h3>${team === "player" ? "味方軍" : "敵軍"}</h3>
    <label>作戦<select data-strategy>${strategies.map((id) => `<option value="${id}"${setup[team].defaultStrategy === id ? " selected" : ""}>${STRATEGY_LABELS[id]}</option>`).join("")}</select></label>
    ${(Object.keys(UNIT_DEFINITIONS) as Array<keyof typeof UNIT_DEFINITIONS>).map((unitType) => `<fieldset data-unit-type="${unitType}"><legend>${UNIT_TYPE_LABELS[unitType]}${unitType === "NINJA" || unitType === "GENERAL" || unitType === "STRATEGIST" || unitType === "MOSA" ? ` ${UNIT_DEFINITIONS[unitType].techniques.reduce((sum, technique) => sum + setup[team].techniqueCounts[technique], 0)} / ${UNIT_DEFINITIONS[unitType].maxPerTeam}` : ""}</legend>${UNIT_DEFINITIONS[unitType].techniques.map((technique) => `<label>${TECHNIQUE_DEFINITIONS[technique].label}${unitType === "CAVALRY" ? "（突撃固定）" : ""}<input type="number" min="0" max="${UNIT_DEFINITIONS[unitType].maxPerTeam ?? 30}" step="1" data-technique="${technique}" value="${setup[team].techniqueCounts[technique]}"></label>`).join("")}</fieldset>`).join("")}
    <strong data-total>合計：${getArmySetupTotal(setup[team])} / 30</strong></section>`).join("")}
    <div class="panel-actions"><button data-action="close">Close</button><button data-action="reset">Reset Default</button><button data-action="apply">Apply & Restart Battle</button></div>`;
}
function read(): ArmySetup {
  const result = createDefaultArmySetup();
  for (const team of teams) {
    const section = panel!.querySelector<HTMLElement>(`[data-team="${team}"]`)!;
    result[team].defaultStrategy = section.querySelector<HTMLSelectElement>("[data-strategy]")!.value as Strategy;
    for (const input of Array.from(section.querySelectorAll<HTMLInputElement>("[data-technique]")))
      result[team].techniqueCounts[input.dataset.technique as UnitTechnique] = Number(input.value);
  }
  return result;
}
function refresh(): void {
  for (const team of teams) {
    const section = panel!.querySelector<HTMLElement>(`[data-team="${team}"]`)!;
    const total = Array.from(section.querySelectorAll<HTMLInputElement>("[data-technique]")).reduce((sum, input) => sum + Number(input.value), 0);
    section.querySelector("[data-total]")!.textContent = `合計：${total} / 30`;
    const ninjaFieldset = section.querySelector<HTMLElement>('[data-unit-type="NINJA"]');
    if (ninjaFieldset) {
      const ninjaTotal = UNIT_DEFINITIONS.NINJA.techniques.reduce((sum, technique) => sum
        + Number(section.querySelector<HTMLInputElement>(`[data-technique="${technique}"]`)!.value), 0);
      ninjaFieldset.querySelector("legend")!.textContent = `忍者 ${ninjaTotal} / 6`;
    }
  }
  const apply = panel!.querySelector<HTMLButtonElement>('[data-action="apply"]')!;
  try { validateArmySetup(read()); apply.disabled = false; } catch { apply.disabled = true; }
}
export function initializeArmySetupPanel(): void {
  if (panel) return; panel = document.createElement("aside"); panel.id = "army-setup-panel"; panel.hidden = true;
  panel.innerHTML = render(loadStoredArmySetup()); document.body.append(panel);
  panel.addEventListener("input", refresh);
  panel.querySelector('[data-action="close"]')!.addEventListener("click", () => panel!.hidden = true);
  panel.querySelector('[data-action="reset"]')!.addEventListener("click", () => { localStorage.removeItem(ARMY_SETUP_STORAGE_KEY); location.reload(); });
  panel.querySelector('[data-action="apply"]')!.addEventListener("click", () => {
    localStorage.setItem(ARMY_SETUP_STORAGE_KEY, JSON.stringify(validateArmySetup(read()))); location.reload();
  }); refresh();
}
export function toggleArmySetupPanel(): void {
  if (!panel) return; const opening = panel.hidden; panel.hidden = !panel.hidden;
  if (opening) { const other = document.querySelector<HTMLElement>("#loadout-panel"); if (other) other.hidden = true; }
}
export function isArmySetupPanelOpen(): boolean { return Boolean(panel && !panel.hidden); }
