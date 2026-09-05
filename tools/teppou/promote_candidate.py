#!/usr/bin/env python3
"""Validate and promote one teppou candidate into accepted."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from validate_sprite import LEVEL, print_result, validate_paths


DIRECTIONS = ("south", "southeast", "east", "northeast", "north", "northwest", "west", "southwest")
FRAMES = ("master", "walk_01", "walk_02", "kneel_left_01")
PROJECT_ROOT = Path(__file__).resolve().parents[2]
SPRITE_ROOT = PROJECT_ROOT / "assets" / "characters" / "teppou"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--direction", choices=DIRECTIONS, required=True)
    parser.add_argument("--frame", choices=FRAMES, required=True)
    parser.add_argument("--mode", choices=("full", "lower-body-only"), default="full")
    parser.add_argument("--reference", type=Path, help="comparison PNG when the accepted target does not yet exist")
    parser.add_argument("--allow-warn", action="store_true", help="promote after an inspected WARN result")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    filename = f"{args.frame}.png"
    candidate = SPRITE_ROOT / "candidate" / args.direction / filename
    target = SPRITE_ROOT / "accepted" / args.direction / filename

    reference = args.reference
    if reference is not None and not reference.is_absolute():
        reference = PROJECT_ROOT / reference
    if reference is None:
        reference = target if target.is_file() else SPRITE_ROOT / "accepted" / args.direction / "master.png"
    if not reference.is_file():
        print("RESULT: FAIL")
        print("- FAIL: no accepted comparison exists; pass --reference <accepted PNG>")
        return LEVEL["FAIL"]

    result = validate_paths(reference, candidate, args.mode)
    print_result(result)
    if result.level == "FAIL":
        print("Promotion cancelled: validation failed.")
        return LEVEL["FAIL"]
    if result.level == "WARN" and not args.allow_warn:
        print("Promotion cancelled: inspect the warnings, then rerun with --allow-warn if intentional.")
        return LEVEL["WARN"]

    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(candidate, target)
    print(f"Promoted: {candidate.relative_to(PROJECT_ROOT)} -> {target.relative_to(PROJECT_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
