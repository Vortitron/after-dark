#!/usr/bin/env python3
"""adfilm.py MODULE.AD ARTDIR - add the Twisted 'OF' films (OFMM/OFST/OFTB) to an
adweb.py art folder's index.json, as {"films": {id: {...}}}.

  OFMM  u32 ?, u16 ticks, 0, 0, u16 w, u16 h, u16 chunks
  OFST  u16 maxSprites, u16 ticks, 0, 0, w, h, u16 n; n x (u16 tick, u16 celOffset, u16 chunk, s16 dx, s16 dy)
  OFTB  (id = film + chunk) u16 n; n x (rect l,t,r,b; u16 k; k x (u16 frame, u16 layer, u16 flags, rect))
Frames are numbered from 1 across the module's RLEP sequences in id order with one
spare number after each sequence.

The art folder comes from adweb.py first. Franken and Mime Hunt number each film
separately (ids film...film+999): PERFILM=1. Voyeur's gaps differ, so its frames are
matched by sprite rect size: VOTE=1.

    python3 tools/adweb.py AD40/AD10th/Mikes.ad -o all/art/
    python3 tools/adfilm.py AD40/AD10th/Mikes.ad all/art/mikes"""
import sys, os, json, struct
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from adextract import extract, type_name
path, art = sys.argv[1:3]
fmt, res = extract(path)
by = {}
for r in res:
    by.setdefault(type_name(r.type), {})[r.id] = r.data
idx = json.load(open(os.path.join(art, 'index.json')))
def numbering(lo, hi):
    gmap = {}; g = 1
    for s in sorted(idx['sequences'], key=int):
        if not lo <= int(s) < hi: continue
        n = idx['sequences'][s]['count']
        for i in range(n): gmap[g + i] = (s, i)
        g += n + 1
    return gmap
def T(name):
    for k in by:
        if k == name: return by[k]
    return {}
OFMM, OFST, OFTB = T('TYPE_32513'), T('TYPE_32514'), T('TYPE_32515')
films = {}
import collections as _c
def voted(fid, nchunks):
    # Number frames by matching each OFTB sprite rect's size against the
    # decoded frames: the offset most sizes agree on is that sequence's base.
    sizes = _c.defaultdict(list)
    for sid, v in idx['sequences'].items():
        for i, fr in enumerate(v['frames']):
            sizes[(fr['w'], fr['h'])].append((sid, i))
    votes = _c.defaultdict(_c.Counter)
    for c in range(nchunks):
        b = OFTB[fid + c]; cnt = struct.unpack_from('<H', b)[0]; p = 2
        for i in range(cnt):
            p += 8; k = struct.unpack_from('<H', b, p)[0]; p += 2
            for jx in range(k):
                fr = struct.unpack_from('<H', b, p)[0]; r = struct.unpack_from('<4h', b, p + 6); p += 14
                for sid, ii in sizes.get((r[2] - r[0], r[3] - r[1]), []):
                    votes[sid][fr - ii] += 1
    gmap = {}
    for sid, v in votes.items():
        base, n = v.most_common(1)[0]
        if n < 5: continue
        for i in range(idx['sequences'][sid]['count']):
            gmap.setdefault(base + i, (sid, i))
    return gmap
import os as _os
RANGE = lambda fid: (fid, fid + 1000) if _os.environ.get('PERFILM') else (0, 1 << 30)
for fid, mm in sorted(OFMM.items()):
    vals = struct.unpack_from('<I6H', mm)
    ticks, W, H, nchunks = vals[1], vals[4], vals[5], vals[6]
    st = OFST[fid]
    gmap = numbering(*RANGE(fid))
    if os.environ.get('VOTE'):
        gmap = voted(fid, nchunks)
    n = struct.unpack_from('<H', st, 12)[0]
    cels, celidx, missing = [], {}, 0
    for c in range(nchunks):
        b = OFTB[fid + c]
        cnt = struct.unpack_from('<H', b)[0]; p = 2
        for i in range(cnt):
            off = p; p += 8
            k = struct.unpack_from('<H', b, p)[0]; p += 2
            sp = []
            for j in range(k):
                fr, layer, fl = struct.unpack_from('<HHH', b, p)
                l, t, r, bt = struct.unpack_from('<4h', b, p + 6); p += 14
                if fr not in gmap: missing += 1; continue
                s, fi = gmap[fr]
                sp.append([int(s), fi, layer, fl, l, t])
            sp.sort(key=lambda q: q[2])
            celidx[(c, off)] = len(cels); cels.append(sp)
    ents = []
    for i in range(n):
        t, off, ch, dx, dy = struct.unpack_from('<HHhhh', st, 14 + i * 10)
        ents.append([t, celidx[(ch, off)], dx, dy])
    films[str(fid)] = {'ticks': ticks, 'w': W, 'h': H, 'entries': ents, 'cels': cels}
    print(fid, 'ticks', ticks, 'entries', n, 'cels', len(cels), 'missing sprites', missing)
idx['films'] = films
json.dump(idx, open(os.path.join(art, 'index.json'), 'w'), separators=(',', ':'))
