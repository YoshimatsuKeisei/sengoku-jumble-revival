# Raw contact scheduler probe — phase 2B-1

This probe is stacked on top of phase 2A. The already-verified 24 Hz occupancy selection and raw 24-unit candidate spacing remain active.

## Direct SWF facts represented here

- Generic dynamic-occupant contact assigns a short `k=3` response.
- During the common nonzero-`k` branch, movement uses stored `fx/fy` and multiplies those components by `0.7` on successive logic ticks.
- The global eight-direction table is `fx=[-1,-0.6,0,0.6,1,0.6,0,-0.6]` and `fy=[0,-0.6,-1,-0.6,0,0.6,1,0.6]` for raw `fi=1..8`.
- The impulse magnitude is based on the unit's ordinary raw movement speed `s`; in the reconstruction, one 24 Hz foot-speed step corresponds to the current effective foot value in source units.
- The `k` branch replaces ordinary movement for those logic ticks. It must not be added to the existing render-frame movement as an unrestricted second motion path.

## Compatibility staging used in this probe

BattleScene still performs the legacy movement pass before normal-contact arbitration. Therefore, when a phase-2A selected pair makes contact, this probe:

1. keeps the phase-2A 24-unit correction;
2. starts a `k=3` contact runtime on both selected soldiers;
3. holds the existing ordinary movement path through the following three raw logic ticks using the existing action-lock gate;
4. on those three 24 Hz ticks, moves the pair away from each other using `s`, `0.7s`, then `0.49s` along the raw eight-direction table;
5. prevents either soldier from being selected for another contact while that short runtime is active;
6. removes the contact runtime on the following logic tick so ordinary movement can resume.

A candidate impulse step is suppressed if it would enter a raw static collision cell. This is a reconstruction safety guard while the full sequential `f` movement loop is still not the runtime source of truth.

## Deliberately deferred

This is **not** the full generic occupant response yet. The following remain deferred to phase 2B-2:

- `t += 10` and its cap behavior;
- `vc2()` random turn magnitude/sign;
- persistence of that diverted movement during the `t` window;
- replacement of legacy global `separateSoldiers()`;
- full sequential dynamic-`f` movement ownership.

The purpose of phase 2B-1 is to determine whether the raw short `k=3` contact release can remove sticky/unnatural contact without reintroducing the previously observed circular group-flow regression.
