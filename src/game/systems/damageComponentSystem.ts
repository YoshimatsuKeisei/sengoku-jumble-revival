import type { DamageComponentKind, Soldier } from "../types";

export type DamageComponents = Readonly<Partial<Record<DamageComponentKind, number>>>;

export function hasRareAbility(soldier: Pick<Soldier, "rareSpecialAbilities">, id: Soldier["rareSpecialAbilities"][number]): boolean {
  return soldier.rareSpecialAbilities.includes(id);
}

export function applyRareDamageImmunity(victim: Pick<Soldier, "rareSpecialAbilities">,
  components: DamageComponents): Partial<Record<DamageComponentKind, number>> {
  const result = { ...components };
  if (hasRareAbility(victim, "KATON")) { result.FIRE = 0; result.EXPLOSION = 0; }
  return result;
}

export function totalDamageComponents(components: DamageComponents): number {
  return Object.values(components).reduce((sum, value) => sum + (value ?? 0), 0);
}
