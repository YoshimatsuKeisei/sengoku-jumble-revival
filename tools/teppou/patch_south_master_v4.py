#!/usr/bin/env python3
"""Extend the South master's center headband detail through the full band."""

from __future__ import annotations

import argparse
from pathlib import Path

from patch_south_legs import write_png
from patch_south_master_v2 import fill_rect
from validate_sprite import PngImage, read_png


HEADBAND_TOP = 259
HEADBAND_BOTTOM = 314
HEADBAND_CENTER_LEFT = 581
BLOCK = 31
BLACK = (1, 1, 1, 255)
GRAY = (85, 85, 85, 255)


def patch(source: PngImage) -> PngImage:
    if (source.width, source.height) != (1254, 1254):
        raise ValueError(f"Unexpected South master size: {source.width}x{source.height}")
    rgba = bytearray(source.rgba)
    for index, color in enumerate((BLACK, GRAY, BLACK)):
        left = HEADBAND_CENTER_LEFT + index * BLOCK
        fill_rect(
            rgba,
            source.width,
            left,
            HEADBAND_TOP,
            left + BLOCK - 1,
            HEADBAND_BOTTOM,
            color,
        )
    return PngImage(source.width, source.height, bytes(rgba), True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    write_png(args.output, patch(read_png(args.input)))
    print(f"Source preserved: {args.input}")
    print(f"Patched candidate: {args.output}")
    print("Headband center: black-gray-black filled from top edge through bottom edge")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
