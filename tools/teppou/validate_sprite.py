#!/usr/bin/env python3
"""Compare a teppou candidate PNG with an accepted reference without editing it."""

from __future__ import annotations

import argparse
import struct
import zlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

LEVEL = {"PASS": 0, "WARN": 1, "FAIL": 2}


@dataclass
class ValidationResult:
    level: str = "PASS"
    messages: list[str] = field(default_factory=list)

    def add(self, level: str, message: str) -> None:
        if LEVEL[level] > LEVEL[self.level]:
            self.level = level
        self.messages.append(f"{level}: {message}")


@dataclass(frozen=True)
class PngImage:
    width: int
    height: int
    rgba: bytes
    has_alpha_channel: bool

    def pixel(self, x: int, y: int) -> tuple[int, int, int, int]:
        offset = (y * self.width + x) * 4
        return tuple(self.rgba[offset:offset + 4])  # type: ignore[return-value]


def _paeth(left: int, above: int, upper_left: int) -> int:
    estimate = left + above - upper_left
    distances = (abs(estimate - left), abs(estimate - above), abs(estimate - upper_left))
    return (left, above, upper_left)[distances.index(min(distances))]


def read_png(path: Path) -> PngImage:
    data = path.read_bytes()
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("not a PNG file")
    position = 8
    header = None
    palette = None
    transparency = None
    compressed = bytearray()
    while position + 12 <= len(data):
        length = struct.unpack(">I", data[position:position + 4])[0]
        chunk_type = data[position + 4:position + 8]
        payload = data[position + 8:position + 8 + length]
        position += 12 + length
        if chunk_type == b"IHDR":
            header = struct.unpack(">IIBBBBB", payload)
        elif chunk_type == b"PLTE":
            palette = [tuple(payload[index:index + 3]) for index in range(0, len(payload), 3)]
        elif chunk_type == b"tRNS":
            transparency = payload
        elif chunk_type == b"IDAT":
            compressed.extend(payload)
        elif chunk_type == b"IEND":
            break
    if header is None:
        raise ValueError("missing IHDR")
    width, height, bit_depth, color_type, compression, filtering, interlace = header
    if bit_depth != 8 or compression != 0 or filtering != 0 or interlace != 0:
        raise ValueError("only non-interlaced 8-bit PNG files are supported")
    channels_by_type = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}
    if color_type not in channels_by_type:
        raise ValueError(f"unsupported PNG color type: {color_type}")

    channels = channels_by_type[color_type]
    stride = width * channels
    raw = zlib.decompress(bytes(compressed))
    if len(raw) != height * (stride + 1):
        raise ValueError("unexpected decompressed PNG length")
    rows: list[bytearray] = []
    cursor = 0
    previous = bytearray(stride)
    for _ in range(height):
        filter_type = raw[cursor]
        cursor += 1
        source = raw[cursor:cursor + stride]
        cursor += stride
        row = bytearray(stride)
        for index, value in enumerate(source):
            left = row[index - channels] if index >= channels else 0
            above = previous[index]
            upper_left = previous[index - channels] if index >= channels else 0
            if filter_type == 0:
                predictor = 0
            elif filter_type == 1:
                predictor = left
            elif filter_type == 2:
                predictor = above
            elif filter_type == 3:
                predictor = (left + above) // 2
            elif filter_type == 4:
                predictor = _paeth(left, above, upper_left)
            else:
                raise ValueError(f"unsupported PNG filter: {filter_type}")
            row[index] = (value + predictor) & 255
        rows.append(row)
        previous = row

    rgba = bytearray(width * height * 4)
    output = 0
    transparent_gray = struct.unpack(">H", transparency)[0] & 255 if color_type == 0 and transparency and len(transparency) >= 2 else None
    transparent_rgb = tuple(value & 255 for value in struct.unpack(">HHH", transparency[:6])) if color_type == 2 and transparency and len(transparency) >= 6 else None
    for row in rows:
        for x in range(width):
            start = x * channels
            values = row[start:start + channels]
            if color_type == 0:
                red = green = blue = values[0]
                alpha = 0 if transparent_gray == values[0] else 255
            elif color_type == 2:
                red, green, blue = values
                alpha = 0 if transparent_rgb == (red, green, blue) else 255
            elif color_type == 3:
                if palette is None or values[0] >= len(palette):
                    raise ValueError("invalid indexed PNG palette")
                red, green, blue = palette[values[0]]
                alpha = transparency[values[0]] if transparency and values[0] < len(transparency) else 255
            elif color_type == 4:
                red = green = blue = values[0]
                alpha = values[1]
            else:
                red, green, blue, alpha = values
            rgba[output:output + 4] = bytes((red, green, blue, alpha))
            output += 4
    return PngImage(width, height, bytes(rgba), color_type in (4, 6) or transparency is not None)


def _content_bbox(image: PngImage):
    left, top, right, bottom = image.width, image.height, -1, -1
    for y in range(image.height):
        for x in range(image.width):
            if image.rgba[(y * image.width + x) * 4 + 3] > 0:
                left, top = min(left, x), min(top, y)
                right, bottom = max(right, x), max(bottom, y)
    return (left, top, right + 1, bottom + 1) if right >= 0 else None


def _has_transparency(image: PngImage) -> bool:
    return image.has_alpha_channel and min(image.rgba[3::4]) < 255


def _checkerboard_suspected(image: PngImage) -> bool:
    """Conservative heuristic for pale neutral checker patterns near canvas edges."""
    width, height = image.width, image.height
    band = max(2, round(min(width, height) * 0.08))
    step = max(1, min(width, height) // 160)
    colors: dict[tuple[int, int, int], int] = {}
    examined = pale_opaque = 0
    for y in range(0, height, step):
        for x in range(0, width, step):
            if band <= x < width - band and band <= y < height - band:
                continue
            examined += 1
            red, green, blue, alpha = image.pixel(x, y)
            if alpha >= 250 and max(red, green, blue) - min(red, green, blue) <= 12 and min(red, green, blue) >= 190:
                pale_opaque += 1
                color = (red // 16, green // 16, blue // 16)
                colors[color] = colors.get(color, 0) + 1
    if not examined or pale_opaque / examined < 0.30 or len(colors) < 2:
        return False
    dominant = sorted(colors.values(), reverse=True)[:2]
    return dominant[1] >= max(3, round(pale_opaque * 0.08)) and sum(dominant) / pale_opaque >= 0.55


def _bbox_metrics(box):
    left, top, right, bottom = box
    return right - left, bottom - top


def _upper_body_difference(accepted: PngImage, candidate: PngImage, box) -> float:
    left, top, right, bottom = box
    upper_bottom = top + max(1, round((bottom - top) * 0.65))
    changed = 0
    total = max(1, (right - left) * (upper_bottom - top))
    for y in range(top, upper_bottom):
        for x in range(left, right):
            if max(abs(a - b) for a, b in zip(accepted.pixel(x, y), candidate.pixel(x, y))) > 8:
                changed += 1
    return changed / total


def validate_paths(accepted_path: Path, candidate_path: Path, mode: str = "full") -> ValidationResult:
    result = ValidationResult()
    if not accepted_path.is_file():
        result.add("FAIL", f"accepted reference not found: {accepted_path}")
        return result
    if not candidate_path.is_file():
        result.add("FAIL", f"candidate not found: {candidate_path}")
        return result
    try:
        accepted = read_png(accepted_path)
        candidate = read_png(candidate_path)
    except (OSError, ValueError, zlib.error) as exc:
        result.add("FAIL", f"PNG could not be read: {exc}")
        return result

    same_canvas = (accepted.width, accepted.height) == (candidate.width, candidate.height)
    if same_canvas:
        result.add("PASS", f"canvas size matches: {candidate.width}x{candidate.height}")
    else:
        result.add("FAIL", f"canvas size differs: accepted={(accepted.width, accepted.height)}, candidate={(candidate.width, candidate.height)}")
    transparent = _has_transparency(candidate)
    result.add("PASS" if transparent else "FAIL", "candidate contains transparent pixels" if transparent else "candidate has no transparent background")
    if _checkerboard_suspected(candidate):
        result.add("WARN", "a pale checkerboard may be baked into the image")

    accepted_box = _content_bbox(accepted)
    candidate_box = _content_bbox(candidate)
    if accepted_box is None or candidate_box is None:
        result.add("FAIL", "accepted or candidate has no visible pixels")
        return result
    accepted_dimensions = _bbox_metrics(accepted_box)
    candidate_dimensions = _bbox_metrics(candidate_box)
    result.add("PASS", f"content bbox accepted={accepted_box}, candidate={candidate_box}")
    width_delta = abs(candidate_dimensions[0] - accepted_dimensions[0]) / max(1, accepted_dimensions[0])
    height_delta = abs(candidate_dimensions[1] - accepted_dimensions[1]) / max(1, accepted_dimensions[1])
    largest_delta = max(width_delta, height_delta)
    if largest_delta > 0.20:
        result.add("FAIL", f"content size differs too much: width={width_delta:.1%}, height={height_delta:.1%}")
    elif largest_delta > 0.08:
        result.add("WARN", f"content size differs noticeably: width={width_delta:.1%}, height={height_delta:.1%}")

    if same_canvas and mode == "lower-body-only":
        union_box = (min(accepted_box[0], candidate_box[0]), min(accepted_box[1], candidate_box[1]), max(accepted_box[2], candidate_box[2]), max(accepted_box[3], candidate_box[3]))
        ratio = _upper_body_difference(accepted, candidate, union_box)
        if ratio > 0.03:
            result.add("FAIL", f"upper-body difference is excessive: {ratio:.2%}")
        elif ratio > 0.005:
            result.add("WARN", f"upper-body difference is noticeable: {ratio:.2%}")
        else:
            result.add("PASS", f"upper-body difference is small: {ratio:.2%}")
    return result


def print_result(result: ValidationResult) -> None:
    print(f"RESULT: {result.level}")
    for message in result.messages:
        print(f"- {message}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--accepted", type=Path, required=True, help="accepted reference PNG")
    parser.add_argument("--candidate", type=Path, required=True, help="candidate PNG")
    parser.add_argument("--mode", choices=("full", "lower-body-only"), default="full")
    return parser


def main(argv: Iterable[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    result = validate_paths(args.accepted, args.candidate, args.mode)
    print_result(result)
    return LEVEL[result.level]


if __name__ == "__main__":
    raise SystemExit(main())
