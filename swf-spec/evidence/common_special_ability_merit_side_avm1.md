# Common ability merit-side attribution — direct AVM1 evidence

Canonical source: recovered `sgjbgm.swf`, SHA-256 `47d397d98ed797e2e5e1f7f96c10ba9c3f93d3a3b54b45fbc61401a553c3399c`, CWS/SWF v7/24 fps. The offsets below are byte offsets in the directly regenerated decompressed FWS AVM1 stream.

All findings in this note are **【確定】** from the raw battle Sprite2456 code.

## s8 SIEGE / base rsj

Player attacking the enemy base in `d()`:

- `0x217248`: s8 check.
- `0x21726c..0x21727d`: enemy base HP (`ecp`) is reduced by 2.
- `0x21729b..0x2172b0`: attacker `rsj` is increased by 2.
- without s8, `0x2172b6..0x2172bf` reduces `ecp` by 1 and `0x2172dd..0x2172f2` increases `rsj` by 1.
- the base-HP clamp follows afterward.

The mirrored enemy-attacking-player-base branch begins around `0x217468`. It reduces `mcp` by 2 with s8 or by 1 normally, but contains no mirrored attacker `rsj` increment.

Therefore the **damage effect is mirrored, the rsj merit bookkeeping is not**. Enemy base attacks must not create revival `baseDamage` merit.

## s16 FIELD_HOSPITAL / rsk

Enemy patient entry around `0x2177cf` calls `erjo()`, heals 30 and clamps at max HP (`0x2177f9..0x217832`), with no `rsk` addition.

Player patient entry around `0x217a80` calls `mrjo()` and retains the last matching s16 holder. The raw branch then:

- saves pre-heal HP at `0x217ac4..0x217ad0`;
- adds 30 at `0x217ad1..0x217ae6`;
- clamps at max HP at `0x217ae7..0x217b0a`;
- adds the actual restored amount to the selected holder's `rsk` at `0x217b0b..0x217b26`.

Thus s16 healing is mirrored but **FIELD_HOSPITAL recovery merit is player-side only**.

## s14 TREATMENT / rsk

In `tat()`, after the treatment additions and clamp, the raw code checks the healer/patient side before crediting recovery merit. The player-side branch adds the actual restored treatment HP to the healer's `rsk`; the enemy-side treatment still heals but does not receive mirrored `rsk` bookkeeping.

The s20 pre-treatment `sz(5)` pulse remains ordered before the treatment additions; this note changes only merit attribution, not healing arithmetic or order.

## s13/s15/s20 `sz(5/6)` support pulse / rsk

The regenerated `sz()` mode-5/mode-6 paths first perform the same healing arithmetic for the eligible same-team target: +1 HP, another +1 if the target owns s20, then max-HP clamp. The merit sub-branch is separately side-gated: only the player-side case increments the pulse source's `rsk`, and that increment is exactly +1 per healed target regardless of whether s20 restored 2 HP.

Therefore:

- player source + eligible target: heal occurs and source `rsk += 1`;
- enemy source + eligible target: the same heal occurs but source `rsk` is unchanged;
- s20 never doubles the pulse merit event.

## Revival consequence

`recordBaseAttack()`, `recordRecovery()`, and `recordSmallRecoveryPulse()` are the common-ability merit hooks used by the reconstructed s8/s13/s14/s15/s16/s20 paths. They must preserve the raw player-only merit attribution while leaving mirrored damage/healing effects intact.
