"""words2c.py - packs Nonsense's grammar, all/art/nonsense/index.json, into
ad_art_nonsense.h:

    python3 esphome/tools/words2c.py all/art/nonsense/index.json \\
        esphome/components/after_dark/ad_art_nonsense.h

The header is one char blob, every
field NUL-terminated, entries delimited by an offset table (entry i spans
OFF[first+i] .. OFF[first+i+1]; its field count is the NULs in it)."""
import json, sys
src, dst = sys.argv[1], sys.argv[2]
d = json.load(open(src))
LISTS = ['nouns', 'adjectives', 'determiners', 'prepositions', 'pronouns', 'verbs', 'be', 'modals',
         'connectives', 'adverbs', 'intensifiers', 'conjunctions', 'mass', 'names']
blob = bytearray()
off = []
lists = []
for name in LISTS:
    first = len(off)
    for e in d[name]:
        off.append(len(blob))
        for f in (e if isinstance(e, list) else [e]):
            blob += f.encode('ascii') + b'\0'
    lists.append((name, first, len(d[name])))
off.append(len(blob))
assert len(blob) < 65536
o = []
o.append('// Generated from all/art/nonsense/index.json (NONSENSE.AD\'s string table and NONSENSE.TXT) - do not edit.')
o.append('#pragma once')
o.append('#include <cstdint>')
o.append('')
o.append('namespace adcore {')
o.append('namespace art_nonsense {')
o.append('')
o.append('struct WordList {')
o.append('  uint16_t first, n;  // entries OFF[first] .. OFF[first + n]')
o.append('};')
o.append('')
o.append('static const char WORDS[] =')
line = '    "'
def esc(b):
    c = chr(b)
    if b == 0: return '\\0'
    if c in '"\\': return '\\' + c
    return c
chunks = []
cur = ''
for i, b in enumerate(blob):
    cur += esc(b)
    # break after a NUL that ends an entry boundary-ish, keep lines < 100
    if len(cur) > 90 and b == 0:
        chunks.append(cur); cur = ''
if cur: chunks.append(cur)
# a \0 followed by a digit would be an octal escape; none of the words start with a digit
for c in chunks:
    o.append('    "%s"' % c)
o[-1] += ';'
o.append('')
o.append('static const uint16_t OFF[] = {')
for i in range(0, len(off), 12):
    o.append('    ' + ', '.join(str(x) for x in off[i:i + 12]) + ',')
o.append('};')
o.append('')
for name, first, n in lists:
    o.append('static const WordList %s = {%d, %d};' % (name.upper(), first, n))
o.append('')
o.append('}  // namespace art_nonsense')
o.append('}  // namespace adcore')
open(dst, 'w').write('\n'.join(o) + '\n')
print(len(blob), 'bytes of words,', len(off) * 2, 'bytes of offsets')
