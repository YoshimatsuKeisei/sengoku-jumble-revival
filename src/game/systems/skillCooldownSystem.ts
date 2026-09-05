import { PROTOTYPE_SKILL_MAX, SPECIAL_ATTACK_CONFIG } from "../config";
export function calculateSpecialCooldownMs(skill: number): number {
  const normalized = Math.max(0, Math.min(1, skill / PROTOTYPE_SKILL_MAX));
  return SPECIAL_ATTACK_CONFIG.maxCooldownMs
    - normalized * (SPECIAL_ATTACK_CONFIG.maxCooldownMs - SPECIAL_ATTACK_CONFIG.minCooldownMs);
}
