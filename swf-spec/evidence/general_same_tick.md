# General command mode 4 — direct raw AVM1 evidence

Source: original `sgjbgm.swf`, SHA-256 `47d397d98ed797e2e5e1f7f96c10ba9c3f93d3a3b54b45fbc61401a553c3399c` (3,814,810 bytes, CWS / SWF v7 / 24 fps). Offsets below are from the directly decompressed FWS image.

## Function definitions

The relevant root AVM1 functions were re-parsed directly:

- `sz(i,u)` DefineFunction2 at `2235788`, body `2235807..2237696`; `i = register 4`, `u = register 11`.
- `spl(i)` DefineFunction2 at `2243611`, body `2243628..2249241`; `i = register 2`.

General command attack code `ac == 14` dispatches to `2245327`. That branch sets the source action state and calls `sz(i,4)` at `2245374..2245392`.

## What mode 4 actually does

`sz()` scans the 11x11 local collision grid around the source. Before mode dispatch, a candidate must be same-team, have `p < 89`, and not be the source (`2236068..2236161`). Mode 4 begins at `2236862` and further requires:

- `ch != 3` (`2236862..2236887`), excluding generals;
- `sp == 0` (`2236888..2236910`).

The previous evidence note was wrong in treating every accepted candidate as a forced `spl()` recipient. Raw mode 4 has an explicit `m200` split:

### Candidate is `m200`

At `2236915..2236926` the candidate is compared with global `m200`. Only when they are the same does the code execute:

- `2236931..2236953`: `candidate.fr.gotoAndStop("kb")`.

Sprite 800 frame label `kb` places child Sprite 671. Sprite 671 is exactly 13 frames long. Its frame-13 DoAction is at `671801` (action body `671807..671903`) and calls the parent/root `spl()` for the affected `m200`, then returns the parent timeline to frame 1. Because the child begins on frame 1, the callback occurs after 12 frame advances.

### Candidate is not `m200`

The alternate branch does **not** call the candidate's `spl()`:

- `2236959..2236981`: test `m200.kd < 99`;
- `2236986..2237002`: if so, assign `m200.kd = 99`.

Thus nearby AI allies do not receive immediate technique activations from mode 4. Their presence raises the player-controlled `m200` technique gauge to at least 99.

## `m200.kd` is the player technique gauge

The `m200` EnterFrame action independently confirms the meaning of `kd`:

- `2258980..2259025`: while `kd < 100`, add `kp / 30` each frame;
- `2259026..2259077`: once `kd > 99`, clamp to `100` and show the full-gauge frame `kbm`;
- `2260229..2260274`: manual technique activation requires `kd == 100` (plus the input-region check);
- `2260642..2260665`: activation calls `_parent.spl(this)`;
- `2261530..2261696`: after manual activation, the normal s21 retention/reset logic handles `kd`.

So the mode-4 assignment to 99 is a near-full player-gauge effect, not an AI forced-attack mechanism.

## Same-instant overlap

If multiple command sources address `m200` while its `kb` selector is already the same timeline/depth, they do not create independent parallel Sprite-671 children. The reconstruction therefore keeps at most one pending `kb` callback for `m200` at a time. This is a callback dedupe for the player object only; it must not be generalized into “one forced technique per nearby AI soldier”.
