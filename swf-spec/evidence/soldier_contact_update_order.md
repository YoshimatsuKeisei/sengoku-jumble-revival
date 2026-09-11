# Direct AVM1 evidence: soldier update order

## Source

Recovered original `sgjbgm.swf`, SHA-256
`47d397d98ed797e2e5e1f7f96c10ba9c3f93d3a3b54b45fbc61401a553c3399c`,
Flash 7 at 24 fps. Battle code is Sprite2456.

## `m200` drives the per-frame battle update

Sprite2456 places the protagonist instance `m200` from character 2455. Its
ClipEvent `EnterFrame` action record is 2257011..2260055.

Inside that record, offsets 2258956..2258979 push `this`, resolve `_parent`, and
call `_parent.d(this)`. Therefore the protagonist passes through the same `d()`
movement/collision function before the ordinary soldiers are iterated.

Later in the same EnterFrame record, offsets 2259835..2259850 call local
function `al()`.

## `al()` iterates `m1` through `m59` in ascending order

`al()` is defined by the `m200` load action at 2254697; its body is
2254710..2255312.

The loop initializes register 4 to 1 at 2254744..2254756, exits once the value
reaches 60 at 2254757..2254769, resolves `m + register4` at
2254774..2254789, increments register 4 at 2254969..2254979, and jumps back to
the loop condition at 2254980.

The normal route calls `_parent.d(currentSoldier)` at 2254948..2254963.
Special p-state routes select d2/d3/d4 or skip the unit, but the ordinary battle
movement route is `d`.

Thus the confirmed normal update order is:

1. `m200` via `_parent.d(this)`;
2. `m1`, `m2`, ... `m59` in ascending numeric order via `al()`.

This ordering matters because `d()` clears the current unit's previous `f[][]`
cell at entry and writes its resulting cell back before returning. Later units
therefore observe occupancy changes made by earlier units in the same frame.
The original is not a simultaneous all-pairs contact solve.

## Reconstruction consequence

A revival implementation of the raw contact system must preserve this
sequential/asymmetric property. Running one symmetric pairwise separation pass
after every unit has already moved changes the collision graph and was proven
unsafe by the failed `cf0ef57` device replay.
