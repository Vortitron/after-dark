#!/usr/bin/env python3
"""adtext.py - the text and vector data some "no artwork" modules carry.

Several of the 3.x modules that ship no bitmaps are not code-only after all:
what they write lives in their resource table. This pulls it out as JSON for
all/modules/ to read.

    python3 tools/adtext.py strings AD40/CLASSIC/NONSENSE.AD
    python3 tools/adtext.py einstein AD40/CLASSIC/EINSTEIN.AD -o all/art/einstein
    python3 tools/adtext.py nonsense AD40/CLASSIC/NONSENSE.AD -o all/art/nonsense

strings    Every NE string table, as {id: text}. A block of resource id n
           holds strings (n-1)*16 .. (n-1)*16+15, each one length-prefixed.

einstein   The chalk. EINSTEIN.AD's type 32513 resources, named LETTER in its
           type-15 directory, are a handwriting font keyed by character code:
           32-122 are ASCII, 128 and up are whole pieces of equations - dB/dt,
           rho over epsilon-nought, the square root of 1 - v^2/c^2. Each one is
           a big-endian header (0, top, advance, ?) and then signed byte pairs,
           the pen's (dx, dy) one step at a time, ending in 0,0. Any step longer
           than one pixel is the pen lifted and moved. Strings 3-52 are the
           lines written out a hundred times; 53-67 are equations, written with
           those codes.

nonsense   NONSENSE.AD's grammar. Its string ids come in blocks of 1000, each
           starting with a count: 1000 nouns (odd singular, the even one after
           an irregular plural), 2000 adjectives, 3000 determiners (singular,
           plural), 4000 prepositions, 5000 pronouns (subject, object,
           possessive by person and number), 7000 verbs (-s, base, past, past
           participle, -ing, then what may follow it: n a noun, p a place, c a
           clause, i "to" and a verb, g an -ing, a an adjective, space nothing),
           8000 "to be", 9000 modals (x, x, x-n't), 10000 sentence adverbs,
           11000 adverbs, 12000 intensifiers, 13000 conjunctions, 14000 mass
           nouns. Proper names are NONSENSE.TXT beside it.
"""
import argparse
import json
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import adextract  # noqa: E402


def resources(path):
    _fmt, res = adextract.extract(path)
    return res


def strings(path):
    out = {}
    for r in resources(path):
        if adextract.type_name(r.type) != 'STRING':
            continue
        d, i, n = r.data, 0, 0
        while i < len(d) and n < 16:
            length = d[i]
            text = d[i + 1:i + 1 + length].decode('latin1')
            i += 1 + length
            if text:
                out[(r.id - 1) * 16 + n] = text
            n += 1
    return out


def signed(b):
    return b - 256 if b > 127 else b


def einstein(path):
    glyphs = {}
    for r in resources(path):
        if r.type != 32513:
            continue
        d = r.data
        _zero, top, advance, _extra = struct.unpack('>hhhh', d[:8])
        steps = []
        for i in range(8, len(d) - 1, 2):
            dx, dy = signed(d[i]), signed(d[i + 1])
            if dx == 0 and dy == 0:
                break
            steps.extend([dx, dy])
        glyphs[r.id] = {'top': top, 'advance': advance, 'steps': steps}
    text = strings(path)
    return {
        'module': 'EINSTEIN',
        'format': 'strokes',
        'glyphs': glyphs,
        'lines': [text[k].rstrip() for k in range(3, 53) if k in text],
        'equations': [text[k].rstrip() for k in range(53, 68) if k in text],
    }


def nonsense(path):
    text = strings(path)

    def block(base):
        count = int(text.get(base, '0') or 0)
        return [text.get(base + k, '') for k in range(1, count + 1)]

    nouns = block(1000)
    pairs = []
    for k in range(0, len(nouns), 2):
        if nouns[k]:
            pairs.append([nouns[k], nouns[k + 1] if k + 1 < len(nouns) else ''])
    verbs = block(7000)
    names_file = os.path.join(os.path.dirname(path), 'NONSENSE.TXT')
    names = []
    if os.path.exists(names_file):
        with open(names_file, encoding='latin1') as f:
            names = [line.strip() for line in f if line.strip()]
    return {
        'module': 'NONSENSE',
        'format': 'grammar',
        'nouns': pairs,
        'adjectives': [a for a in block(2000) if a],
        'determiners': [block(3000)[k:k + 2] for k in range(0, len(block(3000)), 2)],
        'prepositions': block(4000),
        'pronouns': [block(5000)[k:k + 3] for k in range(0, len(block(5000)), 3)],
        'verbs': [verbs[k:k + 6] for k in range(0, len(verbs) - 5, 6)],
        'be': [block(8000)[k:k + 5] for k in range(0, len(block(8000)), 5)],
        'modals': [block(9000)[k:k + 3] for k in range(0, len(block(9000)), 3)],
        'connectives': block(10000),
        'adverbs': block(11000),
        'intensifiers': block(12000),
        'conjunctions': block(13000),
        'mass': block(14000),
        'names': names,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('what', choices=['strings', 'einstein', 'nonsense'])
    ap.add_argument('module')
    ap.add_argument('-o', '--outdir')
    args = ap.parse_args()
    data = {'strings': strings, 'einstein': einstein, 'nonsense': nonsense}[args.what](args.module)
    if not args.outdir:
        json.dump(data, sys.stdout, indent=1, ensure_ascii=False)
        print()
        return
    os.makedirs(args.outdir, exist_ok=True)
    out = os.path.join(args.outdir, 'index.json')
    with open(out, 'w') as f:
        json.dump(data, f, separators=(',', ':'), ensure_ascii=False)
    print('wrote', out)


if __name__ == '__main__':
    main()
