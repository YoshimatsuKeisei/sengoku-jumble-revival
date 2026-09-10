# Normal contact attack: direct AVM1 evidence

Source of truth: recovered `sgjbgm.swf`, Sprite2456 AVM1 (`d()` / `atck()`).

## Contact resolves `atck(..., 0)` synchronously

`d()` performs the cubic combat contest and immediately calls `atck` in the same AVM1 execution:

- `0x00217ece..0x00217efe`: `Math.random() * (pwA + pwB)` contest against `pwA`.
- `0x00217f04..0x00217f1c`: one orientation calls `atck(..., 0)`.
- `0x00217f22..0x00217f3a`: the mirrored orientation calls `atck(..., 0)`.
- There is no independent windup timer or later target-position recheck between the contact contest and mode-0 `atck()`.

`atck` is defined at `0x0021de20` as `atck(sa, sb, ss)`. Mode `ss=0` is the normal contact path.

## Defense roll and immediate HP mutation

Inside `atck()`:

- `0x0021e128..0x0021e146`: the ordinary defense draw is `Math.random() * 200`.
- Existing direct ability evidence covers the later s12 HORO overwrite and the mode-specific s19 / teppou-vs-ninja branches.
- `0x0021e6bc`: defender `k = 10`.
- `0x0021e6d3..0x0021e6f1`: mode-0 defense branches from the same draw; the guard side includes equality (`roll <= df`), while `roll > df` enters the damage side.
- `0x0021e707..0x0021e729`: the damage branch subtracts the base 1 HP immediately.
- `0x0021e72a..0x0021e809`: s10 MIGHT, s9 FINISHER and s34/NINJA_HUNTER add their already-audited damage in raw order.
- `0x0021ef85`: attacker `k = 10` before `atck()` returns.

Therefore normal contact damage/guard is decided on the contact logic frame. The old revival-only `180ms windup -> later range recheck -> 320ms recovery -> 700ms cooldown` is not a direct SWF normal-contact rule.

## Raw direction table and k impulse

The global arrays are initialized directly at:

- `0x00225ed4..0x00225f2b`: `_root.fx`
- `0x00225f2c..0x00225f83`: `_root.fy`

With AVM1 argument order reconstructed the indexed values are:

- `fx[1..8] = [-1, -0.6, 0, 0.6, 1, 0.6, 0, -0.6]`
- `fy[1..8] = [0, -0.6, -1, -0.6, 0, 0.6, 1, 0.6]`

`atck()` computes the eight-direction `fi` from `atan2(sb-sa)` at `0x0021e04a..0x0021e0de` using `round(angle / 0.75) + 5` with wrap above 8.

Normal mode impulse setup:

- `0x0021f2e9`: initial defender impulse scalar `r20 = 10`.
- `0x0021f2f6..0x0021f366`: when the defender has s11 IRON_WALL and the mode-0 defense succeeded, `r20 /= 2`, so defender initial impulse is 5.
- `0x0021f367..0x0021f3ae`: that same IRON_WALL guard branch gives the attacker the opposite 10-unit `fx/fy` impulse.
- `0x0021f3af..0x0021f3dc`: defender receives `fx[fi] * r20`, `fy[fi] * r20` on all normal mode outcomes.

The `d()` k branch is direct at `0x00218675`:

1. `k--` (`0x00218675..0x00218682`)
2. next position is current position plus `fx/fy` (`0x00218683..0x002186ae`)
3. `fx *= 0.7`, `fy *= 0.7` (`0x002186af..0x002186e2`)

Thus the mode-0 contact response uses ten subsequent k updates with geometric `0.7` impulse decay. `k=10` is assigned during the contact frame after `d()` has already passed its entry `k==0` gate; ordinary `d()` behavior is available again after those ten k-consuming updates.

## Death ordering

`d()` tests fatal HP only after the k-gated behavior. Existing reaction conformance already fixes the `k -> tiky() -> p=99 -> led()` order. A fatal mode-0 contact therefore changes HP immediately but does not finalize battle-out before its confirmed k response completes.

## Reconstruction rule

The revival normal-contact path must therefore:

- resolve defense and HP synchronously in the contact call,
- assign the k=10-equivalent lock to both participants,
- preserve the direct `fx/fy` direction table and 0.7-per-tick decay,
- use defender initial impulse 10 normally,
- use defender 5 plus opposite attacker 10 only for a successful s11 IRON_WALL mode-0 guard,
- retain delayed fatal cleanup until the k response is complete,
- not invent a separate normal-contact windup, recovery timer or 700ms attack cooldown.
