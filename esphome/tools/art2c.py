#!/usr/bin/env python3
"""
art2c.py - turns a module's ripped artwork (all/art/<module>/index.json and
its PNG strips) into a C++ header the after_dark component can compile in.

    python3 esphome/tools/art2c.py all/art/toast3 toast3 \
        -o esphome/components/after_dark/ad_art_toast3.h [--seq 1000,3000]

The strips are a handful of flat colours on a 1-bit mask, as the originals
were, so each module gets one shared palette (index 0 is "see-through") and
each frame is stored as run-length rows. A row is a list of spans:

    skip, run, <run palette indices>     draw `run` pixels after skipping `skip`
    255, 0                               skip 255 more and carry on
    0, 0                                 end of row

That keeps the flash cost near what the art really holds, and lets the blitter
copy spans without testing every pixel for transparency.

For small screens, --scale shrinks every frame (and the nominal sizes the
savers steer by), and --mono bakes it down to black and white for OLEDs:

    art2c.py all/art/toast3 toast3_m3 --scale 1/3 --mono -o ...

3.x modules keep plain bitmaps ("format": "dib") instead of sequences. Each
becomes a one-frame sequence, numbered in order, with a BM_<NAME> constant
for its number; --cells NAME=W cuts a strip of equal cells into frames
(NAME=WxH for a grid, read across then down):

    art2c.py all/art/marbles2 marbles2 --cells marbles=16 -o ...

--mono is a threshold, except that a pixel on the darker side of an edge
inside the sprite goes black. That keeps a toaster's wing apart from its
body and its slots open where a plain threshold or a dither turns it into a
white blob or noise.
"""
import argparse
import json
import os
import re
import sys

from PIL import Image


def spans(row):
    """Encode one row of palette indices (0 = transparent)."""
    out = []
    x, n = 0, len(row)
    skip = 0
    while x < n:
        if row[x] == 0:
            skip += 1
            x += 1
            continue
        start = x
        while x < n and row[x] != 0 and x - start < 255:
            x += 1
        while skip > 255:
            out += [255, 0]
            skip -= 255
        out += [skip, x - start] + row[start:x]
        skip = 0
    out += [0, 0]
    return out


def fraction(text):
    if '/' in text:
        a, b = text.split('/')
        return float(a) / float(b)
    return float(text)


def shrink(img, scale):
    if scale == 1:
        return img
    return img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))),
                      Image.BOX)


def bake_mono(img, threshold, edge):
    """Black and white, with internal edges kept dark; see the docstring."""
    px = img.load()
    w, h = img.size
    lum = [[None] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a >= 128:
                lum[y][x] = 0.299 * r + 0.587 * g + 0.114 * b
    out = img.copy()
    op = out.load()
    for y in range(h):
        for x in range(w):
            v = lum[y][x]
            if v is None:
                op[x, y] = (0, 0, 0, 0)
                continue
            on = v > threshold
            for dx, dy in ((1, 0), (0, 1), (-1, 0), (0, -1)):
                X, Y = x + dx, y + dy
                if 0 <= X < w and 0 <= Y < h and lum[Y][X] is not None and lum[Y][X] - v > edge:
                    on = False
            op[x, y] = (255, 255, 255, 255) if on else (0, 0, 0, 255)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('art', help='all/art/<module> directory')
    ap.add_argument('name', help='C identifier for this art set')
    ap.add_argument('-o', '--out', required=True)
    ap.add_argument('--seq', help='comma-separated sequence ids to keep (default: all)')
    ap.add_argument('--scale', type=fraction, default=1, help='shrink by this much, e.g. 1/3')
    ap.add_argument('--mono', action='store_true', help='bake to black and white')
    ap.add_argument('--threshold', type=float, default=110, help='--mono: brightness that lights')
    ap.add_argument('--edge', type=float, default=45, help='--mono: step that counts as an edge')
    ap.add_argument('--index', help='use this index.json instead of the one in the art directory '
                    '(e.g. esphome/tools/index/<module>.json, trimmed to the frames a saver uses)')
    ap.add_argument('--cells', action='append', default=[],
                    help='NAME=W or NAME=WxH: cut bitmap NAME into frames W wide (and H high, '
                    'read across then down) (3.x art)')
    args = ap.parse_args()

    meta = json.load(open(args.index or os.path.join(args.art, 'index.json')))
    keep = [s.strip() for s in args.seq.split(',')] if args.seq else None
    # (id, label, png, frames, nominal w, nominal h)
    entries = []
    if meta.get('sequences'):
        seqs = meta['sequences']
        for sid in keep or sorted(seqs, key=int):
            s = seqs[sid]
            entries.append((int(sid), None, '%s.png' % sid, s['frames'], s['w'], s['h']))
    elif meta.get('format') == 'dib':
        cells = dict(c.split('=') for c in args.cells)
        names = keep or list(meta['bitmaps'])
        for n, name in enumerate(names):
            b = meta['bitmaps'][name]
            cell = cells.get(name, '%dx%d' % (b['w'], b['h']))
            cw, ch = (int(v) for v in cell.split('x')) if 'x' in cell else (int(cell), b['h'])
            fr = [{'x': x, 'y': y, 'w': cw, 'h': ch}
                  for y in range(0, b['h'] - ch + 1, ch) for x in range(0, b['w'] - cw + 1, cw)]
            entries.append((n, name, b['file'], fr, cw, ch))
    else:
        sys.exit('%s has neither sequences nor dib bitmaps' % args.art)

    palette = {}          # (r, g, b) -> index, from 1
    data = []
    frames = []           # (w, h, offset)
    sequences = []        # (id, w, h, count, first frame)
    for sid, label, png, frame_boxes, nw, nh in entries:
        strip = Image.open(os.path.join(args.art, png)).convert('RGBA')
        first = len(frames)
        for f in frame_boxes:
            img = shrink(strip.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h'])), args.scale)
            if args.mono:
                img = bake_mono(img, args.threshold, args.edge)
            px = img.load()
            offset = len(data)
            for y in range(img.height):
                row = []
                for x in range(img.width):
                    r, g, b, a = px[x, y]
                    if a < 128:
                        row.append(0)
                        continue
                    key = (r, g, b)
                    if key not in palette:
                        palette[key] = len(palette) + 1
                    row.append(palette[key])
                data += spans(row)
            frames.append((img.width, img.height, offset))
        sequences.append((sid, max(1, round(nw * args.scale)), max(1, round(nh * args.scale)),
                          len(frame_boxes), first))

    if len(palette) > 255:
        sys.exit('%s needs %d colours; the format holds 255' % (args.art, len(palette)))

    pal = [0, 0, 0]
    for rgb, _ in sorted(palette.items(), key=lambda kv: kv[1]):
        pal += list(rgb)

    def block(values, per=24):
        return ',\n'.join('  ' + ', '.join(str(v) for v in values[i:i + per])
                          for i in range(0, len(values), per))

    with open(args.out, 'w') as fh:
        fh.write('// Generated by esphome/tools/art2c.py from %s - do not edit.\n'
                 % os.path.normpath(args.art))
        fh.write('// %d colours, %d frames, %d bytes of pixel data.\n'
                 % (len(palette), len(frames), len(data)))
        fh.write('#pragma once\n#include "ad_art.h"\n\n')
        fh.write('namespace adcore {\nnamespace art_%s {\n\n' % args.name)
        named = [(e[1], e[0]) for e in entries if e[1] is not None]
        for label, sid in named:
            fh.write('static const uint16_t BM_%s = %d;\n'
                     % (re.sub(r'[^A-Za-z0-9]', '_', label).upper(), sid))
        if named:
            fh.write('\n')
        fh.write('static const uint8_t PALETTE[] = {\n%s\n};\n\n' % block(pal))
        fh.write('static const uint8_t DATA[] = {\n%s\n};\n\n' % block(data))
        fh.write('static const Frame FRAMES[] = {\n%s\n};\n\n' % ',\n'.join(
            '  {%d, %d, %d}' % f for f in frames))
        fh.write('static const Sequence SEQUENCES[] = {\n%s\n};\n\n' % ',\n'.join(
            '  {%d, %d, %d, %d, FRAMES + %d}' % s for s in sequences))
        fh.write('static const Art ART = {PALETTE, %d, DATA, SEQUENCES, %d};\n\n'
                 % (len(palette) + 1, len(sequences)))
        fh.write('}  // namespace art_%s\n}  // namespace adcore\n' % args.name)
    print('%s: %d colours, %d frames, %d bytes' % (args.out, len(palette), len(frames), len(data)))


if __name__ == '__main__':
    main()
