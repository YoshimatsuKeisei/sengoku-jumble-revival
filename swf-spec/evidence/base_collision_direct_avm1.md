# Direct AVM1 evidence: base collision and recovery entry

This evidence was recovered directly from the original `sgjbgm.swf` that was re-added to the project and verified at SHA-256 `47d397d98ed797e2e5e1f7f96c10ba9c3f93d3a3b54b45fbc61401a553c3399c` (3,814,810 bytes, CWS, SWF v7, 24 fps).

The regenerated AVM1 scan contains 389 `DoAction` blocks, matching the earlier recovery record. The main battle logic is action block 147, sprite 2456. This block contains the original battle messages including `が敵陣を攻略！`, `が敵陣を攻撃！`, `一時退避！`, `が戦線離脱！`, and `の療所効果！`.

## Collision grid

The battle logic assigns `h = 36` and resolves movement collision by looking up the next position in a grid equivalent to `f[Math.round(nextX / h)][Math.round(nextY / h)]`. Function `shk2` initializes the special base/recovery collision cells.

Confirmed base-damage cells:

- enemy base: tile `996` at x-index 45, y-indices 15, 16, 17, 18;
- player base: tile `997` at x-index 6, y-indices 15, 16, 17, 18.

Confirmed recovery/base-entry cells:

- enemy-side recovery tile `998`: `(45,12..14)`, `(45,19..21)`, plus horizontal rows y=12 and y=21 for x=46..49;
- player-side recovery tile `999`: `(6,12..14)`, `(6,19..21)`, plus horizontal rows y=12 and y=21 for x=2..5.

Therefore the original final base-damage contact surface is the central y-cell band 15..18. The upper/lower front cells are recovery/wall collision cells, not additional base-damage cells. Earlier community strategy evidence about approaching from above/below describes the route taken to the base; it does not establish that the final upper/lower front contact itself deals base damage.

The reconstruction's `damageCoreHeightRatio: 0.3` is not the original constant. The original behavior is grid-coded and should be represented by the confirmed 36-unit collision geometry instead of promoting the temporary ratio as an SWF fact.

## Base contact ordering

In the main battle function `d`, collision code `996` first arms the contact response with `fx = -10 - ekj * 2` and `k = 10`, then executes the enemy-base damage/fortify path. Collision code `997` mirrors this with `fx = 10 + mkj * 2` and `k = 10`, then executes the player-base damage path.

So the original base-contact branch establishes the bounce/contact state before damage resolution. The reconstruction's separate full-base-rectangle snapback pass is not the original base-contact mechanism.

## Emergency retreat and base entry

The original SWF has explicit states between retreat travel and healing:

- `89`: retreat initiation/transitional state;
- `91`: player retreat travel;
- `92`: enemy retreat travel;
- `93`: player entry-committed, pre-healing state;
- `94`: enemy entry-committed, pre-healing state;
- `97`: player healing;
- `98`: enemy healing.

Function `ido` sends retreating units toward an upper or lower exterior waypoint. Player travel uses x=140; enemy travel uses x=1735. The y waypoint is 249 above the split and 946 below it, with the branch at y=576.

In the main update, player state 91 commits to entry once x < 232: the target becomes `(70,580)`, movement velocity is recomputed, and the state changes to 93. Enemy state 92 mirrors this once x > 1612: the target becomes `(1825,580)` and the state changes to 94.

Collision tile `999` admits player retreat states 89/91/93 into healing state 97. Collision tile `998` admits enemy retreat states 89/92/94 into healing state 98. Other units hitting those tiles receive the ordinary collision response instead.

This directly contradicts the reconstruction behavior that continuously rechecks an alpha-derived visual gate X span and can eject an `EMERGENCY_RETREAT` soldier after crowd separation moves its center sideways. The original admission semantics are collision-tile/state based and include a dedicated entry-committed state before healing. No evidence was found that the original uses `BATTLEFIELD_BASE_GATE_SOURCE_RECTS` or any equivalent alpha-bound rectangle as a behavioral admission test.

Accordingly, the current congestion reproduction is a reconstruction bug path, not original-game behavior. An original-faithful repair should model the confirmed collision-grid/state transition rather than merely widening the visual gate rectangles.
