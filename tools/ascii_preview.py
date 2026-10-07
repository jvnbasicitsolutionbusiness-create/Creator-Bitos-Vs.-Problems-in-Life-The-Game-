#!/usr/bin/env python3
"""Print a PNG as an ASCII luminance map + colour/ink statistics.

Offline visual QA helper (I cannot see images, so this turns them into text).

    python3 tools/ascii_preview.py tools/out/menu.png [cols] [rows]
"""
import sys
from collections import Counter

from PIL import Image

RAMP = " .:-=+*#%@"


def preview(path, cols=100, rows=44, crop=None):
    img = Image.open(path).convert("RGB")
    if crop:
        img = img.crop((crop[0], crop[1], crop[0] + crop[2], crop[1] + crop[3]))
    W, H = img.size
    small = img.resize((cols, rows), Image.BOX)
    px = small.load()

    lum_rows = []
    for y in range(rows):
        line = []
        for x in range(cols):
            r, g, b = px[x, y]
            lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
            line.append(RAMP[min(len(RAMP) - 1, int(lum ** 0.62 * len(RAMP)))])
        lum_rows.append("".join(line))

    print(f"=== {path}  ({W}x{H}) ===")
    for row in lum_rows:
        print(row)

    # Ink coverage per third of the screen — catches "everything is blank" and
    # "everything is crammed into one corner" bugs.
    full = img.resize((160, 90), Image.BOX).load()
    grid = [[0] * 3 for _ in range(3)]
    for gy in range(3):
        for gx in range(3):
            ink = 0
            for y in range(gy * 30, gy * 30 + 30):
                for x in range(gx * 53, gx * 53 + 53):
                    r, g, b = full[x, y]
                    if r + g + b > 90:
                        ink += 1
            grid[gy][gx] = round(ink / (30 * 53) * 100)
    print("ink coverage % (rows top->bottom):")
    for row in grid:
        print("   ", "  ".join(f"{v:3d}" for v in row))

    counts = Counter(img.resize((320, 180)).getdata())
    top = counts.most_common(6)
    total = 320 * 180
    print("dominant colours:")
    for color, n in top:
        print(f"    rgb{color}  {n / total * 100:5.1f}%")
    non_bg = sum(n for c, n in counts.items() if sum(c) > 90) / total * 100
    print(f"non-dark pixels: {non_bg:.1f}%")


if __name__ == "__main__":
    path = sys.argv[1]
    cols = int(sys.argv[2]) if len(sys.argv) > 2 else 100
    rows = int(sys.argv[3]) if len(sys.argv) > 3 else 44
    crop = [int(v) for v in sys.argv[4:8]] if len(sys.argv) > 7 else None
    preview(path, cols, rows, crop)
