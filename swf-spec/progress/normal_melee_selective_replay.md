# Normal melee selective replay status

This file tracks the safe re-introduction of raw-SWF normal melee/contact behavior after the rejected broad integrations. Do not treat an old green test result as proof of original behavior; each stage follows raw SWF evidence -> isolated implementation -> CI -> device validation.

## Safety anchors

- `c63d3274579c6d924f99ad5c3bfa83a74a2ad388` — rollback baseline after the bad contact integration; ranged / command / trap work retained.
- `aff18bdf47a28b2a8eebdb2a20d5d78c0088748b` — sequential physical contact baseline; device approved.
- Rejected historical references only:
  - `cf0ef57f5aac12bd0a0ccf10978be8315562d024` — unconditional/all-pairs contact spacing caused circular movement and protagonist ally dragging.
  - `e82ac536a58173279b04d3488ef7ca83d3ee9cf1` — broad normal-contact attack integration caused freezes and wrong knockback direction.
  - `f5babceaffd699f332f24f5830fb4fc27b900c09` — useful AVM1 reference, but never replay wholesale.

## Selective replay completed so far

| Stage | Safe commit | Status | What is isolated |
| --- | --- | --- | --- |
| Sequential `f[][]` physical contact | `aff18bdf...` | device approved | SWF update order, one proposed-cell occupant, 32/24 correction, k=3 physical impulse |
| Dynamic candidate selection | `ef73c8e1...` | device approved | current-target strict `<20/<20` override, otherwise proposed 36-unit cell occupant |
| Normal melee defender facing | `b776ec1a...` | device approved | defender faces attacker using raw eight-way `fi` before S/H resolution |
| Selected-pair attacker contest | `333e5dbf...` | device approved | cubic `pw^3` contest for one selected enemy pair |
| Attack-branch physical skip | `cb10b78a...` | device approved | once selected attack actually starts, do not also arm the k=3 physical-contact branch |
| Mode-0 defense / HORO ordering | `98aaae2e...` | device approved | `random*200` first, HORO extra `random*100`, strict `>30` forces defense roll 0 |
| Mode-0 damage ordering | `b78cb13a...` | device approved | base -> MIGHT -> FINISHER threshold -> NINJA_HUNTER |
| k=10 + melee impulse bundle | current stage | CI green / device pending | both-participant k=10 compatibility lock; defender faces attacker but moves away; ordinary 10-unit impulse; IRON_WALL defender 5 + attacker recoil 10; attacker opposite facing |

## Still intentionally retained as compatibility safety nets

These are **not** claimed to be raw-SWF final behavior:

- selected normal contact still starts the revival `ATTACK_WINDUP -> ATTACK_RECOVERY` state machine instead of resolving the whole raw `atck(...,0)` synchronously;
- `normalCombatSystem` still has a legacy all-pairs contact fallback when the selected raw path cannot safely start;
- legacy movement/contact stopping therefore still participates in preventing no-attack dead zones while migration is incomplete.

Never remove the all-pairs fallback merely because a raw candidate was selected. Rejected `e82ac536...` showed that this creates a no-move/no-attack dead zone when movement stops for contact but the raw attack gate rejects the selected pair.

## Remaining device checkpoints

The earlier long checklist is now grouped by dependency. Git history/evidence may still use smaller changes, but strongly coupled behavior should be validated together rather than forcing one device run per tiny rule.

1. **Current impulse bundle** — device-check k=10 behavior, outward normal hit/guard movement, IRON_WALL recoil, and attacker facing together.
2. **Exact entry/history bundle** — reproduce the direct `d(i)` attack-entry checks (`bx/by`, opposing team, both `sp==0`, candidate `p<95`, candidate `fr._currentframe!=6`) plus the exact post-`atck` `bx/by` updates. The `fr` frame-6 runtime mapping must be established from raw SWF before implementation; do not guess it.
3. **Synchronous atck/post-attack bundle** — move the selected raw event away from revival WINDUP toward synchronous `atck(...,0)` semantics and reproduce the post-defense/damage `l`/engagement + RUSH ordering/boundaries. Keep compatibility fallback during this checkpoint.
4. **Fallback-removal/final audit** — only after the selected raw path and non-attack physical branch cover the formerly unsafe cases, remove the legacy all-pairs fallback, re-audit `moveAiSoldiers()` contact stopping, then run dense-crowd, retreat, fatal-hit, ranged, base/movement, and full-device battle regressions.

So after the current bundle passes, the risky normal-melee block should require roughly **two more migration device checkpoints plus one final integration checkpoint**, not one device run for every old checklist item.

## Already outside this risky normal-melee block

The safe baseline already retains earlier isolated work for ranged target acquisition/resolution/physical impulse, general-command callback behavior, trap/fence behavior, recovery/hospital/base collision, battle markers, direct strategy rules, and the previously audited special-ability infrastructure. The current selective replay is therefore primarily closing the **normal soldier-to-soldier melee/contact** gap rather than restarting the entire SWF integration from zero.
