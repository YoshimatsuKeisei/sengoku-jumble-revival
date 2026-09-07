export const ENEMY_CUSTOM_ARMY_MODE_STORAGE_KEY = "sengoku-enemy-custom-army-mode";

export interface ArmyModeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): ArmyModeStorage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

export function loadEnemyCustomArmyEnabled(storage: ArmyModeStorage | null = browserStorage()): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(ENEMY_CUSTOM_ARMY_MODE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveEnemyCustomArmyEnabled(
  enabled: boolean,
  storage: ArmyModeStorage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(ENEMY_CUSTOM_ARMY_MODE_STORAGE_KEY, String(enabled));
  } catch {
    // Storage denial must not prevent entering a battle; this setting simply
    // falls back to the formal OFF path on the next load.
  }
}
