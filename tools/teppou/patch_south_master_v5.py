#!/usr/bin/env python3
"""Square the South headband center and shift gun/right arm left by one block."""

from __future__ import annotations

import argparse
from pathlib import Path

from patch_south_legs import write_png
from patch_south_master_v2 import fill_rect, set_pixel
from validate_sprite import PngImage, read_png


BLOCK = 31
SHIFT_LEFT = 31
WHITE = (254, 254, 254, 255)
BLACK = (1, 1, 1, 255)
GRAY = (85, 85, 85, 255)
TRANSPARENT = (0, 0, 0, 0)
DARK_UNIFORM = (3, 3, 3, 255)

HEADBAND_TOP = 259
HEADBAND_BOTTOM = 314
OLD_HEADBAND_LEFT = 581
OLD_HEADBAND_RIGHT = 673
SQUARE_LEFT = 599
SQUARE_RIGHT = 654

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
    """Make the entire three-color center area 56x56 pixels."""
    fill_rect(
        rgba,
        width,
        OLD_HEADBAND_LEFT,
        HEADBAND_TOP,
        OLD_HEADBAND_RIGHT,
        HEADBAND_BOTTOM,
        WHITE,
    )

    # 19 + 18 + 19 = 56, matching the 56-pixel band height exactly.
    fill_rect(rgba, width, SQUARE_LEFT, HEADBAND_TOP, 617, HEADBAND_BOTTOM, BLACK)
    fill_rect(rgba, width, 618, HEADBAND_TOP, 635, HEADBAND_BOTTOM, GRAY)
    fill_rect(rgba, width, 636, HEADBAND_TOP, SQUARE_RIGHT, HEADBAND_BOTTOM, BLACK)


def patch_arm_and_gun(source: PngImage, rgba: bytearray) -> None:
    """Move the screen-left arm and its gun left by one 31-pixel block."""
    width = source.width

    # Clear the old arm silhouette, restoring transparent exterior and dark
    # torso behind the vacated inner edge.
    fill_rect(rgba, width, ARM_LEFT, ARM_TOP, ARM_RIGHT, ARM_BOTTOM, TRANSPARENT)
    fill_rect(rgba, width, 443, ARM_TOP, ARM_RIGHT, ARM_BOTTOM, DARK_UNIFORM)

    # Copy the right arm/hand left, excluding gun pixels handled separately.
    for y in range(ARM_TOP, ARM_BOTTOM + 1):
        for x in range(ARM_LEFT, ARM_RIGHT + 1):
            color = source.pixel(x, y)
            if color in GUN_COLORS:
                continue
            set_pixel(rgba, width, x - SHIFT_LEFT, y, color)

    # Remove the complete old gun, including the part beyond the arm crop.
    for y in range(GUN_TOP, GUN_BOTTOM + 1):
        for x in range(GUN_LEFT, GUN_RIGHT + 1):
            if source.pixel(x, y) in GUN_COLORS:
                set_pixel(rgba, width, x, y, DARK_UNIFORM)

    # Reapply every gun pixel exactly one block to the left.
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
    print("Headband center: 56x56 black-gray-black square")
    print("Gun and screen-left right arm/hand: shifted left 31px")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
