import { describe, expect, it } from "vitest";
import markerSpec from "../../swf-spec/rules/unit_markers.json";
import {
  SWF_BATTLE_MARK_GEOMETRY,
  SWF_RECIPIENT_MARK_FRAME_CENTER_OFFSETS_SOURCE_UNITS,
  commandSequenceFor,
  getBattleFrameRenderOffsetSourceUnits,
  getBattleFrameSequence,
  sampleBattleFrameSequence,
  temporaryOrderSequenceFor,
} from "../../src/game/rendering/battleFrameSequenceManifest";
import { SWF_UNIT_HP_BAR_SOURCE_OFFSET } from "../../src/game/rendering/battleUnitUiAssets";

describe("SWF direct conformance: soldier-following battle markers", () => {
  it("keeps the critical ! fully above the HP bar/head region", () => {
    const rule = markerSpec.rules.find((candidate) => candidate.id === "CRITICAL_RETREAT_MARK_GEOMETRY");
    expect(rule?.status).toBe("confirmed");
    expect(rule?.expected.bitmapSizeSourceUnits).toEqual({ width: 19, height: 16 });
    expect(rule?.expected.parentPlacementSourceUnits).toEqual({ x: -9, y: -27 });
    expect(rule?.expected.revivalTextureCenterOffsetSourceUnits).toEqual({ x: 0, y: -20 });
    expect(rule?.expected.firstFrameVisibleBoundsSourceUnits.bottom).toBeLessThan(SWF_UNIT_HP_BAR_SOURCE_OFFSET.y);
    expect(SWF_BATTLE_MARK_GEOMETRY.critical_retreat?.spriteId).toBe(625);
    expect(SWF_BATTLE_MARK_GEOMETRY.critical_retreat?.bitmapId).toBe(622);
    expect(getBattleFrameRenderOffsetSourceUnits("critical_retreat")).toEqual({ x: 0, y: -20 });
    expect(sampleBattleFrameSequence("critical_retreat", 375)).toEqual({ frameIndex: 8, ended: false });
  });

  it("uses the large 14-frame issuer marks at the recovered placement", () => {
    const rule = markerSpec.rules.find((candidate) => candidate.id === "PLAYER_COMMAND_ISSUER_MARK_GEOMETRY");
    expect(rule?.status).toBe("confirmed");
    expect(rule?.expected.parentPlacementSourceUnits).toEqual({ x: -19, y: -21 });
    expect(rule?.expected.revivalTextureCenterOffsetSourceUnits).toEqual({ x: -19, y: -37 });
    expect(rule?.expected.frameCount).toBe(14);
    expect(SWF_BATTLE_MARK_GEOMETRY.command_charge?.bitmapSizeSourceUnits).toEqual({ width: 49, height: 54 });
    expect(SWF_BATTLE_MARK_GEOMETRY.command_retreat?.bitmapSizeSourceUnits).toEqual({ width: 48, height: 54 });
    expect(commandSequenceFor("ADVANCE")).toBe("command_charge");
    expect(commandSequenceFor("DEFEND_ORDER")).toBe("command_retreat");
    expect(commandSequenceFor("RALLY")).toBe("command_gather");
  });

  it("uses separate 18x19 nine-frame recipient sprites rather than issuer copies", () => {
    const rule = markerSpec.rules.find((candidate) => candidate.id === "PLAYER_COMMAND_RECIPIENT_MARK_GEOMETRY");
    expect(rule?.status).toBe("confirmed");
    expect(rule?.expected.recipientIsSeparateSmallerSprite).toBe(true);
    expect(rule?.expected.bitmapSizeSourceUnits).toEqual({ width: 18, height: 19 });
    expect(rule?.expected.parentPlacementSourceUnits).toEqual({ x: 17, y: -14 });
    expect(rule?.expected.frameCount).toBe(9);
    expect(rule?.expected.stopFrame).toBe(9);

    expect(temporaryOrderSequenceFor("RALLY", "player")).toBe("target_gather");
    expect(temporaryOrderSequenceFor("ADVANCE", "player")).toBe("target_charge");
    expect(temporaryOrderSequenceFor("DEFEND_ORDER", "player")).toBe("target_retreat");
    expect(getBattleFrameSequence("target_gather")?.directory).toBe("command-target-raw/szch");
    expect(getBattleFrameSequence("target_charge")?.directory).toBe("command-target-raw/sztt");
    expect(getBattleFrameSequence("target_retreat")?.directory).toBe("command-target-raw/szsh");
  });

  it("reproduces all nine recipient bitmap-center offsets", () => {
    expect(SWF_RECIPIENT_MARK_FRAME_CENTER_OFFSETS_SOURCE_UNITS).toEqual([
      { x: 18, y: -23.5 },
      { x: 20, y: -25.5 },
      { x: 22, y: -27.5 },
      { x: 23, y: -28.5 },
      { x: 24, y: -29.5 },
      { x: 24, y: -29.5 },
      { x: 21, y: -26.5 },
      { x: 19, y: -24.5 },
      { x: 18, y: -23.5 },
    ]);
    for (let frame = 0; frame < 9; frame += 1) {
      expect(getBattleFrameRenderOffsetSourceUnits("target_charge", frame))
        .toEqual(SWF_RECIPIENT_MARK_FRAME_CENTER_OFFSETS_SOURCE_UNITS[frame]);
    }
    expect(sampleBattleFrameSequence("target_charge", 500)).toEqual({ frameIndex: 8, ended: false });
  });
});
