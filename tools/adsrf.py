#!/usr/bin/env python3
"""
adsrf.py - the Hall of Fame's artwork, out of hof.srf.

The Hall of Fame (AD10th/Hall of Fame.ad, 1999) is built on Midnight
Software's "AD Online" engine and keeps its art beside it in hof.srf, not in
the module. An .srf is a big-endian resource file:

  'srf1', u32 file size, u32 directory size, then per type:
      4cc type, u32 count, count x (u32 id, u32 offset, u32 size)

Types: 'palt' (768-byte RGB palettes), 'snd ' (Mac 'snd ' resources, IMA4)
and 'off4' - an "offset strip" (class xOffsetStrip in the module's exports):

  header (big-endian u16 words; the first u32 is its size in bytes):
      w[2] 400, w[3] 6 (words per record), w[4] F = frame count,
      w[4 + f] = record index of frame f (1-based; 0 = no frame, which is
      what separates labelled sequences), records start at word F + 5 + ...
      i.e. frame f's record is at word w[4 + f] * 6 + F - 1:
          ref, x0, y0, x1, y1, n     (ref != 0: take the n items from there)
      followed by n 6-word items:
          (channel | 0x80 hidden) << 8 | flags, x0, y0, x1, y1, cast
      Item rects are relative to the frame's (x0, y0), on a 640x480 stage;
      a rect bigger than its cast means draw it scaled (Lunatic Fringe).
  then u16 cast count, u16 count again, and per cast u32 offset, u16 w, u16 h
  (casts are 1-based). Each cast is LZ'd (xOffsetStrip's own: three bytes
  raw, then a flag byte per eight items, MSB first; a set bit is a u16 LE
  with a 12-bit distance and a 4-bit length + 2, length 0 meaning next byte
  + 18, distance 0 ending it). What comes out is run lengths that alternate
  skip / copy across the whole w x h, row after row, each copy run followed
  by its palette indices.

  python3 adsrf.py AD40/AD10th/hof.srf -o all/art/hall-of-fame
"""
import argparse
import json
import os
import struct

from PIL import Image


def parse(path):
    b = open(path, 'rb').read()
    if b[:4] != b'srf1':
        raise SystemExit('not an srf1 file')
    dirsize = struct.unpack('>I', b[8:12])[0]
    o, res = 12, {}
    while o < 12 + dirsize - 4:
        t = b[o:o + 4].decode('latin1')
        n = struct.unpack('>I', b[o + 4:o + 8])[0]
        o += 8
        for _ in range(n):
            rid, off, size = struct.unpack('>III', b[o:o + 12])
            o += 12
            res.setdefault(t, {})[rid] = b[off:off + size]
    return res


def unlz(src, pos, limit):
    out = bytearray(src[pos:pos + 3])
    p = pos + 4
    while len(out) < limit:
        flags = src[p - 1]
        for _ in range(8):
            if flags & 0x80:
                w = src[p] | src[p + 1] << 8
                p += 2
                d = w & 0xfff
                if d == 0:
                    return out
                n = w >> 12
                if n == 0:
                    n = src[p] + 18
                    p += 1
                else:
                    n += 2
                s = len(out) - d
                for i in range(n):
                    out.append(out[s + i])
            else:
                out.append(src[p])
                p += 1
            flags = (flags << 1) & 0xff
        p += 1
    return out


class Strip:
    def __init__(self, data):
        self.d = data
        hb = struct.unpack('>I', data[:4])[0]
        self.w = struct.unpack('>%dH' % (hb // 2), data[:hb])
        count = struct.unpack('>H', data[hb:hb + 2])[0]
        self.casts = [struct.unpack('>IHH', data[hb + 4 + 8 * i:hb + 12 + 8 * i]) for i in range(count)]

    def cast(self, i):
        off, w, h = self.casts[i - 1]
        s = unlz(self.d, off, w * h * 2 + 1024)
        px = [None] * (w * h)
        q = o = 0
        skip = False
        while o < w * h and q < len(s):
            n = s[q]
            q += 1
            skip = not skip
            if skip:
                o += n
            else:
                for _ in range(n):
                    if o < w * h:
                        px[o] = s[q]
                    q += 1
                    o += 1
        return w, h, px

    def frames(self):
        w = self.w
        F, base, out = w[4], w[4] - 1, []
        for f in range(1, F + 1):
            idx = w[4 + f]
            if idx == 0:
                out.append(None)
                continue
            p = idx * 6 + base
            ref, x0, y0, x1, y1, n = w[p:p + 6]
            q = (ref * 6 + base if ref else p) + 6
            items = []
            for i in range(n):
                w0, a, b, c, d, cast = w[q + 6 * i:q + 6 * i + 6]
                if w0 & 0x8000:
                    continue
                items.append([cast, s16(x0 + a), s16(y0 + b), s16(c - a), s16(d - b), w0 & 3])
            out.append(items)
        return out


def s16(v):
    v &= 0xffff
    return v - 0x10000 if v & 0x8000 else v


def pack(sizes, width):
    """Shelf-pack (w, h) boxes; returns positions and sheet height."""
    order = sorted(range(len(sizes)), key=lambda i: -sizes[i][1])
    pos = [None] * len(sizes)
    x = y = shelf = 0
    for i in order:
        w, h = sizes[i]
        if x + w > width:
            x, y, shelf = 0, y + shelf, 0
        pos[i] = (x, y)
        x += w
        shelf = max(shelf, h)
    return pos, y + shelf


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('srf')
    ap.add_argument('-o', '--out', required=True)
    ap.add_argument('--ids', help='comma-separated off4 ids (default: all but 1000 and 2000)')
    args = ap.parse_args()
    res = parse(args.srf)
    os.makedirs(args.out, exist_ok=True)
    ids = [int(i) for i in args.ids.split(',')] if args.ids else sorted(i for i in res['off4'] if i >= 5000)
    manifest = {}
    for rid in ids:
        st = Strip(res['off4'][rid])
        pal = res['palt'][rid]
        frames = st.frames()
        used = sorted({it[0] for f in frames if f for it in f})
        decoded = {c: st.cast(c) for c in used}
        seen = {v for c in used for v in decoded[c][2] if v is not None}
        clear = next(i for i in range(256) if i not in seen)
        pos, height = pack([(decoded[c][0] + 1, decoded[c][1] + 1) for c in used], 1024)
        sheet = Image.new('P', (1024, max(1, height)), clear)
        sheet.putpalette(pal)
        for k, c in enumerate(used):
            w, h, px = decoded[c]
            im = Image.new('P', (w, h))
            im.putdata([clear if v is None else v for v in px])
            sheet.paste(im, pos[k])
        name = '%d.png' % rid
        sheet.save(os.path.join(args.out, name), transparency=clear, optimize=True)
        manifest[str(rid)] = {
            'file': name,
            'casts': {str(c): [pos[k][0], pos[k][1], decoded[c][0], decoded[c][1]] for k, c in enumerate(used)},
            'frames': frames,
        }
        print(rid, len(used), 'casts', len(frames), 'frames', os.path.getsize(os.path.join(args.out, name)), 'bytes')
    # Groove lengths decide how long each card stays up: Mac 'snd ' with an
    # IMA4 compressed header, 64 samples a packet.
    sounds = {}
    for sid, d in res['snd '].items():
        rate = struct.unpack('>I', d[28:32])[0] / 65536
        packets = struct.unpack('>I', d[42:46])[0]
        sounds[str(sid)] = round(packets * 64 / rate, 3)
    with open(os.path.join(args.out, 'index.json'), 'w') as f:
        json.dump({'module': 'Hall of Fame', 'format': 'srf-strips', 'stage': [640, 480], 'fps': 15,
                   'strips': manifest, 'grooveSeconds': sounds}, f, separators=(',', ':'))
    print('index.json', os.path.getsize(os.path.join(args.out, 'index.json')), 'bytes')


if __name__ == '__main__':
    main()
