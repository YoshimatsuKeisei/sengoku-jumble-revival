# SWF conformance specification

This directory separates machine-readable reconstruction rules from the evidence used to justify them.

Only `confirmed` rules may become hard SWF-conformance gates. `inferred` rules may have diagnostics but must not drive behavior-changing fixes until evidence is promoted. `unconfirmed` rules are investigation placeholders.

The first scope is battle behavior related to movement/TRAP, base contact, ranged attack cycles, general-command forcing, cooldown/recovery, duplicate projectile damage, and hit-stun ordering.
