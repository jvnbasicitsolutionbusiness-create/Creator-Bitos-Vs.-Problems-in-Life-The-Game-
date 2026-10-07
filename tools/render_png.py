#!/usr/bin/env python3
"""Rasterise recorded canvas ops (tools/recorder.js) into a PNG.

Offline visual QA only — not shipped with the game.

    python3 tools/render_png.py ops.json out.png
"""
import json
import math
import sys

from PIL import Image, ImageDraw, ImageFont, ImageChops

W, H = 1280, 720
FONT_DIR = "/usr/share/fonts/truetype/dejavu"
_font_cache = {}


def font(size):
    size = max(6, int(round(size)))
    if size not in _font_cache:
        try:
            _font_cache[size] = ImageFont.truetype(f"{FONT_DIR}/DejaVuSans-Bold.ttf", size)
        except OSError:
            _font_cache[size] = ImageFont.load_default()
    return _font_cache[size]


def rgba(c, alpha):
    return (int(max(0, min(255, c["r"]))),
            int(max(0, min(255, c["g"]))),
            int(max(0, min(255, c["b"]))),
            int(max(0, min(255, (c.get("a", 1) * alpha) * 255))))


def bbox(points, pad=3):
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return [max(0, int(min(xs)) - pad), max(0, int(min(ys)) - pad),
            min(W, int(max(xs)) + pad), min(H, int(max(ys)) + pad)]


def draw_op(layer, op):
    d = ImageDraw.Draw(layer)
    kind = op["type"]
    color = rgba(op["color"], op["alpha"])

    if kind == "text":
        f = font(op["size"])
        x, y = op["x"], op["y"]
        text = op["text"]
        try:
            w = d.textlength(text, font=f)
        except Exception:
            w = len(text) * op["size"] * 0.5
        if op.get("align") == "center":
            x -= w / 2
        elif op.get("align") == "right":
            x -= w
        baseline = op.get("baseline") or "alphabetic"
        if baseline == "middle":
            y -= op["size"] * 0.36
        elif baseline == "top":
            pass
        else:
            y -= op["size"] * 0.8
        if op.get("stroke"):
            d.text((x, y), text, font=f, fill=color, stroke_width=max(1, int(op["stroke"])))
        else:
            d.text((x, y), text, font=f, fill=color)
        return [max(0, int(x) - 4), max(0, int(y) - 4), min(W, int(x + w) + 6), min(H, int(y + op["size"]) + 4)]

    pts = [tuple(p) for p in op["points"]]
    if not pts:
        return None
    box = bbox(pts, pad=int(op.get("width", 2)) + 4)

    if kind == "fill":
        circle = op.get("circle")
        if circle and len(pts) > 4:
            cx, cy = circle["c"]
            r = max(1.0, circle["r"])
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)
        elif len(pts) >= 3:
            d.polygon(pts, fill=color)
        return box

    if kind == "stroke":
        width = max(1, int(round(op.get("width", 1))))
        seq = list(pts)
        if op.get("closed") and len(seq) > 2:
            seq.append(seq[0])
        if len(seq) >= 2:
            d.line(seq, fill=color, width=width, joint="curve")
        elif len(seq) == 1:
            d.ellipse([seq[0][0] - width, seq[0][1] - width, seq[0][0] + width, seq[0][1] + width], fill=color)
        return box
    return None


def render(data, out_path, scale=1.0):
    global W, H
    W = int(data.get("width", 1280))
    H = int(data.get("height", 720))
    canvas = Image.new("RGB", (W, H), (6, 5, 12))
    scratch = Image.new("RGBA", (W, H), (0, 0, 0, 0))

    for op in data["ops"]:
        clip = op.get("clip")
        composite = op.get("composite", "source-over")
        if composite == "destination-in":
            continue

        # Work out the region we may touch.
        region = None
        if op["type"] == "text":
            try:
                f = font(op["size"])
                tw = ImageDraw.Draw(scratch).textlength(op["text"], font=f)
            except Exception:
                tw = len(op["text"]) * op["size"] * 0.5
            region = bbox([(op["x"] - tw, op["y"] - op["size"]), (op["x"] + tw, op["y"] + op["size"])], 6)
        elif op.get("points"):
            region = bbox(op["points"], int(op.get("width", 2)) + 4)
        if region is None:
            continue
        if clip:
            region = [max(region[0], int(clip[0])), max(region[1], int(clip[1])),
                      min(region[2], int(clip[2])), min(region[3], int(clip[3]))]
        if region[0] >= region[2] or region[1] >= region[3]:
            continue

        layer = scratch
        layer.paste((0, 0, 0, 0), [0, 0, W, H])
        box = draw_op(layer, op)
        if not box:
            continue
        box = [max(0, min(box[0], region[0])), max(0, min(box[1], region[1])),
               min(W, max(box[2], region[2])), min(H, max(box[3], region[3]))]
        if box[0] >= box[2] or box[1] >= box[3]:
            continue
        if clip:
            box = [max(box[0], int(clip[0])), max(box[1], int(clip[1])),
                   min(box[2], int(clip[2])), min(box[3], int(clip[3]))]
            if box[0] >= box[2] or box[1] >= box[3]:
                continue

        piece = layer.crop(box)
        if composite == "lighter":
            piece_rgb = Image.new("RGB", piece.size, (0, 0, 0))
            piece_rgb.paste(piece, (0, 0), piece)
            canvas.paste(ImageChops.add(canvas.crop(box), piece_rgb), box)
        else:
            canvas.paste(piece, box, piece)

    if scale != 1.0:
        canvas = canvas.resize((int(W * scale), int(H * scale)), Image.LANCZOS)
    canvas.save(out_path)
    print(f"{out_path}: {len(data['ops'])} ops -> {canvas.size[0]}x{canvas.size[1]}")


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else "tools/out/ops.json"
    dst = sys.argv[2] if len(sys.argv) > 2 else "tools/out/frame.png"
    with open(src) as fh:
        data = json.load(fh)
    print(json.dumps(data.get("meta", {}), indent=2)[:400])
    render(data, dst)
