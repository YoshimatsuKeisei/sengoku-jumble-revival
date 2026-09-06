export type Team = "player" | "enemy";
export type ControllerType = "player" | "ai";
export type Strategy = "charge" | "defend" | "intercept" | "melee" | "wait";
export type SoldierState = "NORMAL" | "EMERGENCY_RETREAT" | "HEALING" | "REJOINING";
export type TemporaryOrderType = "ADVANCE" | "DEFEND_ORDER" | "RALLY" | "NINJA_BARRIER_CHARGE" | "JINTO_CHARGE";
export type BaseGate = "TOP" | "BOTTOM";
export type UnitType = "PROTOTYPE" | "TEPPOU" | "CAVALRY" | "ARCHER" | "ASHIGARU" | "NINJA" | "GENERAL" | "STRATEGIST" | "MOSA";
export type UnitTechnique = "PROTOTYPE_AREA" | "TEPPOU_SHOOTING" | "TEPPOU_SNIPING" | "TEPPOU_BOMBARDMENT" | "CAVALRY_CHARGE" | "ARCHER_ARROW" | "ARCHER_LONG_SHOT" | "ARCHER_FIRE_ARROW" | "ARCHER_HOROKU" | "ASHIGARU_SPEAR_STRIKE" | "ASHIGARU_SPEAR_TECHNIQUE" | "NINJA_NINJUTSU" | "NINJA_SHADOW_RUN" | "NINJA_GENJUTSU" | "NINJA_BARRIER" | "GENERAL_COMMAND" | "GENERAL_HEROIC" | "GENERAL_HEAL" | "STRATEGIST_FIRE_PLAY" | "STRATEGIST_FIRE_ATTACK" | "STRATEGIST_FIRE_PLAN" | "STRATEGIST_HELLFIRE" | "STRATEGIST_FLAME_ART" | "STRATEGIST_FALSE_REPORT" | "STRATEGIST_SORCERY" | "STRATEGIST_HEAL" | "MOSA_SENPUU" | "MOSA_MUSOU" | "MOSA_KIJIN";
export type DamageComponentKind = "DIRECT_SPECIAL" | "DIRECT_ARROW" | "FIRE" | "EXPLOSION";

export interface TemporaryOrder {
  type: TemporaryOrderType;
  issuedAt: number;
  expiresAt: number;
  sourceX: number;
  sourceY: number;
}

export type StrategyObjectiveKind = "ENEMY_SIDE" | "ANCHOR" | "INTERCEPT_POINT" | "SEEK_COMBAT" | "RANDOM_ROAM";
export type AvoidanceSide = "LEFT" | "RIGHT";
export type CombatActionState = "IDLE" | "ATTACK_WINDUP" | "ATTACK_RECOVERY";
export type AttackTargetKind = "SOLDIER";
export type ReactionState = "NONE" | "HIT_STUN";
export type ConfusionClearReason =
  | "PLAYER_COMMAND"
  | "JINTO_ORDER"
  | "BARRIER_COMMAND"
  | "BARRIER_CHARGE_ORDER"
  | "GENERAL_COMMAND"
  | "EMERGENCY_RETREAT"
  | "BATTLE_OUT";
export type DamageKind = "NORMAL_ATTACK" | "SPECIAL_ATTACK" | "TRAP";
export type AttackKind = DamageKind | "ARROW_ATTACK" | "GUN_ATTACK";
export type CommonSpecialAbilityId =
  | "RUSH" | "SIEGE" | "MIGHT" | "DOUBLE_SPECIAL" | "IRON_WALL" | "FORESIGHT"
  | "FINISHER" | "RALLY_SPIRIT" | "INSPIRE" | "RECOVERY_BOOST" | "TREATMENT"
  | "FIELD_HOSPITAL" | "TRAP" | "FORTIFY" | "HORO" | "FLEET_FOOT";
export type RareSpecialAbilityId = "MOUTAI" | "JINTO" | "KATON" | "NINJA_HUNTER";
export type LegacyRareSpecialAbilityId = "VANGUARD" | "FIRE_ESCAPE";
export type RecoveryTargetKind = "BASE_GATE" | "HEALER";
export type CombatFeedbackMarker = "H" | "S";

export interface SoldierBaseStats {
  maxHp: number;
  skill: number;
  foot: number;
  combat: number;
  defense: number;
}
export interface SoldierLoadout {
  unitType: UnitType;
  technique: UnitTechnique;
  stats: SoldierBaseStats;
  specialAbilities: CommonSpecialAbilityId[];
  rareSpecialAbilities?: RareSpecialAbilityId[];
}
export interface TeamArmySetup {
  defaultStrategy: Strategy;
  techniqueCounts: Record<UnitTechnique, number>;
}
export type ArmySetup = Record<Team, TeamArmySetup>;

export interface BattleObstacle {
  id: string;
  type: "FENCE";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BattleBase {
  id: string;
  team: Team;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  width: number;
  height: number;
  isDestroyed: boolean;
}

export interface Soldier {
  id: string;
  unitType: UnitType;
  technique: UnitTechnique;
  team: Team;
  controller: ControllerType;
  strategy: Strategy;
  state: SoldierState;
  temporaryOrder: TemporaryOrder | null;
  recoveryGate: BaseGate | null;
  recoveryGateEntered: boolean;

  strategyObjectiveKind: StrategyObjectiveKind;
  strategyObjectiveX: number;
  strategyObjectiveY: number;

  engagementStartedAt: number | null;
  engagementOriginX: number | null;
  engagementOriginY: number | null;
  velocityX: number;
  velocityY: number;
  baseContactLockTicks: number;

  avoidanceSide: AvoidanceSide | null;
  avoidanceUntil: number;
  avoidanceObstacleId: string | null;

  combatActionState: CombatActionState;
  attackStartedAt: number | null;
  attackHitAt: number | null;
  attackRecoveryEndsAt: number | null;
  attackTargetKind: AttackTargetKind | null;
  attackTargetId: string | null;
  attackHitApplied: boolean;

  reactionState: ReactionState;
  reactionStartedAt: number | null;
  reactionEndsAt: number | null;
  knockbackDirectionX: number;
  knockbackDirectionY: number;
  knockbackRemainingDistance: number;
  combatFeedbackMarker: CombatFeedbackMarker | null;
  combatFeedbackUntil: number;
  specialReadyAt: number;
  pendingSecondSpecialAt: number | null;
  combatGauge: number;
  combatGaugeUpdatedAt: number | null;
  specialLockUntil: number;
  abilityActionLockUntil: number;
  trapStateUntil: number;
  activeSpecialTechnique: UnitTechnique | null;
  specialWavesRemaining: number;
  nextSpecialWaveAt: number | null;
  specialAbilities: CommonSpecialAbilityId[];
  rareSpecialAbilities: RareSpecialAbilityId[];
  pendingMoutaiSpecials: number;
  moutaiTriggeredForRetreat: boolean;
  treatmentUsedSinceLastBaseVisit: boolean;
  recoveryTargetKind: RecoveryTargetKind;
  recoveryHealerId: string | null;
  touchingEnemyFenceIds: string[];
  facingX: number;
  facingY: number;
  aimX: number | null;
  aimY: number | null;
  isConfused: boolean;
  strategistFireZoneUntil: number;
  ninjaDashUntil: number;
  ninjaDashStartedAt: number | null;
  ninjaDashStartX: number;
  ninjaDashStartY: number;
  ninjaDashTargetX: number;
  ninjaDashTargetY: number;

  preferredApproachAngle: number | null;
  preferredApproachTargetId: string | null;
  x: number;
  y: number;
  stats: SoldierBaseStats;
  hp: number;
  maxHp: number;
  attackRange: number;
  attackCooldownMs: number;
  lastAttackAt: number;
  targetId: string | null;

  anchorX: number;
  anchorY: number;
  moveTargetX: number | null;
  moveTargetY: number | null;
  /** Legacy runtime name: true means withdrawn from this battle, not permanently dead. */
  isDead: boolean;
}

export type BattleResult = "VICTORY" | "DEFEAT" | null;
