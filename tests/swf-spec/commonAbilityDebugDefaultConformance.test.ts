import { describe, expect, it } from "vitest";
import { PLAYER_DEBUG_CONFIG } from "../../src/game/config";
import { createOriginalPlayerArmy } from "../../src/game/systems/originalPlayerArmySystem";
import { COMMON_SPECIAL_ABILITY_POOL } from "../../src/game/systems/specialAbilitySystem";

describe("SWF conformance: normal play common-ability loadout", () => {
  it("keeps all-common-abilities disabled by default and enables it only through the explicit debug option", () => {
    expect(PLAYER_DEBUG_CONFIG.playerAllCommonAbilities).toBe(false);

    const normalArmy = createOriginalPlayerArmy(() => 0);
    const normalPlayer = normalArmy[0];
    expect(normalPlayer.specialAbilities).not.toEqual([...COMMON_SPECIAL_ABILITY_POOL]);

    const debugArmy = createOriginalPlayerArmy(() => 0, { playerAllCommonAbilities: true });
    expect(debugArmy[0].specialAbilities).toEqual([...COMMON_SPECIAL_ABILITY_POOL]);
  });
});
