# Raw AVM1 evidence: selected normal-contact attacker

Source: recovered `sgjbgm.swf`, normal soldier update `d(i)` and mode-0 `atck(sa, sb, ss)` path.

## Confirmed sequence

1. `d(i)` clears the current unit's old dynamic `f[][]` cell and evaluates exactly one dynamic contact candidate:
   - current `l` when it is inside the strict `<20/<20` axis window, otherwise
   - the single dynamic occupant stored in the proposed 36-unit `f[][]` cell.
2. When that selected candidate is an opposing soldier and the mode-0 attack gate is eligible, the contact contest uses each participant's raw combat value `pw2` and replaces the contest weight with `pw = pow(pw2, 3)`.
3. The one contest draw selects which member of that selected pair becomes the mode-0 attacker. The resulting call is `atck(defender, attacker, 0)`.
4. The physical 32/24 spacing + `k=3` contact branch is downstream of this attack branch; a successful selected-contact attack branch jumps past that physical branch for that `d(i)` event.

## Consequences for the revival

- Normal contact attacker selection must be scoped to the one candidate selected by the raw `d(i)` contact lookup, not every nearby enemy pair.
- The attacker-side probability is `pwA / (pwA + pwB)` after cubing the raw combat values.
- One selected contact contest chooses one attacker for that selected pair.
- This evidence does **not** by itself justify replacing the revival's current damage, defense, `k=10`, knockback, or action-lock translation. Those remain separate integration steps.

## Staged-runtime safety note

During incremental integration, the revival may retain its previous all-pairs combat path only as a compatibility fallback when the selected raw pair cannot start through the current reconstructed attack state machine. That fallback is an implementation safety measure, not an original-SWF rule.
