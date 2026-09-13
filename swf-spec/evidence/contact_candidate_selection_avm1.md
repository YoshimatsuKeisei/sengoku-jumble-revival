# Raw AVM1 evidence: dynamic soldier contact candidate selection

Authoritative source: recovered `sgjbgm.swf`, Sprite2456 `d(i)`.

This evidence intentionally stops before attack, damage, facing, k-lock, and impulse resolution.

- `2190575...`: when the current `l` target is inside strict `abs(dx) < 20 && abs(dy) < 20`, the raw routine marks the target-contact override.
- `2191441..2191549`: ordinary movement computes one proposed position and reads exactly one dynamic occupancy entry from `f[round(proposedX/36)][round(proposedY/36)]`.
- `2194893..2194904`: a dynamic code `0 < r4 < 201` resolves to exactly one soldier candidate `m + r4`.
- The current-target `<20/<20` path overrides the proposed-cell dynamic occupant for that `d(i)` call.
- There is no global nearest-neighbor scan and no unordered all-pairs contact search in this candidate-selection step.

Safety boundary for the reconstruction stage:

- candidate selection only;
- no normal attack is started;
- no existing `updateNormalCombatContests()` path is suppressed;
- no HP, reaction state, facing, `k`, `fx/fy`, or knockback state is changed.
