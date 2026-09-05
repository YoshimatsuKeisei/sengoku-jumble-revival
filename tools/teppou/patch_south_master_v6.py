#!/usr/bin/env python3
"""Make all three headband cells square and move gun/right arm one gun-width left."""

from __future__ import annotations

import argparse
from pathlib import Path

from patch_south_legs import write_png
from patch_south_master_v2 import fill_rect, set_pixel
from validate_sprite import PngImage, read_png


CELL_SIZE = 56
SHIFT_LEFT = 62
WHITE = (254, 254, 254, 255)
BLACK = (1, 1, 1, 255)
GRAY = (85, 85, 85, 255)
TRANSPARENT = (0, 0, 0, 0)
DARK_UNIFORM = (3, 3, 3, 255)

HEADBAND_TOP = 259
HEADBAND_BOTTOM = 314
OLD_HEADBAND_LEFT = 581
OLD_HEADBAND_RIGHT = 673
HEADBAND_CELLS_LEFT = 544

ARM_LEFT = 382
ARM_RIGHT = 565
ARM_TOP = 586
ARM_BOTTOM = 737

GUN_LEFT = 443
GUN_RIGHT = 628
GUN_TOP = 586
GUN_BOTTOM = 771
GUN_COLORS = {
    (72, 34, 5, 255),
    (122, 58, 8, 255),
    (156, 79, 10, 255),
}


def patch_headband(rgba: bytearray, width: int) -> None:
    """Draw three adjacent 56x56 squares: black, gray, black."""
    fill_rect(
        rgba,
        width,
        OLD_HEADBAND_LEFT,
        HEADBAND_TOP,
        OLD_HEADBAND_RIGHT,
        HEADBAND_BOTTOM,
        WHITE,
    )
    for index, color in enumerate((BLACK, GRAY, BLACK)):
        left = HEADBAND_CELLS_LEFT + index * CELL_SIZE
        fill_rect(
            rgba,
            width,
            left,
            HEADBAND_TOP,
            left + CELL_SIZE - 1,
            HEADBAND_BOTTOM,
            color,
        )


def patch_arm_and_gun(source: PngImage, rgba: bytearray) -> None:
    """Move gun and the screen-left right arm/hand left by a full 62px."""
    width = source.width

    fill_rect(rgba, width, ARM_LEFT, ARM_TOP, ARM_RIGHT, ARM_BOTTOM, TRANSPARENT)
    fill_rect(rgba, width, 443, ARM_TOP, ARM_RIGHT, ARM_BOTTOM, DARK_UNIFORM)

    for y in range(ARM_TOP, ARM_BOTTOM + 1):
        for x in range(ARM_LEFT, ARM_RIGHT + 1):
            color = source.pixel(x, y)
            if color in GUN_COLORS:
                continue
            set_pixel(rgba, width, x - SHIFT_LEFT, y, color)

    for y in range(GUN_TOP, GUN_BOTTOM + 1):
        for x in range(GUN_LEFT, GUN_RIGHT + 1):
            if source.pixel(x, y) in GUN_COLORS:
                set_pixel(rgba, width, x, y, DARK_UNIFORM)

    for y in range(GUN_TOP, GUN_BOTTOM + 1):
        for x in range(GUN_LEFT, GUN_RIGHT + 1):
            color = source.pixel(x, y)
            if color in GUN_COLORS:
                set_pixel(rgba, width, x - SHIFT_LEFT, y, color)


def patch(source: PngImage) -> PngImage:
    if (source.width, source.height) != (1254, 1254):
        raise ValueError(f"Unexpected South master size: {source.width}x{source.height}")
    rgba = bytearray(source.rgba)
    patch_headband(rgba, source.width)
    patch_arm_and_gun(source, rgba)
    return PngImage(source.width, source.height, bytes(rgba), True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    write_png(args.output, patch(read_png(args.input)))
    print(f"Source preserved: {args.input}")
    print(f"Patched candidate: {args.output}")
    print("Headband: three separate 56x56 cells")
    print("Gun and screen-left right arm/hand: shifted left 62px")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
