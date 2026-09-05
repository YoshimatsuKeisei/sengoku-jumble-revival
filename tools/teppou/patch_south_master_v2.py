#!/usr/bin/env python3
"""Apply the approved, deterministic South master pixel corrections.

The source candidate is never overwritten. Only the headband-center patch and
the lower body below the white waist belt are editable.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from patch_south_legs import write_png
from validate_sprite import PngImage, read_png


# Coordinates are for the existing 1254 x 1254 South master canvas.
BELT_BOTTOM = 855
BELT_LEFT = 443
BELT_RIGHT = 807
PANTS_SPLIT_Y = 980
LEFT_LEG_RIGHT = 611
RIGHT_LEG_LEFT = 643

HEADBAND_TOP = 284
HEADBAND_BOTTOM = 314
HEADBAND_LEFT = 581
BLOCK = 31

TRANSPARENT = (0, 0, 0, 0)
OUTLINE = (62, 61, 61, 255)
SHOE_BLACK = (3, 3, 3, 255)
SHOE_DARK = (48, 47, 47, 255)
SOCK = (250, 244, 234, 255)
SOCK_HIGHLIGHT = (255, 255, 255, 255)
HEADBAND_BLACK = (1, 1, 1, 255)
HEADBAND_GRAY = (85, 85, 85, 255)


def offset(width: int, x: int, y: int) -> int:
    return (y * width + x) * 4


def set_pixel(rgba: bytearray, width: int, x: int, y: int, color: tuple[int, int, int, int]) -> None:
    start = offset(width, x, y)
    rgba[start:start + 4] = bytes(color)


def fill_rect(
    rgba: bytearray,
    width: int,
    left: int,
    top: int,
    right: int,
    bottom: int,
    color: tuple[int, int, int, int],
) -> None:
    pixel = bytes(color)
    row = pixel * (right - left + 1)
    for y in range(top, bottom + 1):
        start = offset(width, left, y)
        rgba[start:start + len(row)] = row


def patch_headband(rgba: bytearray, width: int) -> None:
    """Add the black-gray-black three-square center detail."""
    fill_rect(
        rgba,
        width,
        HEADBAND_LEFT,
        HEADBAND_TOP,
        HEADBAND_LEFT + BLOCK - 1,
        HEADBAND_BOTTOM,
        HEADBAND_BLACK,
    )
    fill_rect(
        rgba,
        width,
        HEADBAND_LEFT + BLOCK,
        HEADBAND_TOP,
        HEADBAND_LEFT + BLOCK * 2 - 1,
        HEADBAND_BOTTOM,
        HEADBAND_GRAY,
    )
    fill_rect(
        rgba,
        width,
        HEADBAND_LEFT + BLOCK * 2,
        HEADBAND_TOP,
        HEADBAND_LEFT + BLOCK * 3 - 1,
        HEADBAND_BOTTOM,
        HEADBAND_BLACK,
    )


def patch_lower_body(source: PngImage, rgba: bytearray) -> None:
    """Make vertical, belt-bounded legs and rebuild both shoes cleanly."""
    width, height = source.width, source.height

    # The belt endpoints are hard outer limits for every lower-body pixel.
    for y in range(BELT_BOTTOM + 1, height):
        fill_rect(rgba, width, 0, y, BELT_LEFT - 1, y, TRANSPARENT)
        fill_rect(rgba, width, BELT_RIGHT + 1, y, width - 1, y, TRANSPARENT)

    # Clear the damaged leg/foot area. The intact checker-patterned trousers
    # above this line remain sourced pixel-for-pixel from the current candidate.
    fill_rect(
        rgba,
        width,
        BELT_LEFT,
        PANTS_SPLIT_Y,
        BELT_RIGHT,
        height - 1,
        TRANSPARENT,
    )

    # Continue the trousers straight down for one block, using the last intact
    # 31 rows as texture so the checker/gray palette does not change.
    for target_y in range(PANTS_SPLIT_Y, PANTS_SPLIT_Y + BLOCK):
        source_y = target_y - BLOCK
        for left, right in ((BELT_LEFT, LEFT_LEG_RIGHT), (RIGHT_LEG_LEFT, BELT_RIGHT)):
            for x in range(left, right + 1):
                color = source.pixel(x, source_y)
                if color[3] == 0:
                    color = source.pixel(x, PANTS_SPLIT_Y - 1)
                set_pixel(rgba, width, x, target_y, color)

    # Clean sock/ankle bands. Both remain within the vertical belt edges.
    fill_rect(rgba, width, BELT_LEFT, 1011, LEFT_LEG_RIGHT, 1041, OUTLINE)
    fill_rect(rgba, width, 474, 1011, 580, 1041, SOCK)
    fill_rect(rgba, width, 474, 1011, 504, 1041, SOCK_HIGHLIGHT)

    fill_rect(rgba, width, RIGHT_LEG_LEFT, 1011, BELT_RIGHT, 1041, OUTLINE)
    fill_rect(rgba, width, 674, 1011, 776, 1041, SOCK)
    fill_rect(rgba, width, 746, 1011, 776, 1041, SOCK_HIGHLIGHT)

    # Shoes are contiguous silhouettes rather than scattered source fragments.
    # Screen-left: heel reaches the baseline while the outer toe is raised.
    fill_rect(rgba, width, BELT_LEFT, 1042, LEFT_LEG_RIGHT, 1072, SHOE_BLACK)
    fill_rect(rgba, width, 474, 1073, LEFT_LEG_RIGHT, 1103, SHOE_BLACK)
    fill_rect(rgba, width, 505, 1104, LEFT_LEG_RIGHT, 1106, SHOE_DARK)

    # Screen-right: one block shorter for depth; its inner toe contacts while
    # the outer heel is lifted.
    fill_rect(rgba, width, RIGHT_LEG_LEFT, 1042, BELT_RIGHT, 1041 + BLOCK, SHOE_BLACK)
    fill_rect(rgba, width, RIGHT_LEG_LEFT, 1073, 715, 1075, SHOE_DARK)


def patch(source: PngImage) -> PngImage:
    if (source.width, source.height) != (1254, 1254):
        raise ValueError(f"Unexpected South master size: {source.width}x{source.height}")
    rgba = bytearray(source.rgba)
    patch_headband(rgba, source.width)
    patch_lower_body(source, rgba)
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
    print(f"Lower-body outer limits: x={BELT_LEFT}..{BELT_RIGHT}")
    print("Headband detail: black-gray-black")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
