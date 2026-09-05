#!/usr/bin/env python3
"""Create a transparent South master and a legs-only patched candidate.

The source candidate is never overwritten. Pixels above CUT_Y are copied from
the transparent baseline without modification.
"""

from __future__ import annotations

import argparse
import binascii
import struct
import zlib
from collections import deque
from pathlib import Path

from validate_sprite import PngImage, read_png


CUT_Y = 970
CENTER_X = 627


def _chunk(kind: bytes, payload: bytes) -> bytes:
    checksum = binascii.crc32(kind)
    checksum = binascii.crc32(payload, checksum) & 0xFFFFFFFF
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", checksum)


def write_png(path: Path, image: PngImage) -> None:
    rows = bytearray()
    stride = image.width * 4
    for y in range(image.height):
        rows.append(0)  # PNG filter: None
        start = y * stride
        rows.extend(image.rgba[start:start + stride])
    header = struct.pack(">IIBBBBB", image.width, image.height, 8, 6, 0, 0, 0)
    payload = b"\x89PNG\r\n\x1a\n" + _chunk(b"IHDR", header)
    payload += _chunk(b"IDAT", zlib.compress(bytes(rows), 9)) + _chunk(b"IEND", b"")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)


def transparent_background(image: PngImage) -> tuple[PngImage, int]:
    """Flood-fill only pale neutral canvas pixels connected to an edge."""
    width, height = image.width, image.height
    rgba = bytearray(image.rgba)
    visited = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def is_canvas(x: int, y: int) -> bool:
        red, green, blue, _ = image.pixel(x, y)
        return min(red, green, blue) >= 215 and max(red, green, blue) - min(red, green, blue) <= 18

    def enqueue(x: int, y: int) -> None:
        index = y * width + x
        if not visited[index] and is_canvas(x, y):
            visited[index] = 1
            queue.append((x, y))

    for x in range(width):
        enqueue(x, 0)
        enqueue(x, height - 1)
    for y in range(height):
        enqueue(0, y)
        enqueue(width - 1, y)

    removed = 0
    while queue:
        x, y = queue.popleft()
        rgba[(y * width + x) * 4 + 3] = 0
        removed += 1
        if x:
            enqueue(x - 1, y)
        if x + 1 < width:
            enqueue(x + 1, y)
        if y:
            enqueue(x, y - 1)
        if y + 1 < height:
            enqueue(x, y + 1)
    return PngImage(width, height, bytes(rgba), True), removed


def patch_legs(base: PngImage) -> PngImage:
    """Move only pixels below CUT_Y; retain a narrow central gap and foot tilt."""
    width, height = base.width, base.height
    source = base.rgba
    output = bytearray(source)

    # Clear the editable region, then remap only visible sprite pixels into it.
    for y in range(CUT_Y, height):
        start = y * width * 4
        output[start:start + width * 4] = b"\x00" * (width * 4)

    for y in range(CUT_Y, height):
        if y < 1020:
            horizontal_shift = 31
        else:
            horizontal_shift = 62
        for x in range(width):
            offset = (y * width + x) * 4
            pixel = source[offset:offset + 4]
            if pixel[3] == 0:
                continue
            dx = horizontal_shift if x < CENTER_X else -horizontal_shift
            dy = 0
            # Screen-left outer toe rises; its inner heel remains on baseline.
            if x < CENTER_X and x <= 443 and y >= 1050:
                dy = -31
            # Screen-right inner heel rises; its outer toe remains on baseline.
            if x >= CENTER_X and x <= 776 and y >= 1050:
                dy = -31
            target_x, target_y = x + dx, y + dy
            if 0 <= target_x < width and CUT_Y <= target_y < height:
                target = (target_y * width + target_x) * 4
                output[target:target + 4] = pixel
    return PngImage(width, height, bytes(output), True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--transparent-base", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    source = read_png(args.input)
    transparent, removed = transparent_background(source)
    patched = patch_legs(transparent)
    write_png(args.transparent_base, transparent)
    write_png(args.output, patched)
    print(f"Transparent canvas pixels removed: {removed}")
    print(f"Upper body copied unchanged through y={CUT_Y - 1}")
    print(f"Transparent baseline: {args.transparent_base}")
    print(f"Patched candidate: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
