# Base contact evidence

Current reconstruction resolves a movement crossing against the base attack surface, applies base damage/fortify handling, then applies an outward bounce. A separate base-access collision pass can also push a soldier out of the base rectangle.

Runtime characterization now demonstrates two independent enemy-base oscillation paths:

1. after a valid base hit, the 10-update contact lock allows movement to re-enter the base without another hit, after which the separate base-access collision pass snaps the soldier back out;
2. a soldier whose Y lies inside the full base rectangle but outside the current narrow attack surface can repeatedly cross into the base, deal no damage, and be snapped back to the same exterior boundary without ever arming the base-contact lock.

## Confirmed source geometry versus unconfirmed damage surface

The SWF-derived `assets/bases/base_reconstruction_manifest.json` verifies the visible main-battle base geometry directly from the SWF definition chain. The reconstructed player and enemy base crops are each 189 source pixels wide by 400 source pixels high, with separate 184x61 top-fence placements. The manifest records `pixel_exact_recomposition: true`, `definition_chain_verified_from_swf: true`, and `new_pixels_drawn: false`. `BATTLEFIELD_BASE_SOURCE_RECTS` uses those same 189x400 source rectangles for the runtime base body.

This confirms the physical/visual base rectangle, but it does **not** prove that every Y position along that 400-pixel height is an attackable damage surface. The runtime currently derives a much smaller attack surface from `damageCoreHeightRatio: 0.3` plus `frontSegmentDepth: 14`.

The 0.3 ratio is not an SWF-confirmed value. In repository history at commit `1ffbbc384e7be1891b1aea0a51e45c2255a7d0a4`, `BASE_CONFIG` is explicitly introduced under the comment `Temporary v1 base combat values; only base destruction as an instant result is confirmed.` The later terrain-layout migration at commit `e3f74e95f7983fae6a6d6c45acb92c98eba564c6` replaced the earlier provisional distance-based base attack flow with the current movement-contact model. The central-30% surface therefore belongs to the reconstruction history, not to a recovered original-game constant.

## Historical gameplay evidence for off-center attacks

Two independent community gameplay references describe attacking the enemy base from upper/lower approaches rather than only through its center. The Sengoku Jumble strategy wiki FAQ recommends sending the high-durability ninja trio from the top and bottom to avoid central defenders and explicitly describes the result as attempting a base attack. The formation guide likewise discusses concentrating charge ninjas on the upper or lower side for base-attack routes. These are behavioral observations of the original game rather than AVM1 source evidence.

References:
- https://w.atwiki.jp/sengokujanburu/pages/24.html
- https://w.atwiki.jp/sengokujanburu/pages/289.html

This is strong evidence against treating the current central 30% as the only attackable vertical lane, so `BASE_ATTACK_OFF_CENTER_LANES_EXIST` is recorded as `inferred`. It is deliberately **not** promoted to `confirmed`: the references do not reveal the exact vertical hit-test extent, boundary coordinates, contact ordering, or re-arm timing. They therefore cannot justify replacing 0.3 with an arbitrary full-height ratio.

## Friendly-base retreat gate congestion

The reconstruction has a separate possible congestion path for soldiers retreating into their own base. AI retreat currently chooses one of two reconstructed gates (`TOP` or `BOTTOM`), moves first toward an exterior gate point and then toward an interior point, and changes to `HEALING` only after it has cleared the gate boundary.

The base-access collision system allows an `EMERGENCY_RETREAT` soldier to occupy its own base only while its current X coordinate remains inside the selected gate span. If crowd separation, obstacle resolution, or another movement correction shifts a retreating soldier sideways outside that span while it is entering the base rectangle, the same generic base-access collision pass can classify it as not allowed inside and eject it back out of the rectangle. This creates a distinct candidate mechanism for the reported friendly-base entrance pile-up. It is not the same mechanism as the enemy-base off-core attack loop, although both involve the generic base rectangle collision pass.

Repository provenance makes the distinction between visual geometry and original behavior important. The two-gate recovery design already exists in the repository's initial GitHub commit `7a535badba652cfe5ec0c7898ce1a8e1da3acf02`. In that same commit, `BATTLEFIELD_BASE_GATE_SOURCE_RECTS` is documented as alpha bounds of the upper/lower horizontal base fences and as entry corridors derived from the reconstructed image geometry. The runtime then uses those image-derived rectangles in `getPreferredBaseGate`, `isPointWithinBaseGateSpan`, and `hasClearedBaseGateBoundary` to decide recovery movement and admission.

This proves where the current gate rectangles came from, but it does **not** prove that the original AVM1 collision/state-transition code used the same rectangles or an X-span test at all. Visible fence openings are SWF-derived visual evidence; converting their alpha bounds directly into behavioral admission geometry is a reconstruction choice unless AVM1 confirms it. Therefore `FRIENDLY_BASE_RETREAT_GATE_CONGESTION` now explicitly records `visualGateRectsDerivedFromAlphaBounds: true`, leaves `swfBehavioralAdmissionSpan` null, and requires that visual corridors not be equated with original collision semantics.

The current two-gate geometry and its exact admission semantics are reconstruction behavior. No direct AVM1 evidence has yet established that the original SWF used these exact gate rectangles, the same X-span test, or the same collision ordering. Therefore `FRIENDLY_BASE_RETREAT_GATE_CONGESTION` is recorded as `inferred` and must not be used to hard-gate or redesign recovery behavior until the original gate-entry logic is recovered. A runtime characterization test documents the present failure mechanism without treating it as original-game fact.

## SWF recovery status

The archived recovery record identifies the analyzed SWF as a 3,814,810-byte CWS, SWF version 7, 24 fps, SHA-256 `47d397d98ed797e2e5e1f7f96c10ba9c3f93d3a3b54b45fbc61401a553c3399c`. The recovered AVM1 analyzer produced 389 action blocks; a rerun matched the existing `avm1_actions.json` byte-for-byte at SHA-256 `462a717a84f90cfd7efc7de91dbb4c44f0b769e555f64f1a1fa90d30d7c45b28`. The original Work path and intermediate-file existence are documented, but the raw SWF/`avm1_actions.json` are not currently accessible through this chat runtime, and the historical Wayback snapshot timestamp was not preserved. No direct base hit-test/gate-entry AVM1 has therefore been recovered in this branch yet.

The exact SWF attack-surface vertical span, base-contact ordering/re-arm semantics, and friendly-base gate-entry semantics still need direct AVM1 evidence. `BASE_ATTACK_SURFACE_VERTICAL_SPAN` remains unconfirmed, and neither historical behavior references nor visual/alpha-derived base geometry may be converted into an invented exact hitbox or gate-admission span.
