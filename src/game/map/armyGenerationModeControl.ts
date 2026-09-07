import {
  loadEnemyCustomArmyEnabled,
  saveEnemyCustomArmyEnabled,
} from "../systems/armyGenerationMode";

export interface ArmyGenerationModeControl {
  destroy(): void;
}

export function createArmyGenerationModeControl(): ArmyGenerationModeControl | null {
  if (!document.body) return null;
  document.querySelector("#map-army-mode")?.remove();

  const panel = document.createElement("aside");
  panel.id = "map-army-mode";
  panel.setAttribute("aria-label", "軍団設定");

  const title = document.createElement("strong");
  title.textContent = "軍団設定";
  const label = document.createElement("label");
  const text = document.createElement("span");
  text.textContent = "敵軍カスタム設定";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = loadEnemyCustomArmyEnabled();
  input.setAttribute("aria-label", "敵軍カスタム設定");
  const state = document.createElement("span");
  state.className = "map-army-mode-state";
  const updateState = (): void => {
    state.textContent = input.checked ? "ON" : "OFF";
  };
  updateState();
  input.addEventListener("change", () => {
    saveEnemyCustomArmyEnabled(input.checked);
    updateState();
  });
  const switchControl = document.createElement("span");
  switchControl.className = "map-army-mode-switch";
  switchControl.append(input, state);
  label.append(text, switchControl);
  panel.append(title, label);
  // This is a revival-only application control, not part of the original
  // 380x380 SWF Stage. Keep it outside #game so it never affects Stage scale.
  document.body.append(panel);

  return {
    destroy(): void {
      panel.remove();
    },
  };
}
