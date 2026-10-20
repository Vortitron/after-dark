#!/usr/bin/env python3
"""admovie.py - an AD 4.0 module's recorded choreography (TYPE_8100/8102) as JSON.

Same format tools/adchoreo.py reads for Bad Dog!, made general:
  frames   step frame number -> [sequence id, index]. Frame numbers are the
           RLE chunk's own id (CSTM header +4, low word) plus one, so they
           stay right when a module has two sets numbered from zero apart
           (CYBER's font, 3500-3508, has its own movie, TYPE_8102 3500).
  steps    [[frame, z, flip, left, top], ...] per step (a finished picture)
  cues     {tick: [step, dx, dy]} - TYPE_8102 <movie>
  stage    [w, h] from the TYPE_8102 header
    python3 admovie.py AD40/AD40/HULA.AD 17000 -o all/art/hula/movie.json
"""
import argparse, json, os, struct, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from adextract import extract, type_name
from adchoreo import read_steps, read_cues

def build(path, movie):
    _f, res = extract(path)
    by = {}
    for r in res:
        by.setdefault(type_name(r.type), {})[r.id] = r.data
    tl = by['TYPE_8102'][movie]
    hdr = struct.unpack_from('<7H', tl, 0)
    # which RLE sets belong to this movie: those whose ids are within its block
    sets = [rid for rid in sorted(by['TYPE_8000']) if movie <= rid < movie + 500]
    frames = {}
    for rid in sets:
        buf = by['TYPE_8000'][rid]
        p = struct.unpack_from('>I', buf, 12)[0]; k = 0
        while p + 16 <= len(buf):
            tag = buf[p:p + 4]
            if not tag.isalpha():
                break
            ln = struct.unpack_from('>I', buf, p + 12)[0]
            if tag == b'CSTM':
                frames[(struct.unpack_from('>I', buf, p + 4)[0] & 0xffff) + 1] = [rid, k]; k += 1
            p += ln
    scripts = sorted(r for r in by['TYPE_8100'] if movie <= r < movie + 500)
    steps, index = [], {}
    for s, rid in enumerate(scripts):
        for offset, sprites in sorted(read_steps(by['TYPE_8100'][rid]).items()):
            index[(s, offset)] = len(steps)
            steps.append([list(x) for x in sprites])
    cues = {}
    w = struct.unpack('<%dh' % (len(tl) // 2), tl)
    i = 7
    for _ in range(hdr[6]):
        cid, offset, script, dx, dy = w[i:i + 5]
        cues[cid] = [index[(script, offset & 0xffff)], dx, dy]
        i += 5
    used = sorted({sp[0] for st in steps for sp in st})
    return {'stage': [hdr[4], hdr[5]], 'ticks': hdr[1],
            'frames': {f: frames[f] for f in used if f in frames},
            'steps': steps, 'cues': cues}

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('module'); ap.add_argument('movie', type=int); ap.add_argument('-o', required=True)
    a = ap.parse_args()
    data = build(a.module, a.movie)
    missing = {sp[0] for st in data['steps'] for sp in st} - set(data['frames'])
    with open(a.o, 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    print('%d steps, %d cues, %d frames, missing %s -> %s' % (len(data['steps']), len(data['cues']), len(data['frames']), sorted(missing)[:10], a.o))
