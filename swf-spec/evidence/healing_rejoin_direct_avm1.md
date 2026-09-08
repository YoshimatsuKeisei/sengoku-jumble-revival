# Direct AVM1 evidence: field-hospital healing and rejoin

Source: original `sgjbgm.swf`, SHA-256 `47d397d98ed797e2e5e1f7f96c10ba9c3f93d3a3b54b45fbc61401a553c3399c` (3,814,810 bytes, CWS, SWF v7, 24 fps). The behavior below comes directly from the regenerated AVM1 battle function `d` and movement helper `ido`.

## Healing states 97 / 98

The main battle function dispatches player healing state `97` and enemy healing state `98` separately, but the healing cadence is mirrored.

On each logic update the SWF performs:

- `hp += mp / 400`, where `mp` is maximum HP;
- when special `s20` is present, it adds `mp / 400` a second time, giving exactly double recovery;
- the displayed HP percentage is then refreshed.

The exit check is strict. The branch continues healing while `hp <= mp`; it starts the rejoin sequence only after an update makes `hp > mp`. Therefore reaching exactly maximum HP does not leave state 97/98 until the following logic update. At exit, HP is clamped back to `mp`.

## Transition to rejoin state 7

Once the strict-over-max condition is met, the SWF sets `p = 7` rather than immediately restoring the normal behavior state.

Player-side exit:

- rejoin target X = `346`;
- if current Y is below the split (`_y < 576`), the soldier is placed at Y=`397` and target Y=`249`;
- otherwise the soldier is placed at Y=`782` and target Y=`946`.

Enemy-side exit mirrors this with rejoin target X=`1545`, using the same Y split and Y pairs (`397 -> 249`, `782 -> 946`). The current X is not teleported to the target; only Y is repositioned before movement resumes.

The SWF also clears the current linked target (`l = -1`), resets the relevant animation/effect frames, and recomputes movement toward the rejoin target.

## Completion of state 7

State `7` checks Manhattan distance to the rejoin target:

`abs(tx - _x) + abs(ty - _y) < 50`

Only when that strict `< 50` condition is met does the SWF restore `p = pp` (the pre-recovery behavior state), clear the linked target, and call `ido` / `vc` to resume ordinary behavior and movement.

This directly contradicts the reconstruction path that, on reaching maximum HP, teleports the soldier to an alpha-derived gate exterior and immediately sets the soldier to `NORMAL`. A faithful runtime should preserve a distinct rejoin phase corresponding to SWF state `7`, keep the strict-over-max exit timing, and use the confirmed source-space coordinates above.
