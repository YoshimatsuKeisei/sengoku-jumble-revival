# Damage reaction priority

Previously established SWF behavior orders reactions as death, then hit-stun, then critical-HP emergency retreat, then normal action. A hit that crosses the retreat threshold still completes hit-stun before emergency retreat begins. Additional hits during retreat may again place hit-stun ahead of retreat movement.

This rule is confirmed and specifically prevents hiding duplicate-damage bugs by making HIT_STUN grant blanket invulnerability.
