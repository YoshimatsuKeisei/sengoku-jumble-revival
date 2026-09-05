#!/usr/bin/env python3
"""Retrace the South upper body from the actual game screenshot, recoloring only."""

from __future__ import annotations

import argparse
from pathlib import Path

from patch_south_legs import write_png
from patch_south_master_v2 import fill_rect
from validate_sprite import PngImage, read_png


TRANSPARENT = (0, 0, 0, 0)
OUTLINE = (62, 61, 61, 255)
HAIR_BLACK = (5, 5, 5, 255)
HAIR_GRAY = (78, 78, 78, 255)
WHITE = (254, 254, 254, 255)
SKIN = (254, 207, 151, 255)
SKIN_SHADOW = (224, 162, 91, 255)
EYE = (67, 34, 22, 255)
COAT = (6, 6, 6, 255)
COAT_LIGHT = (48, 48, 48, 255)
SLEEVE = (112, 112, 112, 255)
GUN_DARK = (42, 23, 11, 255)
GUN_WOOD = (122, 58, 8, 255)
HEADBAND_GRAY = (85, 85, 85, 255)

TARGET_LEFT = 387
TARGET_TOP = 156
TARGET_RIGHT = 866
TARGET_BOTTOM = 855
SOURCE_LEFT = 16
SOURCE_TOP = 8
SOURCE_RIGHT = 75
SOURCE_BOTTOM = 77
GRID = 2


def source_bounds(y: int) -> tuple[int, int]:
    if y < 13:
        return 33, 59
    if y < 19:
        return 27, 65
    if y < 25:
        return 21, 71
    if y < 31:
        return 18, 74
    if y < 54:
        return 16, 76
    if y < 60:
        return 19, 72
    if y < 66:
        return 18, 72
    if y < 72:
        return 20, 70
    return 22, 68


def distance(left: tuple[int, int, int], right: tuple[int, int, int]) -> int:
    return sum(abs(a - b) for a, b in zip(left, right))


def is_background(source: PngImage, x: int, y: int) -> bool:
    red, green, blue, _ = source.pixel(x, y)
    edge_a = source.pixel(8, y)[:3]
    edge_b = source.pixel(87, y)[:3]
    background = tuple((a + b) // 2 for a, b in zip(edge_a, edge_b))
    return distance((red, green, blue), background) < 38


def recolor(source: PngImage, x: int, y: int) -> tuple[int, int, int, int]:
    red, green, blue, _ = source.pixel(x, y)
    brightness = (red + green + blue) // 3
    saturation = max(red, green, blue) - min(red, green, blue)

    if y < 28:  # hair and its outer edge
        if y < 20 and brightness > 105:
            return HAIR_GRAY
        return HAIR_BLACK if brightness < 150 else OUTLINE

    if y < 35:  # white headband and its three central cells
        if brightness > 140 and (saturation < 85 or red > 185):
            return WHITE
        if red > green * 1.35:
            return HEADBAND_GRAY
        return HAIR_BLACK

    if y < 54:  # face, eyes, and face outline
        if brightness > 215 and saturation < 45:
            return WHITE
        if brightness < 85:
            return EYE if 23 <= x <= 68 else OUTLINE
        if red > 145 and green > 90:
            return SKIN if brightness > 145 else SKIN_SHADOW
        return OUTLINE

    # Gun/arms/torso: preserve the actual overlap; replace only palette roles.
    if y >= 73 and brightness > 170 and saturation < 70:
        return WHITE
    if red > 160 and green > 105 and blue > 70:
        return SKIN
    if x <= 44 and red > green * 1.35 and blue < 80:
        return GUN_WOOD if brightness > 55 else GUN_DARK
    if x < 29 or x > 58:
        return SLEEVE if brightness > 75 else OUTLINE
    if brightness < 70:
        return GUN_DARK if x <= 45 else COAT
    return COAT_LIGHT if brightness > 135 else COAT


def retrace(base: PngImage, source: PngImage) -> PngImage:
    rgba = bytearray(base.rgba)
    width = base.width

    # Replace only the upper body. Fixed lower body begins at y=856.
    fill_rect(rgba, width, 0, 0, width - 1, TARGET_BOTTOM, TRANSPARENT)

    columns = (SOURCE_RIGHT - SOURCE_LEFT + 1 + GRID - 1) // GRID
    rows = (SOURCE_BOTTOM - SOURCE_TOP + 1 + GRID - 1) // GRID
    target_width = TARGET_RIGHT - TARGET_LEFT + 1
    target_height = TARGET_BOTTOM - TARGET_TOP + 1

    for row in range(rows):
        source_y = min(SOURCE_BOTTOM, SOURCE_TOP + row * GRID + GRID // 2)
        bound_left, bound_right = source_bounds(source_y)
        top = TARGET_TOP + row * target_height // rows
        bottom = TARGET_TOP + (row + 1) * target_height // rows - 1
        for column in range(columns):
            source_x = min(SOURCE_RIGHT, SOURCE_LEFT + column * GRID + GRID // 2)
            if source_x < bound_left or source_x > bound_right or is_background(source, source_x, source_y):
                continue
            left = TARGET_LEFT + column * target_width // columns
            right = TARGET_LEFT + (column + 1) * target_width // columns - 1
            fill_rect(rgba, width, left, top, right, bottom, recolor(source, source_x, source_y))

    # Preserve the already-fixed color-variant reading of the actual headband:
    # three distinct 56x56 cells, without changing their source-derived area.
    fill_rect(rgba, width, 435, 396, 866, 455, WHITE)
    fill_rect(rgba, width, 551, 400, 606, 455, HAIR_BLACK)
    fill_rect(rgba, width, 607, 400, 662, 455, HEADBAND_GRAY)
    fill_rect(rgba, width, 663, 400, 718, 455, HAIR_BLACK)

    return PngImage(base.width, base.height, bytes(rgba), True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", type=Path, required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    base = read_png(args.base)
    source = read_png(args.source)
    write_png(args.output, retrace(base, source))
    print(f"Actual-image geometry: {args.source}")
    print(f"Fixed lower-body base: {args.base}")
    print(f"Retraced candidate: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
