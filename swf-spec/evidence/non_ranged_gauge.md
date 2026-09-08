# Non-ranged special gauge evidence status

This note deliberately separates the current reconstruction from directly recovered original-SWF evidence.

The runtime currently treats non-ranged AI special gauge as ready only when `combatGauge > 400`. At action start, the current reconstruction normally resets the gauge to zero, while its DOUBLE_SPECIAL branch reuses a retention condition derived during the earlier combat migration. Those runtime choices are implementation state, not newly re-verified original behavior.

The retained project records are insufficient to settle the original non-ranged `scd()` branch. Historical summaries conflict on the post-activation gauge operation: one describes a `spl()`-adjacent `kd -= 400` path, while another describes the ordinary non-ranged result as `kd = 0`. The raw `avm1_actions.json` / original `sgjbgm.swf` body that would distinguish those operations is not available in the current runtime. The exact non-ranged `s21` retention/overflow expression and the semantics of the `sp == 0` gate likewise have not been recovered to direct-instruction evidence here.

Accordingly, no production behavior change is justified from those summaries. In particular, the confirmed ranged rule (`kd > 200`, threshold-time consumption, `399 + kp` overflow guard) must not be mirrored onto non-ranged units by analogy.

The existing reconstruction also schedules gauge processing with `COMBAT_GAUGE_UPDATE_TICKS = 23`. The current retained evidence does not independently re-derive that interval from original AVM1, so `23` remains a runtime value rather than a newly confirmed SWF constant.

To promote either rule to `confirmed`, recover the original `scd()`/battle-update instruction sequence and record the relevant offsets/branches, including the exact post-threshold gauge operation, `s21` branch, `sp` gate, and scheduler call interval.
