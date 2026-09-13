# Normal melee facing evidence (raw AVM1)

Source: recovered `sgjbgm.swf`, function `atck(sa, sb, ss)`.

For ordinary contact attacks the caller uses `atck(target, attacker, 0)`, so `sa` is the defender and `sb` is the attacker.

Direct AVM1 reconstruction:

- `dx = sb._x - sa._x`
- `dy = sb._y - sa._y`
- `angle = Math.atan2(dy, dx)`
- `fi = Math.round(angle / 0.75) + 5`, wrapped into 1..8
- before the defense comparison, `sa.k = 10` and `sa.fi = fi`
- later, the local direction is rotated by +4 (wrapped 1..8), `sb.k = 10`, and while the defender remains above 0 HP `sb.fi` receives that opposite direction

Relevant recovered bytecode offsets:

- 2220106..2220217: defender-to-attacker vector, `atan2`, and 8-way `fi` quantization
- 2221756..2221778: `sa.k = 10`, then `sa.fi = fi`
- 2221779 onward: ordinary defense comparison begins only after that facing assignment
- 2223956..2224054: rotate by four directions, set `sb.k = 10`, then set attacker `fi` while defender HP is above zero

Therefore normal melee facing is not a rendering artifact and is not conditional on a successful damaging hit. The defender must face the attacker before either the H (hit) or S (guard) branch is resolved. The revival should preserve the SWF 8-way quantization rather than using a continuous normalized angle.
