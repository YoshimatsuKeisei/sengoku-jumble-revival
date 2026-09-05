# Codex implementation specification

## Goal

Replace only the existing placeholder/CSS attack effects with the original SWF effect atlases. Preserve combat decisions, damage, hit timing, targeting, and existing character state logic.

## Runtime files

- `effect_atlas.json`: atlas page and source rectangle for each Bitmap ID.
- `effect_sequences.json`: logical effect playback and SWF timeline.
- `action_effect_map.json`: `unitType + actionCode` lookup.
- `atlases/*.png`: cache once; never request frame PNGs individually.

## Required lookup

```ts
const action = actionMap.units[unitType]?.actions[String(actionCode)];
const caster = action?.effects.caster ?? [];
const projectile = action?.effects.projectile ?? [];
const hit = action?.effects.hit ?? [];
```

`action_code` is the stable key. Do not branch on Japanese folder/display names.

## Playback

1. Start `caster` at the attacker's effect anchor when the attack begins.
2. Start `projectile` at the existing projectile launch event and move its root from attacker to target using existing battle timing.
3. Start `hit` on the recipient only when the existing hit/damage event occurs.
4. For each logical effect, compute `swfFrame = floor(elapsedMs * fps / 1000) + 1`.
5. Resolve that SWF frame in `timeline_playback`.
6. If `bitmap_id`/`output_frame_index` is null, draw nothing for that frame.
7. Otherwise resolve the sequence frame's `region_id`, then crop from its atlas page.
8. Stop after `total_swf_frames` unless `loop` is true.

Do not assume every `frame_XXX` lasted one tick. `timeline_playback` is authoritative.

## Drawing

Use the untrimmed region dimensions without scaling during the first integration. Set `ctx.imageSmoothingEnabled = false`. Place the logical effect root at the attacker or recipient anchor, then apply `selector_placement_matrix` and the active timeline row's `matrix`. Matrix `tx`/`ty` values are pixel offsets from the effect root.

```ts
ctx.drawImage(
  atlasImage,
  region.x, region.y, region.width, region.height,
  drawX, drawY, region.width, region.height,
);
```

If the current renderer scales the battlefield, apply that same world-to-screen scale after composing the SWF-local offsets. Do not change the atlas pixels themselves.

## First vertical slice: teppou code 17

- Character frame family: 41-48.
- Projectile: `archer_teppou_attack2_projectile`.
- Hit: `fr_exp`.
- Cache the projectile and hit atlas pages once.
- Existing attack logic determines launch, travel, and damage time.
- Remove/disable only the CSS placeholder corresponding to this attack after the atlas renderer is visible.

After code 17 works, generalize through `action_effect_map.json`; do not hard-code one renderer per Japanese technique name.

## Safety checks

- Never auto-play a sequence with `runtime_enabled: false`.
- Respect each action effect's `conditional` flag.
- Action 27 contains side-specific `j`/`e` logical variants; keep them separate until team-side selection is wired.
- Several logical Effect IDs reuse the same Bitmap sequence with different selector placement. Deduplicate atlas pixels, not logical Effect definitions.
