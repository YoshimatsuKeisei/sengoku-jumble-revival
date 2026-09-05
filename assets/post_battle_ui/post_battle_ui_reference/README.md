# Post-battle UI reference

This package isolates the original SWF assets and behavior for the requested four-screen post-battle flow.

## Copy into the project

Copy only `assets/post_battle_ui/` to the project's existing root-level `assets/` directory. The runtime uses one lossless atlas plus JSON configuration. `post_battle_ui_reference/` is archival analysis and should not be loaded by the app.

## Confirmed SWF structure

- Stage: 380×380, 24 fps.
- Battle outcome: root frame 20, Sprite 3216 (`kend`) at (31,22).
- Character/list hub: root frame 21, Sprite 3312 (`sng`).
- Merit list: Sprite 3312 frame 6, label `rlst`, list root Y=30.
- Enemy list: Sprite 3312 frame 8, label `elst`, list root Y=30.
- Enemy detail/recruit: Sprite 3312 frame 3, label `st02`, root Y=0.
- List rows: 30 allocated rows, 27.3 px spacing, 10 visible rows.

## Important implementation boundary

The original SWF contains score, money, stipend, roster replacement and recruitment branches, but the current game has no verified domain adapter for those values. The supplied implementation prompt keeps those operations disabled. Unknown values are `null` and render as `--`; they are never silently turned into zero.

The original defeat button returns toward the map, while the requested project flow asks to make all four screens reachable. This difference is isolated in `post_battle_ui_manifest.json` as a routing policy rather than hidden in rendering code.

## Files

- `assets/post_battle_ui/atlas/post_battle_ui_atlas.png`: runtime atlas.
- `assets/post_battle_ui/config/atlas_manifest.json`: untrimmed atlas rectangles and SHA-256 source hashes.
- `assets/post_battle_ui/config/post_battle_ui_manifest.json`: coordinates, timelines, button states and transitions.
- `post_battle_ui_reference/data_contract.json`: real-versus-placeholder values.
- `post_battle_ui_reference/swf_button_records.json`: extracted button state/display records and compact actions.
- `post_battle_ui_reference/source_assets/`: exact source PNGs retained individually.
- `CODEX_IMPLEMENTATION_PROMPT.md`: one-block implementation instruction.


## 2026-09-06 supplement integrated

A direct SWF re-analysis was performed after the original package was built. The integrated supplement confirms the enemy-detail screen in more detail:

- enemy_detail (`Sprite 3312`, label `st02`) is frame 3.
- The dynamic value fields are `nm`, `lhp`, `lkp`, `lsp`, `lpw`, `ldf`, and `rkd`.
- The special-ability area has 18 visible slots, not 16.
- `heishu` and `wazashu` are movie clips whose content changes by frame.
- The supplement is bundled under `post_battle_ui_reference/enemy_detail_supplement/`.
- Runtime convenience mapping is provided at `assets/post_battle_ui/config/enemy_detail_mapping.json`.
