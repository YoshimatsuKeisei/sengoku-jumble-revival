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
| Mode-0 damage ordering | current stage | CI/device pending | base -> MIGHT -> FINISHER threshold -> NINJA_HUNTER |

## Still intentionally retained as compatibility safety nets

These are **not** claimed to be raw-SWF final behavior:

- selected normal contact still starts the revival `ATTACK_WINDUP -> ATTACK_RECOVERY` state machine instead of resolving the whole raw `atck(...,0)` synchronously;
- `normalCombatSystem` still has a legacy all-pairs contact fallback when the selected raw path cannot safely start;
- legacy movement/contact stopping therefore still participates in preventing no-attack dead zones while migration is incomplete.

Do not remove those safety nets in the same commit as another combat semantic change.

## Remaining raw normal-contact migration

The order below is the intended safe sequence, not a license to merge several stages at once.

1. **Finish mode-0 damage order** — current stage.
2. **Exact raw attack-entry gate** — reproduce the `d(i)` eligibility checks that are not represented exactly by `canStartSoldierAttack()`, including the recovered `bx/by`, `sp`, `p`, and frame-state conditions. Keep compatibility fallback until device validated.
3. **Synchronous selected `atck(...,0)` handoff** — remove revival WINDUP only for a raw-selected contact event after all prerequisites are isolated. Do not globally suppress legacy combat merely because a candidate was selected.
4. **Raw k=10 lock for both participants** — ten subsequent `d()` updates consume k=10..1; ordinary logic resumes after that. Preserve the already-confirmed delayed fatal cleanup.
5. **Raw melee impulse** — defender faces attacker but moves in the opposite direction; ordinary defender impulse 10 source units with 0.7 decay. This is the sign error that broke `e82...`.
6. **IRON_WALL guard impulse** — guarded defender outward 5 source units and attacker opposite recoil 10, without changing the ordinary branch.
7. **Attacker post-resolution facing/pose** — attacker uses the direction opposite the defender-facing `fi` while the defender remains alive.
8. **Post-attack `l`/engagement and RUSH behavior** — reproduce the independent defender/attacker retarget branches and exact `>70` / `<=70` random boundary/order.
9. **`bx/by` post-atck update and re-entry semantics** — update the contact-history coordinates exactly where raw `d(i)` does so repeated attack eligibility matches AVM1.
10. **Remove the legacy all-pairs fallback** — only after the raw selected path plus non-attack physical branch can run without the former freeze/dead-zone. Re-test `moveAiSoldiers()` contact stopping at the same time.
11. **Final normal-melee integration audit** — full SWF suite, movement/base regressions, dense-crowd regression, retreat pursuit, fatal-hit sequencing, ranged regression, then device battle test.

## Already outside this risky normal-melee block

The safe baseline already retains earlier isolated work for ranged target acquisition/resolution/physical impulse, general-command callback behavior, trap/fence behavior, recovery/hospital/base collision, battle markers, direct strategy rules, and the previously audited special-ability infrastructure. The current selective replay is therefore primarily closing the **normal soldier-to-soldier melee/contact** gap rather than restarting the entire SWF integration from zero.
