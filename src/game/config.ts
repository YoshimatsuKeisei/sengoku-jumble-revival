import {
  BATTLEFIELD_FIXED_FENCE_WORLD_RECTS,
  BATTLEFIELD_STRATEGY_WORLD_GEOMETRY,
  BATTLEFIELD_WORLD_SIZE,
} from "./battlefieldLayout";

export const GAME_WIDTH = 1600;
export const GAME_HEIGHT = 900;
export const SOLDIERS_PER_TEAM = 30;
export const AI_THINK_INTERVAL_MS = 100;
export const SOLDIER_RADIUS = 8;

export const BATTLEFIELD_CONFIG = {
  width: BATTLEFIELD_WORLD_SIZE.width,
  height: BATTLEFIELD_WORLD_SIZE.height,
  playerHomeX: 240,
  playerInterceptX: BATTLEFIELD_STRATEGY_WORLD_GEOMETRY.interceptFrontLineX.player,
  centerX: 1200,
  enemyInterceptX: BATTLEFIELD_STRATEGY_WORLD_GEOMETRY.interceptFrontLineX.enemy,
  enemyHomeX: 2160,
} as const;

// Shared base geometry/state values. Contact timing and lock behavior live in BASE_CONTACT_CONFIG.
export const BASE_CONFIG = {
  maxHp: 30,
  damagePerHit: 1,
  damageCoreHeightRatio: 0.3,
  rejoinOffset: 45,
  frontSegmentDepth: 14,
  gateWidthRatio: 0.55,
  gateDepth: 14,
  healingInteriorInset: SOLDIER_RADIUS + 6,
  healingMinSpacing: SOLDIER_RADIUS * 2.2,
  healingPlacementAttempts: 8,
} as const;

// Temporary Phase 3A timing; exact original-game attack timing is not yet confirmed.
export const COMBAT_TIMING_CONFIG = {
  attackWindupMs: 180,
  attackRecoveryMs: 320,
} as const;

// Temporary Phase 3B reaction tuning; exact original-game values are not yet confirmed.
export const REACTION_CONFIG = {
  hitStunMs: 180,
  knockbackDistance: 8,
} as const;

// Temporary Phase 3C soft-positioning values; this is not a slot reservation system.
export const CLOSE_COMBAT_POSITIONING_CONFIG = {
  sectorCount: 8,
  approachMargin: 3,
  crowdRadius: 20,
  crowdPenalty: 18,
  angleJitterDegrees: 6,
  radiusJitter: 2,
  debug: false,
} as const;

export const STRATEGY_AI_CONFIG = {
  returnRadius: 4,
  defendPredictionTicks: 30,
  rushRetargetIgnoreChance: 0.7,
} as const;

export const BASE_CONTACT_CONFIG = {
  lockLogicUpdates: 10,
  fortifyAttempts: 2,
  fortifySuccessChance: 0.5,
  baseBounceSourceDistance: 10,
  fortifyBounceSourceDistance: 2,
} as const;

// Temporary tuning values; the exact original-game values are not yet confirmed.
export const RECOVERY_CONFIG = {
  dangerHpRatio: 0.3,
  healingHpPerSecond: 1,
  arrivalTolerance: 4,
  debugStartPlayerLowHp: false,
} as const;

// Temporary tuning values; exact original-game command values are not yet confirmed.
export const COMMAND_CONFIG = {
  advanceRadius: 160,
  defendRadius: 160,
  commandDurationMs: 1_800,
  rallyInnerRadius: 35,
  rallyOuterRadius: 90,
  rallyMaxDurationMs: 3_000,
  commandCooldownMs: 300,
  rangeDisplayMs: 300,
} as const;

// Temporary local-avoidance tuning; this is intentionally not pathfinding.
export const OBSTACLE_AVOIDANCE_CONFIG = {
  lookAhead: 38,
  sideProbeDistance: 34,
  sideWeight: 1.25,
  commitMs: 450,
  debugObstacleAvoidance: false,
} as const;

export const BATTLE_OBSTACLES = BATTLEFIELD_FIXED_FENCE_WORLD_RECTS;

// Phase 3D prototype ranges. skill/combat/defense are placeholders, not claims
// about the original game's exact initialization rules.
export const PROTOTYPE_SOLDIER_STATS = {
  minMaxHp: 50,
  maxMaxHp: 70,
  minFoot: 1,
  maxFoot: 6,
  placeholderSkill: 50,
  placeholderCombat: 50,
  placeholderDefense: 50,
} as const;

export const PROTOTYPE_COMBAT_MAX = 100;
export const PROTOTYPE_DEFENSE_MAX = 100;
export const PROTOTYPE_SKILL_MAX = 100;

export const DEFENSE_CONFIG = {
  maxGuardRate: 0.75,
  guardMarkerDurationMs: 250,
} as const;

export const SPECIAL_ATTACK_CONFIG = {
  maxCooldownMs: 8_000,
  minCooldownMs: 3_500,
  radius: 48,
  damage: 1,
  knockbackDistance: 32,
  ringDurationMs: 250,
  retreatForwardDotMinimum: 0,
} as const;

// Phase 3I v1 prototype values; these are not claimed to be original-game internals.
export const SPECIAL_ABILITY_CONFIG = {
  randomCommonAbilityMin: 0, randomCommonAbilityMax: 2,
  doubleSpecialChance: 0.15, doubleSpecialDelayMs: 120,
  guardKnockbackDistance: 6, supportPulseRadius: 60,
  recoveryBoostMultiplier: 2,
  treatmentSearchRadius: 220, treatmentContactRadius: SOLDIER_RADIUS * 2 + 2, treatmentHealAmount: 5,
  fieldHospitalPerHolderChance: 0.05, fieldHospitalMaxChance: 0.60,
  trapPerHolderChance: 0.05, trapMaxChance: 0.60, trapDamage: 1,
  horoArrowDefenseMultiplier: 1.5, fleetFootRetreatMultiplier: 1.5,
  debugPlayerSpecialAbilities: null as import("./types").CommonSpecialAbilityId[] | null,
  debugShowAbilities: false,
} as const;

export const PLAYER_DEBUG_CONFIG = {
  playerAllCommonAbilities: true,
} as const;

export const SOLDIER_INSPECTOR_CONFIG = { holdMs: 400 } as const;

export const GUN_CONFIG = {
  shootingRange: 240,
  snipingRange: 340,
  damage: 1,
  smokeDurationMs: 300,
  shotLineDurationMs: 110,
  shooterFlashDurationMs: 100,
  bombardmentVictimSmokeDurationMs: 1_000,
  bombardmentVictimSmokeRadius: SOLDIER_RADIUS * 1.8,
} as const;

export const BATTLE_RANGE_UNIT_PX = GUN_CONFIG.shootingRange / 9;
export const ARCHER_CONFIG = {
  arrowRange: BATTLE_RANGE_UNIT_PX * 3,
  longShotRange: BATTLE_RANGE_UNIT_PX * 5,
  fireArrowRange: BATTLE_RANGE_UNIT_PX * 3,
  horokuRange: BATTLE_RANGE_UNIT_PX * 3,
  areaImpactRadius: SPECIAL_ATTACK_CONFIG.radius,
  damage: 1,
  projectileSpeedPxPerSecond: 420,
  impactFlashDurationMs: 120,
  flameDurationMs: 1_000,
  minMaxHp: 70, maxMaxHp: 110,
  minSkill: 70, maxSkill: 110,
  minCombat: 60, maxCombat: 110,
  minDefense: 60, maxDefense: 110,
  minFoot: 2, maxFoot: 4,
} as const;

export const CAVALRY_CONFIG = {
  minMaxHp: 70, maxMaxHp: 94,
  minSkill: 80, maxSkill: 110,
  foot: 6, combat: 125,
  minDefense: 40, maxDefense: 63,
  chargeRadiusMultiplier: 3,
  chargeKnockbackMultiplier: 2,
  chargeVisualDurationMs: 340,
} as const;

export const ASHIGARU_CONFIG = {
  minMaxHp: 70, maxMaxHp: 110,
  minSkill: 70, maxSkill: 110,
  minFoot: 2, maxFoot: 4,
  minCombat: 80, maxCombat: 110,
  minDefense: 70, maxDefense: 110,
  spearStrikeReach: SPECIAL_ATTACK_CONFIG.radius,
  spearStrikeHalfWidth: SOLDIER_RADIUS * 1.25,
  spearStrikeKnockbackRatio: 0.75,
  spearTipGlowDurationMs: 500,
} as const;

export const NINJA_CONFIG = {
  minMaxHp: 15, maxMaxHp: 47,
  minSkill: 70, maxSkill: 110,
  minFoot: 4, maxFoot: 5,
  minCombat: 105, maxCombat: 110,
  minDefense: 105, maxDefense: 110,
  maxPerTeam: 6,
  attackRange: SPECIAL_ATTACK_CONFIG.radius,
  forwardHalfAngleDegrees: 55,
  ninjutsuDashDistance: SPECIAL_ATTACK_CONFIG.radius * 1.35,
  shadowRunDashDistance: SPECIAL_ATTACK_CONFIG.radius * 1.35 * 1.45,
  ninjutsuKnockback: SPECIAL_ATTACK_CONFIG.knockbackDistance * 1.25,
  shadowRunKnockback: SPECIAL_ATTACK_CONFIG.knockbackDistance * 1.625,
  dashDurationMs: 150,
  barrierSupportRadius: SPECIAL_ATTACK_CONFIG.radius * 1.5,
  barrierHealMin: 4, barrierHealMax: 5,
  barrierAllyHealProc: 0.25, barrierSelfHealProc: 0.25,
  barrierForceSpecialProc: 0.25, barrierChargeProc: 0.25,
  barrierChargeDurationMs: 3_000,
  barrierRingDurationMs: 600,
  gunDefenseMultiplier: 0.65,
  foresightGunDefenseMultiplier: 0.9,
} as const;

export const GENERAL_CONFIG = {
  minMaxHp: 70, maxMaxHp: 110,
  minSkill: 70, maxSkill: 110,
  minFoot: 2, maxFoot: 4,
  minCombat: 70, maxCombat: 110,
  minDefense: 105, maxDefense: 110,
  maxPerTeam: 4,
  commandRadius: SPECIAL_ATTACK_CONFIG.radius * 5,
  heroicRadius: SPECIAL_ATTACK_CONFIG.radius,
  heroicStepDistance: SOLDIER_RADIUS,
  healRadius: SPECIAL_ATTACK_CONFIG.radius * 5,
  healAmount: 1,
  commandPulseDurationMs: 600,
  recipientSparkDurationMs: 220,
  healPulseDurationMs: 600,
} as const;

export const STRATEGIST_CONFIG = {
  minMaxHp: 60, maxMaxHp: 110,
  minSkill: 70, maxSkill: 110,
  minFoot: 2, maxFoot: 3,
  minCombat: 50, maxCombat: 110,
  minDefense: 70, maxDefense: 110,
  maxPerTeam: 4,
  fireDiameterUnits: {
    STRATEGIST_FIRE_PLAY: 1, STRATEGIST_FIRE_ATTACK: 3, STRATEGIST_FIRE_PLAN: 5,
    STRATEGIST_HELLFIRE: 7, STRATEGIST_FLAME_ART: 9,
  },
  fireZoneDurationMs: 1_000,
  falseReportRadius: BATTLE_RANGE_UNIT_PX * 3,
  sorceryRadius: BATTLE_RANGE_UNIT_PX * 3,
  healRadius: BATTLE_RANGE_UNIT_PX * 12,
  healAmount: 1,
  pulseDurationMs: 600,
} as const;

export const MOSA_CONFIG = {
  minMaxHp: 85, maxMaxHp: 110, minSkill: 70, maxSkill: 110, minFoot: 2, maxFoot: 4,
  minCombat: 105, maxCombat: 110, minDefense: 70, maxDefense: 110, maxPerTeam: 6,
  senpuuRadius: SPECIAL_ATTACK_CONFIG.radius, senpuuHalfAngleDegrees: 70,
  senpuuKnockback: SPECIAL_ATTACK_CONFIG.knockbackDistance * 1.25,
  musouRadius: SPECIAL_ATTACK_CONFIG.radius, musouKnockback: SPECIAL_ATTACK_CONFIG.knockbackDistance * 1.25,
  kijinRadius: SPECIAL_ATTACK_CONFIG.radius * 2, kijinKnockback: SPECIAL_ATTACK_CONFIG.knockbackDistance * 1.75,
  senpuuVisualDurationMs: 450, musouVisualDurationMs: 450, kijinVisualDurationMs: 520,
} as const;

export const SOLDIER_RUNTIME_CONFIG = {
  attackRange: 28,
  attackCooldownMs: 700,
} as const;

export const MOVEMENT_SPEED_CONFIG = {
  referenceSpeed: 80,
  footSpeedUnitPxPerSecond: 80 / 3,
  playerMinimumFoot: 3,
} as const;

export const CAMERA_CONFIG = {
  combatVisibleHeightRatio: 0.98,
  defaultVisibleWidthRatio: 0.65,
  maxZoomOutVisibleWidthRatio: 0.7,
  maxZoomInVisibleWidthRatio: 0.22,
  zoomStep: 0.1,
  zoomLerp: 0.18,
  followLerp: 0.16,
} as const;

export const PLAYER_MOUSE_DEAD_ZONE = 18;

export const NORMAL_ATTACK_DAMAGE = 1;
