# General command callback — direct raw SWF evidence

Source: original `sgjbgm.swf`, SHA-256 `47d397d98ed797e2e5e1f7f96c10ba9c3f93d3a3b54b45fbc61401a553c3399c` (3,814,810 bytes, CWS, SWF v7, 24 fps). The file was decompressed directly and the AVM1 action streams and Sprite timelines below were parsed from the uncompressed bytes.

## `spl()` command branch

Battle Sprite 2456 defines `spl` at uncompressed offset `2243611`; its body is `2243628..2249241`. The dispatcher reads `i.ac`. For `ac == 14`, the branch target is `2245327`.

That branch:

- sets command source `k = 16`;
- clears its `fx/fy`;
- at `2245374..2245393` pushes mode `4`, the source soldier, argument count `2`, and function `sz`, therefore calling `sz(i, 4)`;
- sets source `sp = 10`;
- selects the source pose `fi + 32` and the `gri` action effect.

## `sz(i, 4)` recipient gate

`sz` is defined at `2235788`; body `2235807..2237696`. Parameter register mapping is `i -> r4`, `u -> r11`. Mode dispatch compares `u == 4` at `2236221..2236232` and enters the mode-4 block at `2236862`.

Before the mode dispatch, each candidate is required to be same-team (`candidate.e == source.e`), active (`candidate.p < 89`), and not the source itself. Mode 4 adds:

- `candidate.ch != 3` at `2236862..2236880` (general class excluded), and
- `candidate.sp == 0` at `2236888..2236910`.

For a normal AI recipient, `2236931..2236953` calls `candidate.fr.gotoAndStop("kb")`. The player-controlled `m200` branch is special: it does not install `kb`; instead it raises `m200.kd` to at least `99` (`2236959..2237002`).

Mode 4 does not clear or replace recipient `l`. Therefore a ranged callback later reaches `spl(recipient)` with the recipient's existing target latch.

## `kb` selector and delayed callback

Sprite 800 frame 3 is labelled `kb`. Its PlaceObject2 tag at uncompressed offset `1089173` has depth `1` and character ID `671`; therefore selecting `kb` places exactly one Sprite 671 child at that depth. Sprite 800's frame action stops the selector on the chosen frame, while the child timeline continues independently.

Sprite 671 has 13 frames. Frame 13 contains the DoAction tag at `671801` (action bytes `671807..671902`). Its constant pool is `_parent`, `spl`, `gotoAndStop`. The stack sequence resolves to:

- `root.spl(recipient)` where recipient is Sprite671's grandparent soldier clip;
- then `fr.gotoAndStop(1)`;
- then `stop`.

The child is initially placed on its frame 1. Reaching frame 13 therefore requires **12 subsequent 24-fps timeline advances**. The forced `spl` is not synchronous with the command tick; the reconstruction delay is 12 logic ticks (500 ms at 24 fps).

## Same-instant overlap

Two generals issuing mode 4 to the same recipient address the same `fr` Sprite 800 and the same depth-1 Sprite671 child. A second `gotoAndStop("kb")` cannot create a second concurrent child at the same depth. Thus one recipient can have at most one callback timeline for the same instant. A later command can reset/restart that selector and is not globally prohibited.
