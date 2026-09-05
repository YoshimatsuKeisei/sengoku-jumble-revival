import { describe, expect, it } from "vitest";
import { resolveActionEffects } from "./effectManifest";
import {
  actionHasIndependentEffects,
  isUnresolvedConditionalReference,
  isUnresolvedSideTargetReference,
  selectActionEffectReferences,
} from "./actionEffectPolicy";

describe("action effect policy", () => {
  it("returns multiple same-role sequences separately", () => {
    const action = resolveActionEffects("strategist", 18)!;
    expect(selectActionEffectReferences(action, "hit").map((reference) => reference.effect_id))
      .toEqual(["fr_kex", "as_kr2"]);
  });

  it("selects only the manifest-described player or enemy caster variant", () => {
    const action = resolveActionEffects("ninja", 27)!;
    expect(selectActionEffectReferences(action, "caster", "player").map((reference) => reference.effect_id))
      .toEqual(["as_kob", "as_ttgk"]);
    expect(selectActionEffectReferences(action, "caster", "enemy").map((reference) => reference.effect_id))
      .toEqual(["as_kob", "as_ettgk"]);
  });

  it("does not schedule unresolved conditional effects", () => {
    const action = resolveActionEffects("ninja", 27)!;
    const conditional = action.effects.hit.find(isUnresolvedConditionalReference)!;
    expect(conditional.effect_id).toBe("fr_kb");
    expect(selectActionEffectReferences(action, "hit", "player")).not.toContain(conditional);
  });

  it("identifies side target visuals whose recipient condition remains unresolved", () => {
    const action = resolveActionEffects("ninja", 27)!;
    expect(action.effects.hit.filter(isUnresolvedSideTargetReference).map((reference) => reference.effect_id))
      .toEqual(["as_sztt", "as_esztt"]);
  });

  it("distinguishes intentional empty actions from atlas failures", () => {
    expect(actionHasIndependentEffects(resolveActionEffects("ashigaru", 1)!)).toBe(false);
    expect(actionHasIndependentEffects(resolveActionEffects("mosa", 23)!)).toBe(true);
  });
});
