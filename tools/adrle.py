#!/usr/bin/env python3
"""
adrle.py - check which frames close exactly, and export with the full
row opcodes. (The decoder itself now lives in adart.py.)

adart.py's opcode table treats every byte whose low nibble is 0 as "end of
row". Most modules only ever write 0x10 there, so that is all it needs. Bad
Dog! (AD40/AD40/BADDOG.AD) uses the high nibble of op 0 for two more things,
found by making every one of its 623 frames come out at exactly the height
its IHDR gives, and checked against the module running under Wine:

    0x10          end of row (as adart.py)
    0x00          end of frame - the row it closes is the last one
    0x30 HH LL    emit a copy of row HHLL (big-endian, 0-based, already
                  decoded) as the next row. No 0x10 follows; several can
                  run back to back.

The copy is what the big flat parts use: the 3D Application window, the
taskbar and the menus in sequence 23009 are mostly grey rows that repeat, so
they decoded to a few stripes and a lot of nothing. 0x30 shows up in the dog
frames too - a row that matches one above it - which is why decoding them with
adart.py leaves the odd frame short or sheared.

Everything else - the container, CTAB, the other nine opcodes - is
adart.py's, unchanged; this only swaps the frame decoder.

    python3 tools/adrle.py AD40/AD40/BADDOG.AD --check
    python3 tools/adrle.py AD40/AD40/BADDOG.AD -o all/art/ [--only 23009,23010]
"""

import argparse
import glob
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import adart  # noqa: E402
from adart import TRANSPARENT, read_chunks  # noqa: E402


from adart import decode_frame  # noqa: E402  (now adart.py's own)


def exact(src, width, height):
    """True when the stream closes exactly `height` rows with 0x00."""
    rows, i, n = 0, 0, len(src)
    try:
        while i < n:
            b = src[i]; i += 1
            op, hi = b & 0x0F, b >> 4
            if op == 0:
                if hi == 3:
                    i += 2
                    rows += 1
                    continue
                rows += 1
                if hi == 0:
                    return rows == height
            elif op == 1 and hi == 0 or op == 2:
                i += 1
            elif op == 6:
                i += 1 if hi else 2
            elif op == 7 and hi == 0:
                c = src[i]; i += 1 + (c + 1) // 2
            elif op == 7 and hi == 1:
                c = src[i]; i += 1 + c
            elif op == 8:
                i += 1 if hi else 2
            elif op == 9:
                i += 2 if hi else 3
    except IndexError:
        return False
    return False


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("modules", nargs="+")
    ap.add_argument("-o", "--outdir", default=None,
                    help="write web assets here, as adweb.py does")
    ap.add_argument("--only", default=None, help="comma-separated sequence ids")
    ap.add_argument("--check", action="store_true",
                    help="report how many frames close at their IHDR height")
    args = ap.parse_args()

    paths = []
    for pattern in args.modules:
        paths += sorted(glob.glob(pattern)) or [pattern]

    if args.check:
        from adextract import extract, type_name
        for path in paths:
            _fmt, resources = extract(path)
            total = good = copies = 0
            for r in resources:
                if type_name(r.type) not in [a for a, _h in adart.ART_PAIRS]:
                    continue
                chunks = read_chunks(r.data) or []
                dims = [struct.unpack_from(">I", p, 8)[0] for t, p in chunks
                        if t == b"IHDR" and len(p) >= 12]
                cstm = [p for t, p in chunks if t == b"CSTM"]
                for k, p in enumerate(cstm[:len(dims)]):
                    total += 1
                    good += exact(p, dims[k] & 0xFFFF, dims[k] >> 16)
                    copies += b"\x30\x00" in p
            print("%-22s %5d frames, %5d close exactly" % (os.path.basename(path), total, good))
        return

    adart.decode_frame = decode_frame                     # adart.sequences looks it up here
    import adweb
    only = set(args.only.split(",")) if args.only else None
    for path in paths:
        dest, manifest = adweb.export(path, args.outdir or "sprites", only)
        print("%-22s %d sequences -> %s" % (os.path.basename(path),
                                            len(manifest["sequences"]), dest))


if __name__ == "__main__":
    main()
