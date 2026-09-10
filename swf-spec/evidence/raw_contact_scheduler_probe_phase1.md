# Raw contact scheduler probe — phases 1 and 2A

This branch isolates contact scheduling and contact spacing from the movement regressions seen in the failed normal-contact replay.

## Direct SWF facts retained

- Battle SWF runs at 24 fps.
- Each unit calls raw `d(this)` from its EnterFrame handler.
- Dynamic occupancy uses `f[Math.round(x / 36)][Math.round(y / 36)]`.
- A dynamic soldier value identifies one occupant; raw movement/contact does not sweep every unordered soldier pair.
- In generic soldier contact, when both absolute axis deltas are strictly below 32 source units, raw proposes a point exactly 24 source units from the encountered soldier.
- The current soldier's dynamic f-cell is cleared before testing that candidate.
- The candidate is accepted only when the resulting f-cell is zero; static 901..906 / 996..1000 cells and another dynamic occupant therefore block it.
- `fx/fy`, `k`, `t` and `vc2()` are separate follow-up response state and are not part of phase 2A.

## Phase 1

- Normal-contact arbitration is throttled to a 24 Hz logic cadence.
- Contact lookup is spatially bounded to the current 36-unit cell and its eight neighboring cells.
- Each grid cell contributes at most one dynamic occupant.
- Each soldier participates in at most one selected contact in a logic tick.
- Existing attack windup/damage behavior is retained.

## Phase 2A

Only the roster soldier currently being processed may receive the raw close-contact spacing correction:

1. require strict `abs(dx) < 32` and `abs(dy) < 32` in raw source coordinates;
2. calculate the pair angle;
3. propose `round(other - unitVector * 24)`;
4. temporarily clear the current soldier's occupancy cell when it owns that cell;
5. reject the candidate if its dynamic cell is occupied or the raw static collision grid is non-zero;
6. otherwise apply that one x/y correction and re-register the soldier.

This is intentionally sequential and bounded to the pair selected by the 24 Hz scheduler. It does not restore the previous per-render-frame all-pairs spacing path.

## Still deliberately unchanged

- `movementSystem.ts`
- global `separateSoldiers()`
- raw `fx/fy` combat impulse
- `k=3`
- `t += 10`
- `vc2()`
- base/recovery collision logic
- existing attack windup/damage timing

The next isolated phase, if this remains visually stable, is the generic contact response (`k/t/vc2/fx/fy`) applied only to the scheduler-selected pair.
