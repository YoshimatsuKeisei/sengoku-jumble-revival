# Data guide

## If implementing enemy generation
Use these files first:

1. `map/map_points_all.json`
   - all 17x17 map coordinates
   - category, stage name, displayed level, internal `elv`, formation pool/id
2. `formations/formations_all.json`
   - each formation's 30 base slots
   - initial world coordinates, class, raw strategy
3. `generation/battle_setup_overrides.json`
   - ordinary plain-field Lv4+ cavalry conversion
4. `generation/generic_name_generation.json`
   - generic-name pools and class-dependent suffix selection
5. `generation/stat_generation_rules.json`
   - class base rolls, `elv = level*5-10`, caps
6. `generation/final_stat_envelopes_by_level.json`
   - theoretical overall class min/max envelope by Lv1..10
7. `generation/technique_generation_rules.json`
   - technique control flow and both `fmdat` distributions
8. `famous/famous_units_by_efm.json`
   - fixed famous-unit overrides
9. `validation/source_anomalies.md`
   - source quirks that must not be silently “fixed”

## If implementing fixed named stages
Use `map/named_stages_resolved_30slots.json`.
Each of the 31 named stages contains all 30 formation slots, with famous-unit overrides attached to the appropriate slots and generic slots marked as generated.

## Coordinate conversion
Each 6-digit formation record is:

`XX YY C P`

and battle setup uses:

- `worldX = 1833 - XX * 36`
- `worldY = YY * 36`
- `C` = class code
- `P` = raw strategy code

## Display Lv vs internal stat adjustment
`mpcm()` uses:

`elv = displayedLevel * 5 - 10`

Examples:
- Lv1 => -5
- Lv2 => 0
- Lv3 => +5
- Lv4 => +10
- Lv5 => +15
- Lv6 => +20
- Lv7 => +25
- Lv8 => +30
- Lv9 => +35
- internal Lv10 => +40

This `elv`, not the displayed integer itself, is what `chpr()` adds to generic stats (HP excludes 忍者).
