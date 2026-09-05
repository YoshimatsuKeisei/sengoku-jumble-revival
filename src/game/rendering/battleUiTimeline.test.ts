import { describe, expect, it } from "vitest";
import {
  BattleEventNoticeController,
  BattleUiTimelinePlayer,
  getBattleEventNoticeFrameState,
  getControlsPromptAlpha,
  getKaltRulesAlpha,
  getKpbFrame,
  getUwdPanelY,
} from "./battleUiTimeline";

describe("SWF battle UI timeline", () => {
  it("uses integer 24fps frames and completes a one-shot playback", () => {
    const player = new BattleUiTimelinePlayer();
    player.playOnce(1_000, 2, 45);
    expect(player.currentFrame(1_000)).toBe(2);
    expect(player.currentFrame(1_000 + 1_000 / 24)).toBe(3);
    expect(player.currentFrame(1_000 + 44_000 / 24)).toBe(1);
    expect(player.isPlaying).toBe(false);

    player.playUntilStop(2_000, 2, 13);
    expect(player.currentFrame(2_000 + 11_000 / 24)).toBe(13);
    expect(player.isPlaying).toBe(false);
  });

  it("matches the ma/ea CSV entrance frames", () => {
    expect(getBattleEventNoticeFrameState("player", 3)).toMatchObject({ bandX: -101, iconX: 4, bandWhiteOverlayAlpha: 1 });
    expect(getBattleEventNoticeFrameState("player", 4)).toMatchObject({ bandX: -26.75, bandWhiteOverlayAlpha: 0.25 });
    expect(getBattleEventNoticeFrameState("enemy", 3)).toMatchObject({ bandX: 286, iconX: 359 });
    expect(getBattleEventNoticeFrameState("enemy", 6)).toMatchObject({ bandX: 186, textVisible: true, iconVisible: false });
  });

  it("does not restart the same cm, but replaces a running different message", () => {
    const notice = new BattleEventNoticeController();
    expect(notice.trigger("first", 0)).toBe(true);
    expect(notice.timeline.currentFrame(100)).toBe(4);
    expect(notice.trigger("first", 100)).toBe(false);
    expect(notice.timeline.currentFrame(100)).toBe(4);
    expect(notice.trigger("second", 100)).toBe(true);
    expect(notice.timeline.currentFrame(100)).toBe(2);
  });

  it("matches uwd entrance/exit, prompt fade, kpb quantization and kalt endpoints", () => {
    expect([3, 4, 13, 98, 99, 107].map(getUwdPanelY)).toEqual([380, 372.4, 340, 340, 340.5, 380]);
    expect([5, 6, 11, 81, 82, 84, 85].map(getControlsPromptAlpha)).toEqual([0, 0, 1, 1, 0.667969, 0, 0]);
    expect([getKpbFrame(0), getKpbFrame(0.5), getKpbFrame(1)]).toEqual([1, 51, 100]);
    expect([getKaltRulesAlpha(1), getKaltRulesAlpha(13), getKaltRulesAlpha(152), getKaltRulesAlpha(165), getKaltRulesAlpha(166)])
      .toEqual([0, 1, 1, 0, null]);
  });
});
