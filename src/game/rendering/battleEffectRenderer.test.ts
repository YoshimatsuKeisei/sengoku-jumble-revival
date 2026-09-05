import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({
  default: {
    Textures: { FilterMode: { NEAREST: 0 } },
    Math: { Linear: (start: number, end: number, amount: number) => start + (end - start) * amount },
  },
}));

import { UNIT_ATLAS_ASSETS } from "./effectManifest";
import { BattleEffectRenderer } from "./battleEffectRenderer";

function makeScene() {
  const frames = new Set<string>();
  const texture = {
    setFilter: vi.fn(),
    has: vi.fn((frame: string) => frames.has(frame)),
    add: vi.fn((frame: string) => { frames.add(frame); }),
  };
  const images: Array<Record<string, ReturnType<typeof vi.fn>>> = [];
  const scene = {
    textures: {
      exists: vi.fn(() => true),
      get: vi.fn(() => texture),
    },
    add: {
      image: vi.fn(() => {
        const image: Record<string, ReturnType<typeof vi.fn>> = {};
        for (const method of ["setOrigin", "setDepth", "setVisible", "setTexture", "setPosition", "setRotation", "setScale"])
          image[method] = vi.fn(() => image);
        image.destroy = vi.fn();
        images.push(image);
        return image;
      }),
    },
  };
  return { scene, images };
}

describe("BattleEffectRenderer", () => {
  it("rejects runtime-disabled effects", () => {
    const { scene } = makeScene();
    const renderer = new BattleEffectRenderer(scene as never, UNIT_ATLAS_ASSETS);
    expect(renderer.play("as_ase3", 0, { x: 0, y: 0 })).toBe(false);
    expect(renderer.activeCount).toBe(0);
  });

  it("creates multiple sequences independently and destroys them after their timelines", () => {
    const { scene, images } = makeScene();
    const renderer = new BattleEffectRenderer(scene as never, UNIT_ATLAS_ASSETS);
    expect(renderer.play("fr_kex", 0, { x: 10, y: 20 })).toBe(true);
    expect(renderer.play("fr_exp", 0, { x: 10, y: 20 })).toBe(true);
    expect(renderer.activeCount).toBe(2);
    renderer.update(900);
    expect(renderer.activeCount).toBe(0);
    expect(images.every((image) => image.destroy.mock.calls.length === 1)).toBe(true);
  });

  it("keeps a projectile alive for its gameplay flight and notifies arrival only once", () => {
    const { scene, images } = makeScene();
    const renderer = new BattleEffectRenderer(scene as never, UNIT_ATLAS_ASSETS);
    const arrived = vi.fn();
    expect(renderer.play("archer_teppou_attack2_projectile", 100, { x: 0, y: 0 }, {
      end: { x: 50, y: 25 }, travelDurationMs: 500, persistUntilArrival: true,
      destroyOnArrival: true, onArrive: arrived,
    })).toBe(true);
    renderer.update(400);
    expect(renderer.activeCount).toBe(1);
    renderer.update(600);
    renderer.update(700);
    expect(arrived).toHaveBeenCalledTimes(1);
    expect(arrived).toHaveBeenCalledWith(600);
    expect(renderer.activeCount).toBe(0);
    expect(images[0].destroy).toHaveBeenCalledTimes(1);
  });

  it("ends a tracked looping target effect safely when the target disappears", () => {
    const { scene, images } = makeScene();
    const renderer = new BattleEffectRenderer(scene as never, UNIT_ATLAS_ASSETS);
    let active = true;
    expect(renderer.play("as_kr2", 0, { x: 1, y: 2 }, { isActive: () => active })).toBe(true);
    renderer.update(100);
    active = false;
    expect(() => renderer.update(200)).not.toThrow();
    expect(renderer.activeCount).toBe(0);
    expect(images[0].destroy).toHaveBeenCalledTimes(1);
  });
});
