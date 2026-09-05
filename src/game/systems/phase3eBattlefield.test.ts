import { describe, expect, it } from "vitest";
import { BASE_CONFIG, BATTLEFIELD_CONFIG, CAMERA_CONFIG, COMBAT_TIMING_CONFIG, MOVEMENT_SPEED_CONFIG, RECOVERY_CONFIG } from "../config";
import { BATTLEFIELD_BASE_WORLD_RECTS } from "../battlefieldLayout";
import { createSoldier } from "../entities/Soldier";
import { calculateMoveSpeedFromFoot } from "../stats/soldierStats";
import { updateAttackStates } from "./attackSystem";
import { createBattleBases, distanceToBaseEdge, getBaseForTeam } from "./baseSystem";
import {
  getBaseDamageCoreRect,
  getBaseGatePoint,
  getBaseHealingInteriorRect,
  getBaseRect,
  getBaseUpperGateRect,
  getTeamForwardSign,
  isInsideFriendlyBaseHealingArea,
} from "./battlefieldGeometry";
import { clampCameraZoom, getCameraZoomLimits, getFollowScroll, visibleWorldWidth } from "./cameraSystem";
import { updateTemporaryOrder } from "./commandSystem";
import { recoveryDestinationFor, rejoinPointFor, startEmergencyRetreat, updateEmergencyRetreat, updateHealing } from "./recoverySystem";

describe("Phase 3E horizontal battlefield", () => {
  it("is wider than it is tall and places bases at opposite sides", () => {
    const bases = createBattleBases();
    expect(BATTLEFIELD_CONFIG.width).toBeGreaterThan(BATTLEFIELD_CONFIG.height);
    expect(getBaseForTeam(bases, "player").x).toBeLessThan(BATTLEFIELD_CONFIG.centerX);
    expect(getBaseForTeam(bases, "enemy").x).toBeGreaterThan(BATTLEFIELD_CONFIG.centerX);
  });

  it("defines shared forward signs", () => {
    expect(getTeamForwardSign("player")).toBe(1);
    expect(getTeamForwardSign("enemy")).toBe(-1);
  });

  it("moves ADVANCE along the forward X direction and DEFEND toward the player ring", () => {
    for (const team of ["player", "enemy"] as const) {
      const player = createSoldier(`${team}-p`, team, "player", 1800, 450);
      const soldier = createSoldier(`${team}-a`, team, "ai", 1800, 450);
      soldier.temporaryOrder = { type: "ADVANCE", issuedAt: 0, expiresAt: 1000, sourceX: 1800, sourceY: 450 };
      updateTemporaryOrder(soldier, player, 1);
      expect(Math.sign((soldier.moveTargetX ?? soldier.x) - soldier.x)).toBe(getTeamForwardSign(team));
      soldier.temporaryOrder = { type: "DEFEND_ORDER", issuedAt: 0, expiresAt: 1000, sourceX: 1800, sourceY: 450 };
      updateTemporaryOrder(soldier, player, 2);
      expect(Math.hypot((soldier.moveTargetX ?? 0) - player.x, (soldier.moveTargetY ?? 0) - player.y)).toBeCloseTo(62.5);
    }
  });
});

describe("Phase 3E linear foot speed", () => {
  it("maps foot 1, 2, and 6 directly to the configured unit", () => {
    expect(calculateMoveSpeedFromFoot(1)).toBe(MOVEMENT_SPEED_CONFIG.footSpeedUnitPxPerSecond);
    expect(calculateMoveSpeedFromFoot(2)).toBe(2 * MOVEMENT_SPEED_CONFIG.footSpeedUnitPxPerSecond);
    expect(calculateMoveSpeedFromFoot(6)).toBe(6 * MOVEMENT_SPEED_CONFIG.footSpeedUnitPxPerSecond);
    expect(calculateMoveSpeedFromFoot(6)).toBe(6 * calculateMoveSpeedFromFoot(1));
  });
});

describe("Phase 3E rectangular base geometry", () => {
  it("uses the manifest-derived world rectangles for both bases", () => {
    const [player, enemy] = createBattleBases();
    for (const [base, expected] of [[player, BATTLEFIELD_BASE_WORLD_RECTS.player], [enemy, BATTLEFIELD_BASE_WORLD_RECTS.enemy]] as const) {
      const actual = getBaseRect(base);
      expect(actual.x).toBeCloseTo(expected.x);
      expect(actual.y).toBeCloseTo(expected.y);
      expect(actual.width).toBeCloseTo(expected.width);
      expect(actual.height).toBeCloseTo(expected.height);
    }
  });

  it("derives a centered damage core using full width and 30% height", () => {
    const base = getBaseForTeam(createBattleBases(), "enemy");
    const core = getBaseDamageCoreRect(base);
    expect(core.width).toBe(BASE_CONFIG.frontSegmentDepth);
    expect(core.height).toBe(base.height * BASE_CONFIG.damageCoreHeightRatio);
    expect(core.y + core.height / 2).toBe(base.y);
  });

  it("distinguishes the healing rectangle from the damage core", () => {
    const base = getBaseForTeam(createBattleBases(), "player");
    const rect = getBaseRect(base);
    const healingRect = getBaseHealingInteriorRect(base);
    const ally = createSoldier("ally", "player", "ai", healingRect.x + healingRect.width / 2, healingRect.y + healingRect.height / 2);
    const enemy = createSoldier("enemy", "enemy", "ai", base.x, rect.y + 10);
    expect(isInsideFriendlyBaseHealingArea(ally, base)).toBe(true);
    expect(isInsideFriendlyBaseHealingArea(enemy, base)).toBe(false);
    expect(distanceToBaseEdge(enemy, base)).toBeGreaterThan(BASE_CONFIG.attackRange);
  });

  it("allows base attacks only at the central core and rechecks at hit time", () => {
    const bases = createBattleBases();
    const base = getBaseForTeam(bases, "enemy");
    const attacker = createSoldier("a", "player", "ai", base.x - base.width / 2 - BASE_CONFIG.attackRange, base.y);
    updateAttackStates([attacker], bases, 0);
    expect(attacker.attackTargetKind).toBe("BASE");
    expect(base.hp).toBe(base.maxHp);
    attacker.y = base.y + base.height / 2;
    updateAttackStates([attacker], bases, COMBAT_TIMING_CONFIG.attackWindupMs);
    expect(base.hp).toBe(base.maxHp);
  });
});

describe("Phase 3E base healing", () => {
  it("targets the friendly base and enters healing inside it", () => {
    const bases = createBattleBases();
    const base = getBaseForTeam(bases, "player");
    const soldier = createSoldier("s", "player", "ai", base.x, base.y - 100);
    startEmergencyRetreat(soldier, bases);
    expect(recoveryDestinationFor("player", bases)).toEqual({ x: base.x, y: base.y });
    const gate = soldier.recoveryGate!;
    Object.assign(soldier, getBaseGatePoint(base, gate, false));
    updateEmergencyRetreat(soldier, bases);
    expect(soldier.state).toBe("EMERGENCY_RETREAT");
    Object.assign(soldier, getBaseGatePoint(base, gate, true));
    updateEmergencyRetreat(soldier, bases);
    expect(soldier.state).toBe("HEALING");
  });

  it("heals at exactly 1 HP/sec using delta time and caps at max HP", () => {
    const soldier = createSoldier("s", "player", "ai", 0, 0);
    soldier.state = "HEALING";
    soldier.hp = soldier.maxHp - 20;
    updateHealing(soldier, 0.5);
    expect(soldier.hp).toBe(soldier.maxHp - 19.5);
    updateHealing(soldier, 5);
    expect(soldier.hp).toBe(soldier.maxHp - 14.5);
    updateHealing(soldier, 100);
    expect(soldier.hp).toBe(soldier.maxHp);
    expect(soldier.state).toBe("NORMAL");
    expect(RECOVERY_CONFIG.healingHpPerSecond).toBe(1);
  });

  it("derives rejoin exits from the selected top gate", () => {
    const bases = createBattleBases();
    for (const team of ["player", "enemy"] as const) {
      const base = getBaseForTeam(bases, team);
      const point = rejoinPointFor(team, base.y - 100, bases);
      const exit = getBaseGatePoint(base, "TOP", false);
      expect(point).toEqual(exit);
      const gateRect = getBaseUpperGateRect(base);
      expect(exit.x).toBe(gateRect.x + gateRect.width / 2);
      expect(exit.y).toBeLessThan(base.y - base.height / 2);
    }
  });
});

describe("Phase 3E camera math", () => {
  it("maps zoom limits to 70%, 35%, and 22% visible world widths", () => {
    const viewport = 1600;
    const limits = getCameraZoomLimits(viewport);
    expect(visibleWorldWidth(viewport, limits.min) / BATTLEFIELD_CONFIG.width).toBeCloseTo(CAMERA_CONFIG.maxZoomOutVisibleWidthRatio);
    expect(visibleWorldWidth(viewport, limits.defaultZoom) / BATTLEFIELD_CONFIG.width).toBeCloseTo(CAMERA_CONFIG.defaultVisibleWidthRatio);
    expect(visibleWorldWidth(viewport, limits.max) / BATTLEFIELD_CONFIG.width).toBeCloseTo(CAMERA_CONFIG.maxZoomInVisibleWidthRatio);
  });

  it("clamps zoom and remains valid for resized viewports", () => {
    for (const viewport of [800, 1200, 1920]) {
      const limits = getCameraZoomLimits(viewport);
      expect(clampCameraZoom(-1, viewport)).toBe(limits.min);
      expect(clampCameraZoom(999, viewport)).toBe(limits.max);
      expect(limits.min).toBeLessThanOrEqual(limits.defaultZoom);
      expect(limits.defaultZoom).toBeLessThan(limits.max);
    }
  });

  it("follows horizontally within bounds while keeping Y centered", () => {
    const zoom = getCameraZoomLimits(1600).defaultZoom;
    const left = getFollowScroll(0, zoom, 1600, 900);
    const right = getFollowScroll(BATTLEFIELD_CONFIG.width, zoom, 1600, 900);
    expect(left.x).toBe(0);
    expect(right.x).toBeGreaterThan(left.x);
    expect(right.x + 1600 / zoom).toBe(BATTLEFIELD_CONFIG.width);
    expect(left.y).toBe(right.y);
  });
});
