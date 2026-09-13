# Raw AVM1 evidence: selected normal-contact attacker

Source: recovered `sgjbgm.swf`, normal soldier update `d(i)` and mode-0 `atck(sa, sb, ss)` path.

## Confirmed sequence

1. `d(i)` clears the current unit's old dynamic `f[][]` cell and evaluates exactly one dynamic contact candidate:
   - current `l` when it is inside the strict `<20/<20` axis window, otherwise
   - the single dynamic occupant stored in the proposed 36-unit `f[][]` cell.
2. The opposing-contact gate is evaluated at `2194909..2195145`. When eligible, the one contest draw at `2195150..2195199` uses the participants' cubed `pw` weights.
3. The selected result calls exactly one mode-0 attack:
   - `2195204..2195228`: `atck(candidate, current, 0)`, or
   - `2195234..2195258`: `atck(current, candidate, 0)`.
4. After that call, `2195259..2195310` updates both participants' `bx/by` to their current `_x/_y`.
5. `2195324` then jumps directly to `2196643`. Therefore the successful selected-contact attack path does not execute the downstream physical-contact block.
6. Only when the attack gate is not taken does execution fall through from `2195329` into the physical path. That path contains the 32/24 spacing logic and, at `2196289..2196388`, arms candidate/current `k=3` contact impulses.

## Consequences for the revival

- Normal contact attacker selection must be scoped to the one candidate selected by the raw `d(i)` contact lookup, not every nearby enemy pair.
- The attacker-side probability is `pwA / (pwA + pwB)` after cubing the raw combat values.
- One selected contact contest chooses one attacker for that selected pair.
- If that selected attack branch starts, the same contact event must not also arm the physical `k=3` response.
- If the staged revival cannot start the selected attack through its current safe action state, retaining the existing physical branch and legacy combat fallback is an integration safety measure, not an original-SWF rule.
- This evidence does **not** yet justify replacing the revival's current damage, defense, `k=10`, knockback, or full action-lock translation. Those remain separate integration steps.
