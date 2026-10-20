#!/usr/bin/env python3
"""
adchoreo.py - Bad Dog!'s choreography, out of the resource table.

Bad Dog! (AD40/AD40/BADDOG.AD, 1996) does not move its dog by code alone.
Every frame of every gag - the dog, the folder he is shaking, the window he
runs into, the dirt he kicks up - is laid out in three resources the other
modules do not have:

  TYPE_8100 23000-23002   "steps": little-endian int16s. A count, then per
                          step a bounding rect (L, T, R, B), a sprite count,
                          and per sprite
                              frame, z, flip, L, T, R, B
                          `frame` numbers every frame of the module's RLE
                          sequences in id order, 1-based, with one unused
                          number after each sequence: 23000's fifteen frames
                          are 1-15, 23001's start at 17. `flip` 1 = drawn
                          mirrored. Coordinates are a shared stage about
                          640x480 wide, the same for every step, so a step
                          is a finished picture rather than a sprite.
  TYPE_8102 23000         "cues": a 24-byte header, then 2667 entries of
                              id, offset, script, dx, dy
                          (int16s). One cue is one tick of animation: draw
                          step at byte `offset` of TYPE_8100 23000+`script`,
                          shifted by (dx, dy). Cue ids run in blocks with
                          gaps between them; a block is one gag.
  TYPE_8101 23000         16 bytes, a summary (cue count 3196, stage 393x360,
                          3 scripts). Not needed.

Which block is which gag comes from the code. The module exports its C++
symbols, so `objdump -p` names Dog::Setup_PeeOnFolder and friends, and each
Setup_ function pushes its first cue id (Setup_PeeOnFolder: 755,
Setup_3DGag: 2076). Those are in GAGS below; a gag plays from that cue to
the end of its block.

    python3 tools/adchoreo.py AD40/AD40/BADDOG.AD -o all/art/baddog/cues.json

Its folders are named from STRINGLIST 23010 ("Dog Food", "Kibble", ...).

The output is {"folders": [...], "frames": [[seq, index], ...] (by frame number),
"steps": [[[frame, z, flip, x, y], ...], ...], "cues": {id: [step, dx, dy]},
"gags": {name: [first, last]}}. Rects are reduced to their top-left
corner; the width and height are the frame's own.
"""

import argparse
import json
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from adextract import extract, type_name  # noqa: E402

# Dog::Setup_<name> -> the cue id it starts from, read out of the code.
GAGS = {
    "LeaveSqueakyToy": 131, "PickToy": 237, "BadDog": 313, "Cute04": 512,
    "Cute05": 571, "PeeOnFolder": 755, "PeeOnTrash": 840, "PeeOnHD": 929,
    "PeaksIn": 1019, "SlideIn": 1055, "FolderTrip": 1120,
    "FolderTripLowerLevel": 1155, "PeakNewHole": 1251, "PeakHole": 1280,
    "JumpsOutOfHole": 1306, "StuckInHole": 1322, "ShockDig": 1374,
    "ToyDig": 1459, "DigHole": 1507, "PullToyFromHole": 1541,
    "HideToyInHole": 1574, "FolderIn": 1592, "FightFolder": 1609,
    "FolderOut": 1675, "FightFolderNBreak": 1691, "ShakeFolder": 1832,
    "ShakeOutPaper": 1864, "OpenWindow": 1911, "CloseWindow": 1939,
    "CloseClipboard": 1965, "3DGag": 2076, "Trash": 2285, "TrashRun": 2331,
    "BarHang": 2359, "Clipboard": 2552, "Menu": 2626, "RipDT": 2675,
    "ClipboardBite": 2906, "PullClipboardOnScreen": 2975, "BarRip": 3051,
    "BarRun": 3091, "CloseOutOfClipboard": 3187,
}


def load(path):
    _fmt, resources = extract(path)
    by = {}
    for r in resources:
        by.setdefault(type_name(r.type), {})[r.id] = r.data
    return by


def frame_table(by):
    """Frame number -> (sequence id, index): 1-based, a gap after each sequence."""
    table = [None]
    for rid in sorted(by["TYPE_8000"]):
        hdr = by["TYPE_8001"][rid]
        count = struct.unpack_from("<H", hdr, 48)[0]
        table += [(rid, i) for i in range(count)] + [None]
    return table


def read_steps(data):
    w = struct.unpack("<%dh" % (len(data) // 2), data[:len(data) // 2 * 2])
    i, steps = 1, {}
    for _ in range(w[0]):
        offset = i * 2
        count = w[i + 4]
        i += 5
        sprites = []
        for _ in range(count):
            frame, z, flip, left, top = w[i:i + 5]
            sprites.append((frame, z, flip, left, top))
            i += 7
        steps[offset] = sprites
    return steps


def read_cues(data):
    w = struct.unpack("<%dh" % (len(data) // 2), data)
    cues, i = {}, 12
    while i + 5 <= len(w):
        cid, offset, script, dx, dy = w[i:i + 5]
        cues[cid] = (offset, script, dx, dy)
        i += 5
    return cues


def folder_names(by):
    """STRINGLIST 23010: a count, then the names the fake folders get."""
    data = by.get("STRINGLIST", {}).get(23010, b"")
    if len(data) < 2:
        return []
    count = struct.unpack_from("<H", data, 0)[0]
    names = data[2:].split(b"\0")[:count]
    return [n.decode("latin-1") for n in names]


def build(path):
    by = load(path)
    table = frame_table(by)
    scripts = sorted(by["TYPE_8100"])
    steps, index = [], {}
    for s, rid in enumerate(scripts):
        for offset, sprites in sorted(read_steps(by["TYPE_8100"][rid]).items()):
            index[(s, offset)] = len(steps)
            steps.append(sprites)
    cues = {}
    for cid, (offset, script, dx, dy) in sorted(read_cues(by["TYPE_8102"][23000]).items()):
        cues[cid] = [index[(script, offset)], dx, dy]
    used = sorted({f for st in steps for f, *_ in st})
    frames = {f: list(table[f]) for f in used if f < len(table) and table[f]}
    gags = {}
    for name, first in GAGS.items():
        last = first
        while last + 1 in cues:
            last += 1
        gags[name] = [first, last]
    return {
        "folders": folder_names(by),
        "frames": frames,
        "steps": [[[f, z, fl, x, y] for f, z, fl, x, y in st] for st in steps],
        "cues": cues,
        "gags": gags,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("module")
    ap.add_argument("-o", "--out", required=True)
    args = ap.parse_args()
    data = build(args.module)
    with open(args.out, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    print("%d steps, %d cues, %d gags -> %s" % (len(data["steps"]), len(data["cues"]),
                                                len(data["gags"]), args.out))


if __name__ == "__main__":
    main()
