# Critical-retreat and player-command marker direct SWF audit

Status: **confirmed from the recovered raw `sgjbgm.swf`**.

This audit covers the soldier-following critical `!` marker and the A/S/D player-command marks on both the issuing player and command recipients. Coordinates are Sprite664/Soldier `as` source units unless otherwise stated.

## 1. Critical / low-HP `!` (`chp`)

The soldier visual movie clip Sprite664 places the child marker at frame 34, label `chp`.

- child sprite: **625**
- source bitmap: **622**
- bitmap source size: **19 x 16**
- child placement relative to soldier `as`: **(-9, -27)**
- child timeline: **9 frames**
- frame 9 contains the stop action, so the final frame remains while the parent stays on `chp`

After applying Sprite625's internal bitmap placement, the first visible frame occupies approximately `x=-8..9`, `y=-42..-28` relative to the soldier. The recovered HP-bar child begins at source `y=-26`, so the critical mark belongs fully above the HP bar / head region rather than over the face.

The existing revival extraction uses a fixed 64x72 transparent frame canvas. Relative to that canvas center, the renderer must apply **(0, -20)** source units. The effect root must continue to be read from the soldier every render update; `BattleScene` already supplies `getRoot: () => soldierPoint(id)`.

## 2. Command issuer marks (`shugo`, `ttgk`, `shubi`)

When the player issues D/S/A, Sprite664 switches the issuing player's `as` child to a dedicated large 14-frame command marker:

| command | Sprite664 frame | label | child sprite | bitmap | bitmap source size |
| --- | ---: | --- | ---: | ---: | ---: |
| D / gather | 29 | `shugo` | 605 | 602 | 49x54 |
| S / charge | 30 | `ttgk` | 609 | 606 | 49x54 |
| A / retreat | 31 | `shubi` | 613 | 610 | 48x54 |

All three use the same parent placement **(-19, -21)**. The currently extracted 128x128 PNG canvases already contain each marker's 14-frame internal scale/translation animation, but the canvas center must be shifted by **(-19, -37)** source units relative to the issuing soldier.

These large issuer marks are one-shot command animations; the recipient marks below are not the same sprite scaled down.

## 3. Command recipient marks are separate, smaller sprites

The raw `sz()` command callback explicitly sends affected soldiers to three different Sprite664 frames:

- gather: `as.gotoAndStop("szch")`
- charge: `as.gotoAndStop("sztt")`
- retreat: `as.gotoAndStop("szsh")`

The disassembly includes the corresponding calls around `2236346`, `2236516/2236615`, and `2236709`.

Raw assets:

| command | Sprite664 frame | label | child sprite | bitmap | bitmap source size |
| --- | ---: | --- | ---: | ---: | ---: |
| D / gather recipient | 22 | `szch` | 540 | 537 | 18x19 |
| S / charge recipient | 23 | `sztt` | 544 | 541 | 18x19 |
| A / retreat recipient | 24 | `szsh` | 548 | 545 | 18x19 |

All three recipient clips are placed at **(+17, -14)** and have **9 frames**, with frame 9 stopped/held. They are therefore objectively much smaller than the 48-49x54 issuer marks. This confirms the remembered size difference.

The three raw bitmaps are the green, red, and blue small arrow marks respectively. Their nine-frame animation changes the bitmap center relative to the soldier as follows:

`(18,-23.5), (20,-25.5), (22,-27.5), (23,-28.5), (24,-29.5), (24,-29.5), (21,-26.5), (19,-24.5), (18,-23.5)`.

The revival previously reused the large 14-frame issuer PNGs as `target_*` effects. That was a reconstruction bug: wrong sprite, wrong dimensions, wrong frame count, and wrong placement. The corrected implementation uses the raw 18x19 bitmaps and the recovered nine frame-center offsets.

## 4. Runtime following

All three marker classes are soldier-relative, not battlefield-fixed. In the revival the frame renderer receives a live `getRoot` callback for:

- critical retreat mark -> the retreating/healing soldier,
- issuer command mark -> the player issuing A/S/D,
- recipient command mark -> each soldier carrying the temporary order.

The renderer applies the SWF source-unit marker offset on every update after resolving the current live root, so the marker follows movement instead of remaining at the activation coordinate.
