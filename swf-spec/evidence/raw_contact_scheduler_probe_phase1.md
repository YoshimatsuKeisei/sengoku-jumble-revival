# Raw contact scheduler probe — phase 1

This branch isolates contact scheduling from movement changes after the failed normal-contact replay caused the visible circular/group-flow regression.

## Direct SWF facts retained

- Battle SWF runs at 24 fps.
- Each unit calls raw `d(this)` from its EnterFrame handler.
- Dynamic occupancy uses `f[Math.round(x / 36)][Math.round(y / 36)]`.
- A dynamic value in the ordinary soldier range identifies one occupant; raw movement/contact does not sweep every unordered soldier pair.
- Positional contact response (`fx/fy`, `k`, `t`, `vc2`, and close 24-unit correction) belongs to the raw `d()` movement/contact path and must not be bolted onto the revival's per-render-frame all-pairs loop.

## What this probe changes

- Normal-contact arbitration is throttled to a 24 Hz logic cadence.
- Contact lookup is spatially bounded to the current 36-unit cell and its eight neighboring cells.
- Each grid cell contributes at most one dynamic occupant.
- Each soldier participates in at most one selected contact in a logic tick.
- Existing attack windup/damage behavior is intentionally retained for this phase.

## What this probe deliberately does NOT change

- `movementSystem.ts`
- `separateSoldiers()`
- any x/y coordinate from normal-contact arbitration
- raw `fx/fy` impulses
- `k=3`, `t+=10`, or `vc2()` generic occupant response
- the raw close-target 24-unit reposition
- base/recovery collision logic

This is therefore a staged compatibility bridge, not a claim of complete `d()` conformance. The purpose is to verify that replacing all-pairs contact arbitration with a 24 Hz occupancy-based scheduler does not reintroduce the movement regression before raw positional response is added in a later isolated phase.
