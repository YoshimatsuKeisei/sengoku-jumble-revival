# Pre-move enemy contact gate probe

This probe starts from the Phase-1 safe state (`b203f7e8`, tree-equivalent to `5bdd6191`) after the failed Phase 2A / 2B positional experiments were removed.

## Why this probe exists

The current revival still separates movement and contact:

1. AI movement is applied for the rendered frame.
2. `separateSoldiers()` repairs deep overlaps afterwards.
3. The 24 Hz contact scheduler later chooses a nearby opponent and starts the existing attack path.

The recovered SWF's `d()` structure is ordered differently: a unit computes its next movement candidate, checks the dynamic `f` occupancy before committing that movement, and branches into occupant/contact handling instead of blindly consuming the movement first.

## What this probe changes

- A 36-source-unit spatial snapshot is created at the start of the AI movement pass.
- AI soldiers are removed/re-registered sequentially as their movement is processed, preserving the important `clear current -> inspect candidate -> register result` ordering.
- Before each small voluntary AI movement sub-step is committed, nearby dynamic enemy occupancy is checked.
- If the AI is already inside the normal `<32` contact window, a step that would move it even closer is rejected while a step that moves away remains allowed.
- If a sub-step is the first one that crosses into the `<32` contact window, that one small step is committed and the remaining movement distance for the rendered frame is discarded. This lets the existing Phase-1 24 Hz combat scheduler observe the contact without allowing a large per-frame overshoot.

## Deliberate limits

This is a compatibility probe, not a claim of full raw `d()` conformance.

- AI destination choice, strategy logic and movement speed are unchanged.
- Player manual movement is unchanged.
- Same-team traffic still uses the verified reconstruction movement / `separateSoldiers()` path. Raw generic-occupant `t/vc2/k=3` behavior is not approximated here.
- Existing attack windup/damage timing is unchanged.
- No 24-unit teleport/correction is added.
- No raw `fx/fy` impulse or `k` response is added.
- Forced movement and hit reactions are unchanged.
- AI movement cadence is still the current render-driven movement cadence; only the pre-commit contact gate is being isolated here.

The purpose is narrowly to test the hypothesis visible in gameplay: contact feels wrong because a unit consumes too much movement before the later contact system notices the opponent. If this probe improves contact without reintroducing circular movement, the next stage can move the actual contact event/attack resolution into the same raw-style logic tick rather than adding post-hoc positional corrections.
