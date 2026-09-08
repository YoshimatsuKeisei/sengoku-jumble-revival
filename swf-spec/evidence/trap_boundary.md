# TRAP raw half-branch and adopted runtime trigger

## Raw SWF evidence

The recovered AVM1 battle loop contains explicit source-space half checks around the TRAP-related roster lookup branches:

- player-side invader branch: `_x > 900`, followed by the enemy-side `eskk()` lookup
- enemy-side invader branch: `_x < 900`, followed by the player-side `mskk()` lookup
- successful TRAP effect applies HP -1 with a floor of 2 HP, `k = 10`, and `t = 20`

Therefore source X = 900 is a real raw-SWF eligibility boundary and must remain documented as such. The value is in SWF source coordinates, not the 2400x900 reconstruction world coordinates.

## Reconstruction behavior adopted on 2026-09-07

The revival intentionally does **not** use X=900 as an invisible runtime collision/trigger line. During the 2026-09-07 movement investigation, the project requirement was corrected to the observed/remembered original-game behavior: TRAP should be checked when a soldier makes a **new contact with an enemy-owned fixed fence**. Merely crossing or moving inside the opposing half must not stop movement or continuously re-roll TRAP.

The active implementation therefore uses `updateEnemyFenceTrapContacts()` and tracks `touchingEnemyFenceIds` so that:

- entering the opposing half by itself does not roll TRAP;
- a new enemy fixed-fence contact is eligible for the two roster-slot TRAP draws;
- remaining on the same fence contact does not re-roll;
- after a successful TRAP, the confirmed 10-tick action lock and 20-tick trap state still apply;
- leaving and later making a genuinely new enemy-fence contact can become eligible again.

This distinction is intentional. The raw X=900 AVM1 branch is preserved as source evidence, while the active revival trigger follows the later project-level gameplay correction instead of recreating the invisible-line bug.
