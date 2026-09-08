# Strategy actions — direct raw SWF evidence

Primary source: `sgjbgm.swf`, 3,814,810 bytes, CWS / SWF v7 / 24 fps, SHA-256 `47d397d98ed797e2e5e1f7f96c10ba9c3f93d3a3b54b45fbc61401a553c3399c`. This note was produced by directly expanding the user-supplied SWF and disassembling AVM1 in battle Sprite 2456. The relevant functions are `shk`, `ido`, `d`, `scd`, `vc`, and `atck`.

## Five normal strategies; 特務 is not a selectable battle strategy in this build

`shk()` copies the parsed battle strategy to `pp`, and the normal battle dispatcher contains five mirrored state pairs:

- 突撃: player p1 / enemy p2
- 守備: player p3 / enemy p4
- 迎撃: player p8 / enemy p9
- 乱戦: player p10 / enemy p11
- 待機: player p14 / enemy p15

The player-side parsed values are the odd/base values above; enemy setup mirrors them to the paired state. No sixth normal-state pair exists for 特務 in this battle state machine. The reconstruction therefore must not invent a selectable `specialDuty` strategy for this SWF version.

## 突撃 — p1 / p2

`ido()` sets player p1 to `(tx,ty)=(1600,currentY)` and enemy p2 to `(0,currentY)`. `scd()` does not proactively select an `l` target for p1/p2. Near the opposite base it reshapes the route:

- player: `_x > 1207` -> `(1607,574)`; `_x > 1442` additionally changes `tx` to `1662`;
- enemy: `_x < 634` -> `(234,574)`; `_x < 390` additionally changes `tx` to `200`.

`atck()` can still make a unit retaliate / enter its `pp+20` pursuit state when it is hit, subject to the original special-ability conditions. Thus “no proactive target selection” does not mean “never fights.”

## 守備 / 迎撃 frontmost scan

`scd()` builds a frontmost candidate before iterating strategy states. For enemy-side units observed by player defenders, candidate effective coordinates are based on:

- `effectiveX = _x + x*8 - (l == -1 ? 200 : 0)`;
- `effectiveY = _y + y*50`.

For player-side units observed by enemy defenders, the unengaged bias is mirrored positively (`+200`). Candidates must be in the active p<90 battle states and their projected Y must satisfy `324 < effectiveY < 841`. The player-side scan also excludes units already beyond source X 1615. The player defender picks the minimum effective X; the enemy defender picks the maximum.

### 守備 — p3 / p4

Idle p3/p4 returns to original `(dx,dy)`. Player guard acquisition occurs when the selected effective front reaches X<=434; enemy guard acquisition mirrors at X>=1445. Acquisition sets `l` to the selected frontmost unit and changes `p` to `pp+20` (p23/p24).

While p23/p24 is active, each `scd()` pass refreshes `l` to the current frontmost candidate instead of pinning the first target forever. Pursuit prediction uses the target's original movement vector:

- if the target has passed the defender on the X axis, **or** absolute Y separation is >250 source units: target position + movement vector *30;
- otherwise: target position + movement vector *1.

If there is no current pursuit and no candidate inside the guard threshold, the unit returns to `(dx,dy)` / base p3 or p4.

### 迎撃 — p8 / p9

Idle p8/p9 also returns to `(dx,dy)`. Player interception starts at effective X<=834; enemy interception starts at X>=1045. It enters p28/p29. While engaged, each `scd()` pass refreshes `l` to the current frontmost candidate and uses that target's current `_x/_y` directly; the p23/p24 30-step prediction branch is not used.

This makes 迎撃's activation line materially farther forward than 守備's.

## 乱戦 — p10 / p11

Player p10 chooses one random enemy slot from indices 30..59. Enemy p11 chooses one random opponent slot from 1..29. If the selected slot has p<90, `l` and target coordinates are assigned and p becomes `pp+20` (or `pp+30` for s34's separate target path). If the sampled slot is unavailable, a random roam point is produced exactly as:

- `tx = floor(random*1211) + 334`
- `ty = floor(random*409) + 359`

and p becomes 12/13. When Manhattan distance to that roam point becomes `<150`, p returns to 10/11 and samples again. When a previous combat target is lost, the state machine returns to base p10/p11; it does not force an unconditional roam before the next random slot selection.

## 待機 — p14 / p15

`ido()` sends p14/p15 to original `(dx,dy)`. On arrival, `d()` changes them to stationary -14/-15. `scd()` continually restores the anchor target for p14/p15 / -14/-15 rather than giving them a proactive pursuit target.

For ranged character classes handled by the original `ch` 2/6 branch, `scd()` performs a local collision-grid scan derived from `tk`. It calls `atck()` on the first eligible opposing p<95 occupant and does **not** assign that scanned unit to persistent `l`; this is a stationary in-range attack scan, not a proactive chase. Separately, `atck()` retaliation can assign `l` when the waiting soldier is hit, after which the ordinary pursuit state can run. The default pursuit code also holds ranged units when their `l` target is inside the original `tk` distance margin.

## Shared strategy timing

All of the front-line acquisition and wait scanning above lives in the same `scd()` used by the combat-gauge logic. The battle clip initializes `tc=19`, increments it each EnterFrame, and calls `scd()` when `tc>22`, then resets `tc=0`. Therefore the first strategy `scd` pass occurs after 4 logic frames and subsequent passes are 23 logic frames apart.

The strategy rules must be tested against these AVM1 constants rather than against names or visual intuition.
