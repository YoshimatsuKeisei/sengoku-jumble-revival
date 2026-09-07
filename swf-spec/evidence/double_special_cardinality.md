# DOUBLE_SPECIAL / 連発 cardinality

## Confirmed behavior

The reconstructed SWF specification used by this project identifies `連発` as an ability that causes the special attack to be performed twice consecutively. Therefore one successful 連発 occurrence is bounded to two total activations: the original activation plus one additional activation.

This evidence entry confirms only that cardinality. It does **not** confirm the proc probability, exact delay between the two activations, gauge-reset/subtraction details, or interaction timing with unrelated triggers such as a later general command. Those remain separately unconfirmed unless supported by SWF evidence.

The conformance test intentionally checks only that a single retained activation opportunity cannot recursively turn into a third, fourth, or later activation.
