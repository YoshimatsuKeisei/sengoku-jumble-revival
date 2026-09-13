# Sequential normal-contact attack — direct AVM1 integration

Source of truth: recovered `sgjbgm.swf` SHA-256 `47d397d98ed797e2e5e1f7f96c10ba9c3f93d3a3b54b45fbc61401a553c3399c`, Sprite2456.

- `d()` resolves exactly one dynamic candidate from the proposed 36-unit `f[][]` cell (or the current-target override). There is no independent all-pairs radial attack scan.
- Attack gate `0x217dfd..0x217ec8` requires both participants to differ from stored `bx/by`, opposite teams, both `sp==0`, candidate `p<95`, and candidate `fr._currentframe!=6`.
- `shk()` initializes each soldier `bx=0`, `by=0` at `0x21bb7e..0x21bba7`. A successful contact attack stores both participants' current `_x/_y` back to `bx/by` at `0x217f3b..0x217f6e`.
- Cubic `pw` contest immediately calls `atck(...,0)` at `0x217f04..0x217f3a`; the branch then jumps past the 24-unit/k=3 physical-contact response.
- In `atck()`, ordinary `random*200` defense is consumed before s12/HORO; mode-0 guard includes equality. HORO is valid for normal contact.
- Damage order is base 1, s10/MIGHT, s9/FINISHER threshold, then s34/NINJA_HUNTER.
- Both participants receive the mode-0 k=10 lock. Defender impulse is 10 source units normally; successful s11/IRON_WALL guard changes defender to 5 and gives attacker the opposite 10-unit impulse.
- HP mutates synchronously; fatal cleanup waits for the k response.

Reconstruction consequence: normal contact attack must be owned by the same sequential `f[][]` resolver that selected the pair. The old revival-only unordered radial pass is suppressed whenever that resolver ran for the roster.
