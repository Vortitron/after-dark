#!/usr/bin/env python3
"""
adray.py - decode Ray's pre-rendered traces (TRACES/*.TRC) for the web.

RAY.AD (Dan Michaeloff, 1994) ships no pictures of its shapes. It ships the
output of a ray tracer - "On a very fast computer, it took approximately 20
hours to calculate one scene" - and composites it over your desktop at run
time, so a glass torus really does refract whatever is behind it. This was
worked out from the module's own code (segment 3 of the NE file: the
compositor at 0x0256 and the colour-table builder at 0x08ea).

A .TRC file, little-endian throughout:

    0x000  u32 0x196, then the scene: lights, camera (80-bit x87 extendeds),
    0x06e  f32 a0, a1     tint ramp: 8 steps from a0 to a1
    0x076  f32 b0, b1     object-colour ramp: 8 steps from b0 to b1
    0x07e  f32 c          (shadow strength; Ray overwrites it with 40.0)
    0x088  i16            lowest bounce offset, for the bouncing scenes
    0x110  u16 r, g, b    the object colour, Mac RGBColor (255,119,204: pink)
    0x196  u16 width, height, frames, entry size (34), 0, offset of frame 0
    0x1a0  frames x 34 bytes:
             u32 offset, u32 length, u16 top, u16 bottom, i16 y offset, 0...
           y offset is where the frame sits above its resting place; only
           BOUNCSPH and DIABOUNC use it.

Each frame is width x height u32 pixels, compressed as u32 words where
0xFF00FF00, n, v is a run of n copies of v and anything else is itself.
A pixel is:

    0xFFFFFFFF     not part of the object - the backdrop shows through
    low 6 bits     which row of Ray's 64 x 256 colour table: i*8 + j
    bits 6-15      unused by the compositor (left over from the tracer)
    high 16 bits   where to look in the backdrop: low byte dy, high byte
                   dx, both signed. 0x7F7F means "nothing", which reads as
                   palette index 255, white.

and the colour drawn is table[i*8 + j][backdrop colour], built as

    s = a0 + (a1 - a0) * i / 7          t = b0 + (b1 - b0) * j / 7
    f = (1 - s) + s * (0.8, 1.0, 0.9)
    colour = backdrop * f * (1 - t) + object colour * t

then snapped to the nearest palette entry. t is halved when the module's
reflection setting is 1 and the table is flat (t = 0) when b1 is 0.

This writes, per trace, a strip of its frames as a lossless PNG the browser
can read back exactly: R = colour-table row (0-63), +128 when the pixel has
no backdrop sample, 255 where the backdrop shows through; G = dx + 128;
B = dy + 128; A = 255. And index.json with each trace's parameters, Ray's
palette and the easter-egg cat (PICT/MICT 1000, frames from AINF 1000).

    python3 tools/adray.py AD40/CLASSIC -o all/art/ray
"""

import argparse
import glob
import io
import json
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from adextract import extract, type_name

RUN = 0xFF00FF00
CLEAR = 0xFFFFFFFF
NO_SAMPLE = 0x7F7F


def read_trace(path):
    d = open(path, "rb").read()
    w, h, n, esz, _, _ = struct.unpack_from("<6H", d, 0x196)
    a0, a1, b0, b1, c = struct.unpack_from("<5f", d, 0x6E)
    colour = [v >> 8 for v in struct.unpack_from("<3H", d, 0x110)]
    frames = []
    for k in range(n):
        off, length, top, bottom, yoff = struct.unpack_from("<IIHHh", d, 0x1A0 + esz * k)
        words = struct.unpack_from("<%dI" % (length // 4), d, off)
        px, i = [], 0
        while i < len(words):
            if words[i] == RUN:
                px.extend([words[i + 2]] * words[i + 1])
                i += 3
            else:
                px.append(words[i])
                i += 1
        if len(px) != w * h:
            raise ValueError("%s frame %d: %d pixels, expected %d" % (path, k, len(px), w * h))
        frames.append({"pixels": px, "y": yoff})
    return {"w": w, "h": h, "a": [a0, a1], "b": [b0, b1], "c": c,
            "colour": colour, "frames": frames}


def to_rgba(px):
    out = bytearray()
    for v in px:
        if v == CLEAR:
            out += b"\xff\x80\x80\xff"
            continue
        hi = v >> 16
        row = v & 0x3F
        if hi == NO_SAMPLE:
            out += bytes([row | 0x80, 128, 128, 255])
        else:
            dy = struct.unpack("b", bytes([hi & 0xFF]))[0]
            dx = struct.unpack("b", bytes([hi >> 8]))[0]
            out += bytes([row, dx + 128, dy + 128, 255])
    return bytes(out)


def resources(module):
    """{(type name, id as a string): bytes}"""
    _, res = extract(module)
    return {(type_name(r.type), str(r.id)): r.data for r in res}


def palette(module):
    """Ray's LOGPALETTE (PAL 1000): version, count, then r, g, b, flags."""
    data = resources(module).get(("PAL", "1000"))
    if data:
        n = struct.unpack_from("<H", data, 2)[0]
        return [list(data[4 + 4 * i:7 + 4 * i]) for i in range(n)]
    return []


def cat(module, dest):
    """The cat: PICT 1000 is the picture, MICT 1000 its mask, AINF the frames."""
    from PIL import Image
    res = resources(module)
    pict, mask, ainf = res.get(("PICT", "1000")), res.get(("MICT", "1000")), res.get(("AINF", "1000"))
    if not (pict and mask and ainf):
        return None
    im = Image.open(io.BytesIO(pict)).convert("RGBA")
    m = Image.open(io.BytesIO(mask)).convert("L")
    if m.size != im.size:
        m = m.resize(im.size)
    # MICT is a 1-bit AND mask: black where the cat is.
    im.putalpha(m.point(lambda v: 255 if v < 128 else 0))
    im.save(os.path.join(dest, "cat.png"))
    # AINF: u16 1, a bounding rect, the picture's rect, then the frame count,
    # a delay, and one (left, top, right, bottom) per frame.
    words = struct.unpack_from("<%dH" % (len(ainf) // 2), ainf)
    count, delay = words[9], words[10]
    frames = [list(words[11 + 4 * i:15 + 4 * i]) for i in range(count)]
    return {"w": im.width, "h": im.height, "delay": delay, "frames": frames}


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder", help="the folder holding RAY.AD and TRACES/")
    ap.add_argument("-o", "--outdir", default="all/art/ray")
    args = ap.parse_args()

    from PIL import Image
    os.makedirs(args.outdir, exist_ok=True)
    module = os.path.join(args.folder, "RAY.AD")
    manifest = {"module": "RAY", "palette": palette(module), "traces": {}}
    for path in sorted(glob.glob(os.path.join(args.folder, "TRACES", "*.TRC"))):
        name = os.path.splitext(os.path.basename(path))[0].lower()
        t = read_trace(path)
        strip = Image.new("RGBA", (t["w"] * len(t["frames"]), t["h"]))
        for k, f in enumerate(t["frames"]):
            strip.paste(Image.frombytes("RGBA", (t["w"], t["h"]), to_rgba(f["pixels"])), (k * t["w"], 0))
        strip.save(os.path.join(args.outdir, name + ".png"), optimize=True)
        manifest["traces"][name] = {
            "w": t["w"], "h": t["h"], "count": len(t["frames"]),
            "y": [f["y"] for f in t["frames"]],
            "a": t["a"], "b": t["b"], "colour": t["colour"],
        }
        print("%-10s %dx%d x%d" % (name, t["w"], t["h"], len(t["frames"])))
    c = cat(module, args.outdir)
    if c:
        manifest["cat"] = c
    with open(os.path.join(args.outdir, "index.json"), "w") as f:
        json.dump(manifest, f, separators=(",", ":"))


if __name__ == "__main__":
    main()
