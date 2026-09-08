import { describe, expect, it } from "vitest";
import { BASE_CONFIG, BATTLEFIELD_CONFIG, BATTLE_OBSTACLES, CAMERA_CONFIG, PLAYER_MOUSE_DEAD_ZONE } from "../config";
import { BATTLEFIELD_FIXED_FENCE_SOURCE_RECTS, battlefieldSourcePointToWorld, battlefieldSourceRectToWorld, battlefieldWorldPointToSource } from "../battlefieldLayout";
import { createSoldier } from "../entities/Soldier";
import { createBattleBases, getBaseForTeam } from "./baseSystem";
import { updateAiTargets } from "./aiSystem";
import {
  getBaseDamageCoreRect,
  getBaseHealingInteriorRect,
  getBaseLowerGateRect,
  getBaseRect,
  getBaseUpperGateRect,
  getPreferredBaseGate,
  isPointInsideRect,
} from "./battlefieldGeometry";
import { getCameraZoomLimits, getViewModeZoom, toggleCameraViewMode, visibleWorldWidth } from "./cameraSystem";
import { issueAdvanceCommand, issueDefendCommand, issueRallyCommand } from "./commandSystem";
import { getPointerMoveDirection } from "./movementSystem";
import { startEmergencyRetreat, updateEmergencyRetreat, updateHealing } from "./recoverySystem";
import { getSwfBaseCollisionCodeAtWorld } from "./swfBaseCollisionGrid";

describe("Phase 3F battlefield and camera fidelity", () => {
  it("uses the corrected 2400 x 900 world", () => {
    expect(BATTLEFIELD_CONFIG).toMatchObject({ width: 2400, height: 900 });
    expect(BATTLEFIELD_CONFIG.width).toBeGreaterThan(BATTLEFIELD_CONFIG.height);
  });

  it("shows almost all height in combat view and a wider non-full overview", () => {
    const combat = getViewModeZoom("COMBAT", 1600, 900);
    const overview = getViewModeZoom("OVERVIEW", 1600, 900);
    expect(900 / combat / BATTLEFIELD_CONFIG.height).toBeGreaterThanOrEqual(0.95);
    expect(visibleWorldWidth(1600, overview)).toBeGreaterThan(visibleWorldWidth(1600, combat));
    expect(visibleWorldWidth(1600, overview) / BATTLEFIELD_CONFIG.width).toBeCloseTo(CAMERA_CONFIG.maxZoomOutVisibleWidthRatio);
    expect(visibleWorldWidth(1600, overview)).toBeLessThan(BATTLEFIELD_CONFIG.width);
  });

  it("toggles view modes and exposes combat zoom as reset target", () => {
    expect(toggleCameraViewMode("COMBAT")).toBe("OVERVIEW");
    expect(toggleCameraViewMode("OVERVIEW")).toBe("COMBAT");
    expect(getViewModeZoom("COMBAT", 1600, 900)).toBe(getCameraZoomLimits(1600, 900).defaultZoom);
  });
});

describe("Phase 3F controls", () => {
  it("issues DEFEND_ORDER, ADVANCE, and RALLY from the A/S/D command functions", () => {
    const player = createSoldier("p", "player", "player", 500, 450);
    const ally = createSoldier("a", "player", "ai", 520, 450);
    const soldiers = [player, ally];
    issueDefendCommand(player, soldiers, 0);
    expect(ally.temporaryOrder?.type).toBe("DEFEND_ORDER");
    ally.temporaryOrder = null;
    issueAdvanceCommand(player, soldiers, 1);
    expect(ally.temporaryOrder).toMatchObject({ type: "ADVANCE" });
    ally.temporaryOrder = null;
    issueRallyCommand(player, soldiers, 2);
    expect(ally.temporaryOrder).toMatchObject({ type: "RALLY" });
  });

  it("converts mouse direction to a normalized vector and honors the dead zone", () => {
    expect(getPointerMoveDirection({ x: 100, y: 100 }, { x: 110, y: 100 }, PLAYER_MOUSE_DEAD_ZONE)).toEqual({ x: 0, y: 0 });
    const direction = getPointerMoveDirection({ x: 100, y: 100 }, { x: 130, y: 140 }, PLAYER_MOUSE_DEAD_ZONE);
    expect(direction.x).toBeCloseTo(0.6);
    expect(direction.y).toBeCloseTo(0.8);
  });

  it("lets a defending recipient engage a nearby enemy without advancing", () => {
    const player = createSoldier("p", "player", "player", 500, 450);
    const ally = createSoldier("a", "player", "ai", 520, 450);
    const enemy = createSoldier("e", "enemy", "ai", 550, 450);
    issueDefendCommand(player, [player, ally, enemy], 0);
    updateAiTargets([player, ally, enemy], 1);
    expect(ally.targetId).toBe(enemy.id);
    expect(ally.temporaryOrder?.type).toBe("DEFEND_ORDER");
  });
});

describe("Phase 3F visual base geometry and direct SWF recovery route", () => {
  it("keeps the visual base inside the world and maps upper/lower fence alpha bounds", () => {
    for (const base of createBattleBases()) {
      const rect = getBaseRect(base);
      const upper = getBaseUpperGateRect(base);
      const core = getBaseDamageCoreRect(base);
      const lower = getBaseLowerGateRect(base);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(BATTLEFIELD_CONFIG.width);
      expect(upper.y).toBeCloseTo(rect.y);
      expect(lower.y + lower.height).toBeCloseTo(rect.y + rect.height);
      expect(upper.y + upper.height).toBeLessThan(core.y);
      expect(lower.y).toBeGreaterThan(core.y + core.height);
      expect(core.height).toBe(base.height * BASE_CONFIG.damageCoreHeightRatio);
    }
  });

  it("places a radius-inset reconstructed healing interior wholly inside the visual base", () => {
    const base = createBattleBases()[0];
    const outer = getBaseRect(base);
    const interior = getBaseHealingInteriorRect(base);
    expect(interior.x).toBeGreaterThan(outer.x);
    expect(interior.y).toBeGreaterThan(outer.y);
    expect(interior.x + interior.width).toBeLessThan(outer.x + outer.width);
    expect(interior.y + interior.height).toBeLessThan(outer.y + outer.height);
  });

  it("keeps the visual nearest-gate helper as layout-only geometry", () => {
    const base = createBattleBases()[0];
    expect(getPreferredBaseGate({ id: "upper", y: base.y - 100 }, base)).toBe("TOP");
    expect(getPreferredBaseGate({ id: "lower", y: base.y + 100 }, base)).toBe("BOTTOM");
  });

  it("routes retreat through SWF p91 then p93 before confirmed recovery tile 999", () => {
    const bases = createBattleBases();
    const start = battlefieldSourcePointToWorld({ x: 600, y: 500 });
    const soldier = createSoldier("s", "player", "ai", start.x, start.y);
    startEmergencyRetreat(soldier, bases);
    expect(soldier.recoveryGate).toBe("TOP");
    let target = battlefieldWorldPointToSource({ x: soldier.moveTargetX!, y: soldier.moveTargetY! });
    expect(target).toEqual({ x: 140, y: 249 });

    Object.assign(soldier, battlefieldSourcePointToWorld({ x: 231, y: 249 }));
    updateEmergencyRetreat(soldier, bases);
    expect((soldier as typeof soldier & { recoveryEntryCommitted?: boolean }).recoveryEntryCommitted).toBe(true);
    target = battlefieldWorldPointToSource({ x: soldier.moveTargetX!, y: soldier.moveTargetY! });
    expect(target).toEqual({ x: 70, y: 580 });

    Object.assign(soldier, battlefieldSourcePointToWorld({ x: 216, y: 432 }));
    updateEmergencyRetreat(soldier, bases);
    expect(soldier.recoveryGateEntered).toBe(true);
    expect(soldier.state).toBe("HEALING");
    expect(isPointInsideRect(soldier, getBaseHealingInteriorRect(getBaseForTeam(bases, "player")))).toBe(true);
  });

  it("heals at the SWF rate and transitions into the lower p7 rejoin route instead of snapping to a visual gate", () => {
    const bases = createBattleBases();
    const start = battlefieldSourcePointToWorld({ x: 100, y: 600 });
    const soldier = createSoldier("s", "player", "ai", start.x, start.y);
    soldier.state = "HEALING";
    soldier.recoveryGate = "BOTTOM";
    soldier.hp = soldier.maxHp;
    updateHealing(soldier, 1 / 24, bases);
    expect(soldier.hp).toBe(soldier.maxHp);
    expect(soldier.state).toBe("REJOINING");
    expect(battlefieldWorldPointToSource(soldier).y).toBeCloseTo(782, 6);
    const target = battlefieldWorldPointToSource({ x: soldier.moveTargetX!, y: soldier.moveTargetY! });
    expect(target).toEqual({ x: 346, y: 946 });
  });

  it("uses 996 only for central base damage while upper/lower front cells are 998 recovery-wall cells", () => {
    expect(getSwfBaseCollisionCodeAtWorld(battlefieldSourcePointToWorld({ x: 1605, y: 540 }))).toBe(996);
    expect(getSwfBaseCollisionCodeAtWorld(battlefieldSourcePointToWorld({ x: 1620, y: 432 }))).toBe(998);
    expect(getSwfBaseCollisionCodeAtWorld(battlefieldSourcePointToWorld({ x: 1620, y: 756 }))).toBe(998);
  });
});

describe("Phase 3F symmetric fences", () => {
  it("maps all six non-base SWF fence bounds into world coordinates", () => {
    expect(BATTLE_OBSTACLES).toHaveLength(6);
    for (const source of BATTLEFIELD_FIXED_FENCE_SOURCE_RECTS) {
      const actual = BATTLE_OBSTACLES.find((fence) => fence.id === source.id)!;
      const expected = battlefieldSourceRectToWorld(source);
      expect(actual.x).toBeCloseTo(expected.x);
      expect(actual.y).toBeCloseTo(expected.y);
      expect(actual.width).toBeCloseTo(expected.width);
      expect(actual.height).toBeCloseTo(expected.height);
    }
  });

  it("leaves a broad obstacle-free central lane", () => {
    const centerClearance = Math.min(...BATTLE_OBSTACLES.map((fence) => Math.abs((fence.x + fence.width / 2) - BATTLEFIELD_CONFIG.centerX)));
    expect(centerClearance).toBeGreaterThan(250);
  });
});
