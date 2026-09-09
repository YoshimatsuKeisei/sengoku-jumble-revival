import { describe, expect, it } from "vitest";
import { createSoldier } from "../entities/Soldier";
import {
  BATTLE_FRAME_SEQUENCE_ASSETS,
  SWF_BATTLE_MARK_GEOMETRY,
  SWF_RECIPIENT_MARK_FRAME_CENTER_OFFSETS_SOURCE_UNITS,
  battleOutSequenceFor,
  commandSequenceFor,
  getBattleFrameRenderOffsetSourceUnits,
  getBattleFrameSequence,
  sampleBattleFrameSequence,
  shouldShowCriticalRetreat,
  shouldShowTreatmentHealerMark,
  specialCasterSequencesFor,
  temporaryOrderSequenceFor,
} from "./battleFrameSequenceManifest";

describe("extracted battle frame sequences", () => {
  it("resolves every extracted frame without duplicate texture keys", () => {
    expect(BATTLE_FRAME_SEQUENCE_ASSETS).toHaveLength(184);
    expect(new Set(BATTLE_FRAME_SEQUENCE_ASSETS.map((asset) => asset.key)).size).toBe(184);
    expect(BATTLE_FRAME_SEQUENCE_ASSETS.every((asset) => asset.url.length > 0)).toBe(true);
  });

  it("holds the raw chp ninth frame while the critical retreat state remains active", () => {
    expect(sampleBattleFrameSequence("critical_retreat", 0)).toEqual({ frameIndex: 0, ended: false });
    expect(sampleBattleFrameSequence("critical_retreat", 374)).toEqual({ frameIndex: 8, ended: false });
    expect(sampleBattleFrameSequence("critical_retreat", 375)).toEqual({ frameIndex: 8, ended: false });
    expect(SWF_BATTLE_MARK_GEOMETRY.critical_retreat?.actionStopFrame).toBe(9);
    expect(getBattleFrameRenderOffsetSourceUnits("critical_retreat")).toEqual({ x: 0, y: -20 });
    expect(sampleBattleFrameSequence("battle_out_player", 125)).toEqual({ frameIndex: 0, ended: false });
    expect(shouldShowCriticalRetreat({ isDead: false, state: "EMERGENCY_RETREAT" })).toBe(true);
    expect(shouldShowCriticalRetreat({ isDead: false, state: "HEALING" })).toBe(true);
    expect(shouldShowCriticalRetreat({ isDead: false, state: "NORMAL" })).toBe(false);
    expect(shouldShowCriticalRetreat({ isDead: true, state: "EMERGENCY_RETREAT" })).toBe(false);
  });

  it("marks the selected s14 healer while a chp patient is travelling to it", () => {
    const patient = createSoldier("patient", "player", "ai", 0, 0);
    const healer = createSoldier("healer", "player", "ai", 1, 0);
    patient.state = "EMERGENCY_RETREAT";
    patient.recoveryTargetKind = "HEALER";
    patient.recoveryHealerId = healer.id;
    expect(shouldShowTreatmentHealerMark(healer.id, [patient, healer])).toBe(true);
    patient.state = "NORMAL";
    expect(shouldShowTreatmentHealerMark(healer.id, [patient, healer])).toBe(false);
  });

  it("uses the separate smaller raw recipient sprites for A/S/D", () => {
    expect(battleOutSequenceFor("player")).toBe("battle_out_player");
    expect(battleOutSequenceFor("enemy")).toBe("battle_out_enemy");
    expect(commandSequenceFor("DEFEND_ORDER")).toBe("command_retreat");
    expect(commandSequenceFor("ADVANCE")).toBe("command_charge");
    expect(commandSequenceFor("RALLY")).toBe("command_gather");
    expect(temporaryOrderSequenceFor("JINTO_CHARGE", "enemy")).toBe("aux_charge_enemy");
    expect(temporaryOrderSequenceFor("NINJA_BARRIER_CHARGE", "player")).toBe("aux_barrier_player");
    expect(temporaryOrderSequenceFor("DEFEND_ORDER", "player")).toBe("target_retreat");
    expect(temporaryOrderSequenceFor("ADVANCE", "player")).toBe("target_charge");
    expect(temporaryOrderSequenceFor("RALLY", "player")).toBe("target_gather");

    expect(getBattleFrameSequence("target_retreat")?.directory).toBe("command-target-raw/szsh");
    expect(getBattleFrameSequence("target_charge")?.directory).toBe("command-target-raw/sztt");
    expect(getBattleFrameSequence("target_gather")?.directory).toBe("command-target-raw/szch");
    expect(getBattleFrameSequence("target_charge")?.frameCount).toBe(9);
    expect(sampleBattleFrameSequence("target_charge", 0)?.frameIndex).toBe(0);
    expect(sampleBattleFrameSequence("target_charge", 500)?.frameIndex).toBe(8);
    expect(getBattleFrameRenderOffsetSourceUnits("target_charge", 0)).toEqual({ x: 18, y: -23.5 });
    expect(getBattleFrameRenderOffsetSourceUnits("target_charge", 4)).toEqual({ x: 24, y: -29.5 });
    expect(SWF_RECIPIENT_MARK_FRAME_CENTER_OFFSETS_SOURCE_UNITS).toHaveLength(9);

    expect(SWF_BATTLE_MARK_GEOMETRY.target_charge?.bitmapSizeSourceUnits).toEqual({ width: 18, height: 19 });
    expect(SWF_BATTLE_MARK_GEOMETRY.command_charge?.bitmapSizeSourceUnits).toEqual({ width: 49, height: 54 });
    expect(SWF_BATTLE_MARK_GEOMETRY.target_charge?.bitmapSizeSourceUnits.width)
      .toBeLessThan(SWF_BATTLE_MARK_GEOMETRY.command_charge!.bitmapSizeSourceUnits.width);
    expect(SWF_BATTLE_MARK_GEOMETRY.target_charge?.bitmapSizeSourceUnits.height)
      .toBeLessThan(SWF_BATTLE_MARK_GEOMETRY.command_charge!.bitmapSizeSourceUnits.height);
  });

  it("keeps the raw issuer and recipient child placements explicit", () => {
    expect(SWF_BATTLE_MARK_GEOMETRY.command_retreat?.parentPlacementSourceUnits).toEqual({ x: -19, y: -21 });
    expect(SWF_BATTLE_MARK_GEOMETRY.command_charge?.parentPlacementSourceUnits).toEqual({ x: -19, y: -21 });
    expect(SWF_BATTLE_MARK_GEOMETRY.command_gather?.parentPlacementSourceUnits).toEqual({ x: -19, y: -21 });
    expect(SWF_BATTLE_MARK_GEOMETRY.target_retreat?.parentPlacementSourceUnits).toEqual({ x: 17, y: -14 });
    expect(SWF_BATTLE_MARK_GEOMETRY.target_charge?.parentPlacementSourceUnits).toEqual({ x: 17, y: -14 });
    expect(SWF_BATTLE_MARK_GEOMETRY.target_gather?.parentPlacementSourceUnits).toEqual({ x: 17, y: -14 });

    expect(getBattleFrameRenderOffsetSourceUnits("command_retreat")).toEqual({ x: -19, y: -37 });
    expect(getBattleFrameRenderOffsetSourceUnits("command_charge")).toEqual({ x: -19, y: -37 });
    expect(getBattleFrameRenderOffsetSourceUnits("command_gather")).toEqual({ x: -19, y: -37 });
    expect(getBattleFrameRenderOffsetSourceUnits("target_retreat", 0)).toEqual({ x: 18, y: -23.5 });
    expect(getBattleFrameRenderOffsetSourceUnits("target_gather", 8)).toEqual({ x: 18, y: -23.5 });
  });

  it("maps only confirmed caster techniques", () => {
    expect(specialCasterSequencesFor("GENERAL_HEROIC")).toEqual(["caster_muso_cyan", "aux_gri"]);
    expect(specialCasterSequencesFor("MOSA_KIJIN")).toEqual(["caster_oni_magenta"]);
    expect(specialCasterSequencesFor("CAVALRY_CHARGE")).toEqual(["caster_kiba_magenta"]);
    expect(specialCasterSequencesFor("ARCHER_ARROW")).toEqual([]);
    expect(getBattleFrameSequence("aux_gri")?.frameCount).toBe(15);
  });
});
