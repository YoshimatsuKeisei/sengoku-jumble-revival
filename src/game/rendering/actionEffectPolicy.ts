import type { Team } from "../types";
import {
  getEffectSequence,
  type ActionDefinition,
  type EffectReference,
} from "./effectManifest";

export type ActionEffectRole = keyof ActionDefinition["effects"];

function mappingBasis(reference: EffectReference): string {
  return getEffectSequence(reference.effect_id)?.unit_mapping_basis ?? "";
}

function isEnemySideVariant(reference: EffectReference): boolean {
  return /enemy-side/i.test(mappingBasis(reference));
}

function isPairedSideVariant(reference: EffectReference): boolean {
  const basis = mappingBasis(reference);
  return /activator visual for ninja attack code 27/i.test(basis)
    || /enemy-side activator equivalent/i.test(basis)
    || /called by ninja attack code 27/i.test(basis)
    || /enemy-side target visual for the same cavalry\/ninja activation paths/i.test(basis);
}

export function isUnresolvedConditionalReference(reference: EffectReference): boolean {
  return reference.conditional;
}

export function isUnresolvedSideTargetReference(reference: EffectReference): boolean {
  return getEffectSequence(reference.effect_id)?.role === "hit" && isPairedSideVariant(reference);
}

export function selectActionEffectReferences(
  action: ActionDefinition,
  role: ActionEffectRole,
  team?: Team,
): EffectReference[] {
  return action.effects[role].filter((reference) => {
    if (reference.conditional) return false;
    if (!team || !isPairedSideVariant(reference)) return true;
    return team === "enemy" ? isEnemySideVariant(reference) : !isEnemySideVariant(reference);
  });
}

export function actionHasIndependentEffects(action: ActionDefinition): boolean {
  return (Object.keys(action.effects) as ActionEffectRole[])
    .some((role) => action.effects[role].length > 0);
}
