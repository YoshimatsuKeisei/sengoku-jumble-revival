# Base contact evidence

Current reconstruction resolves a movement crossing against the base attack surface, applies base damage/fortify handling, then applies an outward bounce. A separate base-access collision pass can also push a soldier out of the base rectangle.

Runtime characterization now demonstrates two independent oscillation paths:

1. after a valid base hit, the 10-update contact lock allows movement to re-enter the base without another hit, after which the separate base-access collision pass snaps the soldier back out;
2. a soldier whose Y lies inside the full base rectangle but outside the current narrow attack surface can repeatedly cross into the base, deal no damage, and be snapped back to the same exterior boundary without ever arming the base-contact lock.

## Confirmed source geometry versus unconfirmed damage surface

The SWF-derived `assets/bases/base_reconstruction_manifest.json` verifies the visible main-battle base geometry directly from the SWF definition chain. The reconstructed player and enemy base crops are each 189 source pixels wide by 400 source pixels high, with separate 184x61 top-fence placements. The manifest records `pixel_exact_recomposition: true`, `definition_chain_verified_from_swf: true`, and `new_pixels_drawn: false`. `BATTLEFIELD_BASE_SOURCE_RECTS` uses those same 189x400 source rectangles for the runtime base body.

This confirms the physical/visual base rectangle, but it does **not** prove that every Y position along that 400-pixel height is an attackable damage surface. The runtime currently derives a much smaller attack surface from `damageCoreHeightRatio: 0.3` plus `frontSegmentDepth: 14`.

The 0.3 ratio is not an SWF-confirmed value. In repository history at commit `1ffbbc384e7be1891b1aea0a51e45c2255a7d0a4`, `BASE_CONFIG` is explicitly introduced under the comment `Temporary v1 base combat values; only base destruction as an instant result is confirmed.` Therefore the current central-30% attack span must not be treated as an original-game fact or used as a hard conformance gate. Conversely, the confirmed 189x400 visual rectangle alone is not sufficient evidence to replace the attack surface with the full rectangle.

The exact SWF attack-surface vertical span, ordering, and contact re-arm semantics still need direct AVM1 evidence. Therefore the anti-oscillation expectation remains inferred and the vertical attack span remains unconfirmed. Neither may justify arbitrary timing, distance, steering, or hitbox changes until direct SWF evidence is recovered.
