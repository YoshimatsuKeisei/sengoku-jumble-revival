import { describe, expect, it } from "vitest";
import {
  ENEMY_CUSTOM_ARMY_MODE_STORAGE_KEY,
  loadEnemyCustomArmyEnabled,
  saveEnemyCustomArmyEnabled,
  type ArmyModeStorage,
} from "./armyGenerationMode";

function memoryStorage(initial: string | null = null): ArmyModeStorage & { value: string | null } {
  return {
    value: initial,
    getItem: () => initial,
    setItem(_key, value) {
      this.value = value;
      initial = value;
    },
  };
}

describe("enemy custom army mode", () => {
  it("defaults to formal original generation (OFF)", () => {
    expect(loadEnemyCustomArmyEnabled(memoryStorage())).toBe(false);
  });

  it("persists only the toggle without touching the Ctrl+M army key", () => {
    const storage = memoryStorage();
    saveEnemyCustomArmyEnabled(true, storage);
    expect(storage.value).toBe("true");
    expect(ENEMY_CUSTOM_ARMY_MODE_STORAGE_KEY).not.toBe("sengoku-debug-army-setup");
    expect(loadEnemyCustomArmyEnabled(storage)).toBe(true);
    saveEnemyCustomArmyEnabled(false, storage);
    expect(loadEnemyCustomArmyEnabled(storage)).toBe(false);
  });
});
