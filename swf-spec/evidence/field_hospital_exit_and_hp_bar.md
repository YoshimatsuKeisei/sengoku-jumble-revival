# Field-hospital exit and HP-bar direct SWF audit

Status: **confirmed from the recovered raw `sgjbgm.swf`**.

This note extends the earlier p97/p98 healing audit with the exact exit path and the nested `h` HP-bar movie clip. All coordinates below are raw Sprite2456 battle coordinates unless stated otherwise.

## 1. Healing refreshes the HP bar on every p97/p98 logic update

In `d(i)`, player healing state 97 begins at the branch around raw action offset `2189518`; enemy state 98 mirrors it around `2190062`.

The player branch performs, in order:

1. `hp = hp + mp / 400`
2. if common ability `s20` is present, another `hp = hp + mp / 400`
3. `r23 = floor(hp / mp * 100)`
4. `h.gotoAndStop(101 - r23)`
5. test `hp > mp`

The relevant decoded action range is approximately `2189518..2189713`. The enemy mirror is approximately `2190062..2190257`.

Therefore the on-unit HP display is not allowed to remain at the pre-retreat value while the soldier heals. The revival previously increased `soldier.hp` in `updateHealing()` but left `soldier.hpBarHp` unchanged, which directly explains the stale low bar observed during field-hospital healing.

When `hp > mp`, both branches clamp `hp = mp`, change to p7, and explicitly call `h.gotoAndStop(1)` (`2189891..2189915` for player, `2190435..2190459` for enemy). Exact equality does not exit: an increment that lands on `hp == mp` stays p97/p98 for that logic update and exits on the next overshooting update.

## 2. Healing completion performs an immediate p7 reposition, not an immediate full rejoin

Player p97 exit (`2189759..2189990`):

- `p = 7`
- `l = -1`
- `tx = 346`
- if current healing-slot `_y < 576`:
  - `_y = 397`
  - `ty = 249`
- else:
  - `_y = 782`
  - `ty = 946`
- `h.gotoAndStop(1)`
- `vc(i)`

Enemy p98 mirrors the same Y split and uses `tx = 1545` (`2190303..2190520`).

This means two different things happen at healing completion:

- **Immediate:** the unit is vertically repositioned from its fixed hospital slot to the p7 start Y (397 or 782) in the same logic update.
- **Not immediate:** the unit does not instantly return to normal strategy. It remains p7 and moves toward `(346,249)` / `(346,946)` for player or `(1545,249)` / `(1545,946)` for enemy.

The p7 dispatch around `2187161` checks `abs(tx-_x) + abs(ty-_y) < 50`. Only inside that strict Manhattan threshold does it restore `p = pp`, clear `l`, and return to ordinary behavior. Thus “healing complete” is not equivalent to “fully rejoined in one frame.”

## 3. Exit side is chosen from the hospital slot, not from the entry gate

The p97/p98 exit test reads the soldier's **current `_y` in the hospital**, after deterministic roster placement. It does not consult the earlier upper/lower retreat route.

Hospital row Y values are:

| effective row (`index % 5`) | hospital Y | p7 exit |
| ---: | ---: | --- |
| 0 | 480 | TOP |
| 1 | 540 | TOP |
| 2 | 600 | BOTTOM |
| 3 | 660 | BOTTOM |
| 4 | 720 | BOTTOM |

The player-controlled protagonist is mapped to effective index 27, so its hospital slot is `(193,600)` and it exits through the **BOTTOM** p7 route. Raw `m27` is swapped to effective index 0 and therefore uses `(68,480)` and the **TOP** route.

## 4. p7 does not reverse through recovery tile 998/999

The collision grid uses `round(x/36), round(y/36)`.

At p7 start:

- TOP `y=397` -> collision row **11**
- BOTTOM `y=782` -> collision row **22**

Player hospital columns are raw X `68,93,118,143,168,193`, producing p7 start X cells:

`[2,3,3,4,5,5]`

Enemy columns `1647,1672,1697,1722,1747,1772` produce:

`[46,46,47,48,49,49]`

These row-11 / row-22 start cells are zero-code cells, not player recovery tile 999 or enemy recovery tile 998. The exit therefore is not the reverse of the entry collision path. The p7 target cells are:

- player TOP `(10,7)`, BOTTOM `(10,26)`
- enemy TOP `(43,7)`, BOTTOM `(43,26)`

The revival's preserved visual-headquarters guard must continue allowing `REJOINING` units through these zero-code openings.

## 5. The original HP bar is materially narrower and differently colored than the current neutral extracted image

A direct SWF tag parse found the HP movie clip in Sprite2455:

- PlaceObject2 tag start: approximately `2182094` (payload `2182100`)
- instance name: `h`
- character: Sprite **667**
- depth: 12
- translation: `(-120,-520)` twips = **(-6,-26) px**
- local scale X: **0.4666595458984375**
- local scale Y: **1.0000457763671875**

The previous revival renderer already used the correct `(-6,-26)` offset but omitted this additional local scale, so a nominal 30px bar was being displayed at roughly twice the original width. The full raw fill is about 29.9933 Sprite667-local pixels before the parent scale, or about **13.9967 source pixels** after the parent X scale.

The same PlaceObject2 carries CXFORMWITHALPHA:

- multiplier `(230,230,230,256)`
- additive `(-79,0,83,0)`
- divisor 256

Direct shape parsing gives:

- empty/background source shape: RGB `(0,0,0)`
- fill source shape: RGB `(173,173,173)` (`#adadad`)

After the parent color transform these become:

- empty/background: **`#000053`**
- fill: **`#4c9bee`**

The revival had been drawing the untransformed black / neutral-grey extracted masks, so the observed visual mismatch was real in both width and color.

## 6. Sprite667 is a 100-frame non-linear/quantized fill timeline

Sprite667 has 100 frames. The fill is shape 665 (40px source width) under a per-frame 16.16 X matrix. Examples:

- frame 1: `49141 / 65536` -> 29.993286px
- frame 51 (50% HP): `24736 / 65536` -> 15.097656px
- frame 100 (1% HP): `819 / 65536` -> 0.499878px

The active frame is `101-floor(hp/mp*100)`. The previous revival used a simple linear `30 * percent / 100` crop. The port now uses the recovered 100-frame matrix values while retaining the extracted alpha masks.

## Port consequence

The conformance port must therefore preserve all of the following together:

1. p97/p98 `mp/400` healing and strict `hp > mp` exit.
2. HP-bar refresh on each healing update and forced full bar at p7 entry.
3. p7 exit side selected from the fixed hospital-slot Y.
4. immediate Y reposition to 397/782, followed by non-instant p7 movement until strict Manhattan `<50`.
5. row-11/row-22 zero-code exit cells rather than 998/999 reverse traversal.
6. Sprite2455 `h` offset, local scale, color transform, and Sprite667 100-frame fill progression.
