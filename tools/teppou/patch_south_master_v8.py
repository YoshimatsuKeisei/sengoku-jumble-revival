#!/usr/bin/env python3
"""Move only the South gun's central shaft to the screen-left eye axis."""

from __future__ import annotations

import argparse
from pathlib import Path

from patch_south_legs import write_png
from patch_south_master_v2 import fill_rect, set_pixel
from validate_sprite import PngImage, read_png


SHIFT_LEFT = 121
LEFT_EYE_CENTER_X = 504
FACE_SKIN = (254, 207, 151, 255)
DARK_UNIFORM = (3, 3, 3, 255)


def is_hand_skin(color: tuple[int, int, int, int]) -> bool:
    red, green, blue, alpha = color
    return alpha > 0 and red >= 170 and green >= 110 and blue >= 60 and red > blue * 1.25


def patch_gun(source: PngImage, rgba: bytearray) -> None:
    width = source.width

    # Remove the old centered muzzle/shaft and restore the face and dark coat.
    fill_rect(rgba, width, 596, 438, 655, 525, FACE_SKIN)
    fill_rect(rgba, width, 565, 526, 685, 678, DARK_UNIFORM)
    fill_rect(rgba, width, 596, 679, 655, 794, DARK_UNIFORM)

    # Move only the 60px-wide gun shaft. Its new x=475..534 center is 504.5,
    # matching the screen-left eye center instead of the body center.
    for y in range(438, 795):
        for x in range(596, 656):
            set_pixel(rgba, width, x - SHIFT_LEFT, y, source.pixel(x, y))

    # Keep the already-left-shifted right hand visibly gripping the gun.
    for y in range(586, 738):
        for x in range(320, 566):
            color = source.pixel(x, y)
            if is_hand_skin(color):
                set_pixel(rgba, width, x, y, color)


def patch(source: PngImage) -> PngImage:
    if (source.width, source.height) != (1254, 1254):
        raise ValueError(f"Unexpected South master size: {source.width}x{source.height}")
    rgba = bytearray(source.rgba)
    patch_gun(source, rgba)
    return PngImage(source.width, source.height, bytes(rgba), True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    write_png(args.output, patch(read_png(args.input)))
    print(f"Source preserved: {args.input}")
    print(f"Patched candidate: {args.output}")
    print(f"Gun shaft aligned to screen-left eye x={LEFT_EYE_CENTER_X}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
