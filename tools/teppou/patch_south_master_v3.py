#!/usr/bin/env python3
"""Fix the South master's headband and move the gun to the left shoulder.

The source candidate is preserved. Lower-body pixels are copied unchanged.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from patch_south_legs import write_png
from patch_south_master_v2 import fill_rect, set_pixel
from validate_sprite import PngImage, read_png


WHITE = (254, 254, 254, 255)
BLACK = (1, 1, 1, 255)
GRAY = (85, 85, 85, 255)
DARK_UNIFORM = (3, 3, 3, 255)
GUN_OUTLINE = (72, 34, 5, 255)
GUN_WOOD = (122, 58, 8, 255)
GUN_HIGHLIGHT = (156, 79, 10, 255)

HEADBAND_TOP = 259
HEADBAND_BOTTOM = 314
HEADBAND_RIGHT_FIX_LEFT = 747
HEADBAND_RIGHT = 838
HEADBAND_CENTER_LEFT = 581
BLOCK = 31


def patch_headband(rgba: bytearray, width: int) -> None:
    """Restore the right end, then place three squares against the top edge."""
    fill_rect(
        rgba,
        width,
        HEADBAND_RIGHT_FIX_LEFT,
        HEADBAND_TOP,
        HEADBAND_RIGHT,
        HEADBAND_BOTTOM,
        WHITE,
    )

    # Erase the previous bottom-aligned blocks before moving them upward.
    fill_rect(
        rgba,
        width,
        HEADBAND_CENTER_LEFT,
        HEADBAND_TOP,
        HEADBAND_CENTER_LEFT + BLOCK * 3 - 1,
        HEADBAND_BOTTOM,
        WHITE,
    )
    for index, color in enumerate((BLACK, GRAY, BLACK)):
        left = HEADBAND_CENTER_LEFT + index * BLOCK
        fill_rect(
            rgba,
            width,
            left,
            HEADBAND_TOP,
            left + BLOCK - 1,
            HEADBAND_TOP + BLOCK - 1,
            color,
        )


def is_centered_gun_wood(color: tuple[int, int, int, int]) -> bool:
    red, green, blue, alpha = color
    return alpha > 0 and 65 <= red <= 190 and 20 <= green <= 110 and blue <= 45 and red > green * 1.45


def patch_gun(source: PngImage, rgba: bytearray) -> None:
    """Remove the centered wooden stock and rebuild it on the left shoulder."""
    width = source.width

    # Only remove pixels positively identified as the centered brown stock.
    for y in range(586, 795):
        for x in range(565, 687):
            if is_centered_gun_wood(source.pixel(x, y)):
                set_pixel(rgba, width, x, y, DARK_UNIFORM)

    # Match the real front-view sprite: the stock starts on the screen-left
    # shoulder and descends diagonally toward the center of the torso.
    for index in range(5):
        left = 443 + index * BLOCK
        top = 586 + index * BLOCK
        fill_rect(rgba, width, left, top, left + BLOCK * 2 - 1, top + BLOCK - 1, GUN_OUTLINE)
        fill_rect(rgba, width, left + 9, top, left + BLOCK + 7, top + BLOCK - 1, GUN_WOOD)
        fill_rect(rgba, width, left + 9, top, left + 18, top + BLOCK - 1, GUN_HIGHLIGHT)

    # A compact butt at the lower end, still left of the original center hold.
    fill_rect(rgba, width, 567, 741, 628, 771, GUN_OUTLINE)
    fill_rect(rgba, width, 576, 741, 614, 771, GUN_WOOD)


def patch(source: PngImage) -> PngImage:
    if (source.width, source.height) != (1254, 1254):
        raise ValueError(f"Unexpected South master size: {source.width}x{source.height}")
    rgba = bytearray(source.rgba)
    patch_headband(rgba, source.width)
    patch_gun(source, rgba)
    return PngImage(source.width, source.height, bytes(rgba), True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    source = read_png(args.input)
    result = patch(source)
    write_png(args.output, result)
    print(f"Source preserved: {args.input}")
    print(f"Patched candidate: {args.output}")
    print("Headband: right end restored; black-gray-black squares top-aligned")
    print("Gun: centered wood removed; stock placed on screen-left shoulder")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
