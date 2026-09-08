# Direct AVM1 evidence: base collision and recovery entry

This evidence was recovered directly from the original `sgjbgm.swf` that was re-added to the project and verified at SHA-256 `47d397d98ed797e2e5e1f7f96c10ba9c3f93d3a3b54b45fbc61401a553c3399c` (3,814,810 bytes, CWS, SWF v7, 24 fps).

The regenerated AVM1 scan contains 389 `DoAction` blocks, matching the earlier recovery record. The main battle logic is action block 147, sprite 2456. This block contains the original battle messages including `が敵陣を攻略！`, `が敵陣を攻撃！`, `一時退避！`, `が戦線離脱！`, and `の療所効果！`.

## Collision grid initialization

Function `shk2` creates the full `f` collision grid before writing the special battlefield cells. It first creates 52 columns with 32 entries each and initializes the ordinary cells to `0`. It then writes `1000` to the outer battlefield boundary and writes the special base/fence codes.

This is important for reconstruction: a zero-code point inside the rectangular bitmap crop is not itself a collision body. The headquarters is instead protected by the explicitly coded barrier cells below. The earlier integration error was **not** that the full bitmap rectangle needed to become solid; it was that runtime handling was implemented for 998/999 while the equally blocking 996/997 cells were left to the enemy-base damage path only. Friendly/ineligible soldiers could therefore cross their own central 996/997 wall.

## Base collision cells

The battle logic assigns `h = 36` and resolves movement collision by looking up the next position in a grid equivalent to `f[Math.round(nextX / h)][Math.round(nextY / h)]`. Function `shk2` initializes the special base/recovery collision cells.

Confirmed base-damage cells:

- enemy base: tile `996` at x-index 45, y-indices 15, 16, 17, 18;
- player base: tile `997` at x-index 6, y-indices 15, 16, 17, 18.

Confirmed recovery/base-entry cells:

- enemy-side recovery tile `998`: `(45,12..14)`, `(45,19..21)`, plus horizontal rows y=12 and y=21 for x=46..49;
- player-side recovery tile `999`: `(6,12..14)`, `(6,19..21)`, plus horizontal rows y=12 and y=21 for x=2..5.

Together, 996+998 and 997+999 form the original U-shaped headquarters collision barriers. The central y-cell band 15..18 is the damage portion; the upper/lower front cells are recovery/wall collision cells.

The reconstruction's `damageCoreHeightRatio: 0.3` is not the original constant. The original behavior is grid-coded and should be represented by the confirmed 36-unit collision geometry instead of promoting the temporary ratio as an SWF fact.

## 996 / 997 collision ordering and team gate

In the main battle function `d`, the collision switch is entered for every special collision value above 900.

For `996`, the code unconditionally assigns:

- `fx = -10 - ekj * 2`
- `k = 10`

**before** checking the soldier-side flag. Only when the soldier belongs to the side that can attack the enemy headquarters does execution continue into the enemy-base fortify/damage branch. A same-side or otherwise non-damaging soldier still receives the collision response and cannot simply walk through 996.

Tile `997` mirrors this:

- `fx = 10 + mkj * 2`
- `k = 10`

and only the opposing attacker proceeds to player-base damage. Thus 996/997 are collision wall cells first and damage cells second.

For hostile base attacks, the reconstruction resolves the damage/contact branch in `baseContactSystem` first. The shared post-movement base-access pass must still reproduce the 996/997 collision fallback for friendly or otherwise ineligible units; omitting that fallback is what allowed ordinary troops into the headquarters during the 2026-09-09 regression.

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

Accordingly, the faithful runtime should model the complete 996/997/998/999 barrier and the confirmed recovery-state transitions. A full rectangular bitmap collider is not the original mechanism, but neither are 996/997 optional merely because their additional damage effect is team-gated.
