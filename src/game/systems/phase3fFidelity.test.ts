import { describe, expect, it } from "vitest";
import { BASE_CONFIG, BATTLEFIELD_CONFIG, BATTLE_OBSTACLES, CAMERA_CONFIG, PLAYER_MOUSE_DEAD_ZONE, SOLDIER_RADIUS } from "../config";
import { BATTLEFIELD_FIXED_FENCE_SOURCE_RECTS, battlefieldSourceRectToWorld } from "../battlefieldLayout";
import { createSoldier } from "../entities/Soldier";
import { canAttackEnemyBase, createBattleBases, getBaseForTeam } from "./baseSystem";
import { updateAiTargets } from "./aiSystem";
import {
  getBaseDamageCoreRect,
  getBaseGatePoint,
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

describe("Phase 3F base gates and healing route", () => {
  it("keeps the base inside the world margin and maps the upper/lower horizontal gate fences", () => {
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
      expect(core.height).toBe(base.height * 0.3);
    }
  });

  it("places a radius-inset healing interior wholly inside the base", () => {
    const base = createBattleBases()[0];
    const outer = getBaseRect(base);
    const interior = getBaseHealingInteriorRect(base);
    expect(interior.x).toBeGreaterThan(outer.x);
    expect(interior.y).toBeGreaterThan(outer.y);
    expect(interior.x + interior.width).toBeLessThan(outer.x + outer.width);
    expect(interior.y + interior.height).toBeLessThan(outer.y + outer.height);
  });

  it("chooses upper and lower gates from the soldier's Y position", () => {
    const base = createBattleBases()[0];
    expect(getPreferredBaseGate({ id: "upper", y: base.y - 100 }, base)).toBe("TOP");
    expect(getPreferredBaseGate({ id: "lower", y: base.y + 100 }, base)).toBe("BOTTOM");
  });

  it("routes retreat through the selected gate before entering the interior", () => {
    const bases = createBattleBases();
    const base = getBaseForTeam(bases, "player");
    const soldier = createSoldier("s", "player", "ai", 600, base.y - 100);
    startEmergencyRetreat(soldier, bases);
    expect(soldier.recoveryGate).toBe("TOP");
    expect(soldier.moveTargetY).toBe(getBaseGatePoint(base, "TOP", false).y);
    expect(soldier.moveTargetY).not.toBe(base.y);

    Object.assign(soldier, getBaseGatePoint(base, "TOP", false));
    updateEmergencyRetreat(soldier, bases);
    expect(soldier.recoveryGateEntered).toBe(false);
    expect(soldier.state).toBe("EMERGENCY_RETREAT");
    Object.assign(soldier, getBaseGatePoint(base, "TOP", true));
    updateEmergencyRetreat(soldier, bases);
    expect(soldier.recoveryGateEntered).toBe(true);
    expect(soldier.state).toBe("HEALING");
    expect(isPointInsideRect(soldier, getBaseHealingInteriorRect(base))).toBe(true);
  });

  it("heals at 1 HP/sec and snaps outside through its stored gate", () => {
    const bases = createBattleBases();
    const base = getBaseForTeam(bases, "player");
    const soldier = createSoldier("s", "player", "ai", 0, 0);
    soldier.state = "HEALING";
    soldier.recoveryGate = "BOTTOM";
    soldier.hp = soldier.maxHp - 1;
    updateHealing(soldier, 1, bases);
    expect(soldier.hp).toBe(soldier.maxHp);
    expect(soldier.state).toBe("NORMAL");
    expect({ x: soldier.x, y: soldier.y }).toEqual(getBaseGatePoint(base, "BOTTOM", false));
    expect(soldier.moveTargetX).toBeNull();
    expect(isPointInsideRect(soldier, getBaseHealingInteriorRect(base))).toBe(false);
  });

  it("allows core attacks but rejects upper and lower gate contact", () => {
    const bases = createBattleBases();
    const base = getBaseForTeam(bases, "enemy");
    for (const gate of ["TOP", "BOTTOM"] as const) {
      const point = getBaseGatePoint(base, gate, false);
      const attacker = createSoldier(gate, "player", "ai", point.x, point.y);
      expect(canAttackEnemyBase(attacker, base)).toBe(false);
    }
    const core = getBaseDamageCoreRect(base);
    const attacker = createSoldier("core", "player", "ai", core.x - SOLDIER_RADIUS, core.y + core.height / 2);
    expect(canAttackEnemyBase(attacker, base)).toBe(true);
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
