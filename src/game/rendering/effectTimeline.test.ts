import { describe, expect, it } from "vitest";
import { decomposeEffectMatrix, hasEffectReachedArrival, multiplyEffectMatrices, resolveEffectTimeline } from "./effectTimeline";

describe("effect timeline playback", () => {
  it("uses authoritative SWF frames including a transparent first projectile frame", () => {
    expect(resolveEffectTimeline("archer_teppou_attack2_projectile", 0)).toMatchObject({
      swfFrame: 1, visible: false, ended: false, region: null,
    });
    expect(resolveEffectTimeline("archer_teppou_attack2_projectile", 42)).toMatchObject({
      swfFrame: 2, visible: true, ended: false, region: { region_id: "bitmap_996" },
    });
    expect(resolveEffectTimeline("archer_teppou_attack2_projectile", 84)).toMatchObject({
      swfFrame: 3, region: { region_id: "bitmap_998" },
    });
    expect(resolveEffectTimeline("archer_teppou_attack2_projectile", 126)).toMatchObject({
      swfFrame: 4, region: { region_id: "bitmap_1000" },
    });
  });

  it("ends a non-looping effect and wraps a looping manifest sequence", () => {
    expect(resolveEffectTimeline("archer_teppou_attack2_projectile", 167)).toMatchObject({ ended: true, visible: false });
    const loop = resolveEffectTimeline("as_ase1", 0)!;
    const wrapped = resolveEffectTimeline("as_ase1", loop.sequence.duration_ms + 1)!;
    expect(wrapped.ended).toBe(false);
    expect(wrapped.swfFrame).toBe(1);
  });

  it("reports projectile arrival at 110ms without changing combat timing", () => {
    expect(hasEffectReachedArrival(109.999, 110)).toBe(false);
    expect(hasEffectReachedArrival(110, 110)).toBe(true);
    expect(hasEffectReachedArrival(200, 110)).toBe(true);
    expect(hasEffectReachedArrival(200, 0)).toBe(false);
  });

  it("applies selector placement before the effect root", () => {
    const hit = resolveEffectTimeline("fr_exp", 0)!;
    expect(hit.visible).toBe(true);
    expect(hit.matrix).toEqual({ a: 1, b: 0, c: 0, d: 1, tx: -45, ty: -70 });
  });

  it("composes and decomposes affine transforms", () => {
    const composed = multiplyEffectMatrices(
      { a: 1, b: 0, c: 0, d: 1, tx: 10, ty: 20 },
      { a: 0, b: 2, c: -3, d: 0, tx: 4, ty: 5 },
    );
    expect(composed).toEqual({ a: 0, b: 2, c: -3, d: 0, tx: 14, ty: 25 });
    expect(decomposeEffectMatrix(composed)).toMatchObject({ x: 14, y: 25, rotation: Math.PI / 2, scaleX: 2, scaleY: 3, shear: 0 });
  });
});
