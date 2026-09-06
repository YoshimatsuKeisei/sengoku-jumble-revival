import { describe, expect, it } from "vitest";
import {
  BATTLE_FRAME_SEQUENCE_ASSETS,
  battleOutSequenceFor,
  commandSequenceFor,
  getBattleFrameSequence,
  sampleBattleFrameSequence,
  shouldShowCriticalRetreat,
  specialCasterSequencesFor,
  temporaryOrderSequenceFor,
} from "./battleFrameSequenceManifest";

describe("extracted battle frame sequences", () => {
  it("resolves every extracted frame without duplicate texture keys", () => {
    expect(BATTLE_FRAME_SEQUENCE_ASSETS).toHaveLength(157);
    expect(new Set(BATTLE_FRAME_SEQUENCE_ASSETS.map((asset) => asset.key)).size).toBe(157);
    expect(BATTLE_FRAME_SEQUENCE_ASSETS.every((asset) => asset.url.length > 0)).toBe(true);
  });

  it("keeps the critical marker looping throughout retreat and samples at 24fps", () => {
    expect(sampleBattleFrameSequence("critical_retreat", 0)).toEqual({ frameIndex: 0, ended: false });
    expect(sampleBattleFrameSequence("critical_retreat", 374)).toEqual({ frameIndex: 8, ended: false });
    expect(sampleBattleFrameSequence("critical_retreat", 375)).toEqual({ frameIndex: 0, ended: false });
    expect(sampleBattleFrameSequence("battle_out_player", 125)).toEqual({ frameIndex: 0, ended: false });
    expect(shouldShowCriticalRetreat({ isDead: false, state: "EMERGENCY_RETREAT" })).toBe(true);
    expect(shouldShowCriticalRetreat({ isDead: false, state: "HEALING" })).toBe(true);
    expect(shouldShowCriticalRetreat({ isDead: false, state: "NORMAL" })).toBe(false);
    expect(shouldShowCriticalRetreat({ isDead: true, state: "EMERGENCY_RETREAT" })).toBe(false);
  });

  it("keeps player/enemy assets and command mappings explicit", () => {
    expect(battleOutSequenceFor("player")).toBe("battle_out_player");
    expect(battleOutSequenceFor("enemy")).toBe("battle_out_enemy");
    expect(commandSequenceFor("RETREAT")).toBe("command_retreat");
    expect(commandSequenceFor("ADVANCE")).toBe("command_charge");
    expect(commandSequenceFor("RALLY")).toBe("command_gather");
    expect(temporaryOrderSequenceFor("JINTO_CHARGE", "enemy")).toBe("aux_charge_enemy");
    expect(temporaryOrderSequenceFor("NINJA_BARRIER_CHARGE", "player")).toBe("aux_barrier_player");
  });

  it("maps only confirmed caster techniques", () => {
    expect(specialCasterSequencesFor("GENERAL_HEROIC")).toEqual(["caster_muso_cyan", "aux_gri"]);
    expect(specialCasterSequencesFor("MOSA_KIJIN")).toEqual(["caster_oni_magenta"]);
    expect(specialCasterSequencesFor("CAVALRY_CHARGE")).toEqual(["caster_kiba_magenta"]);
    expect(specialCasterSequencesFor("ARCHER_ARROW")).toEqual([]);
    expect(getBattleFrameSequence("aux_gri")?.frameCount).toBe(15);
  });
});
