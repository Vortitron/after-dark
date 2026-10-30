#!/usr/bin/env python3
"""
measure.py - how much flash each saver adds to a firmware, for the builder
page (all/esphome.html). Needs the ESP toolchains PlatformIO installs.

    python3 esphome/tools/measure.py      # -> all/esphome-savers.json

For each saver and each kind of screen it compiles the saver as ESPHome
would (S3 Xtensa for colour, C3 RISC-V for 1-bit and character LCD, -Os,
one section per function), links it against the shared core with unused
code thrown away, and subtracts the core alone. Options that change what goes
in (Fish Pro's species, Clocks' face) are measured one choice at a time.

The numbers are what the saver costs on top of a firmware; the base firmware
itself (ESPHome, Wi-Fi, the display driver...) is measured from real builds
and written in BUILT_WITH_WARP below. Saver names, pages and notes come from
savers.json beside this script.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.normpath(os.path.join(HERE, '..', 'components', 'after_dark'))
PIO = os.path.expanduser('~/.platformio/packages')
CORE = ['ad_core.cpp', 'ad_text.cpp', 'ad_draw.cpp', 'ad_font.cpp', 'ad_savers.cpp']

ARCH = {
    'xtensa': (os.path.join(PIO, 'toolchain-xtensa-esp-elf/bin/xtensa-esp32s3-elf-'), ['-mlongcalls']),
    'riscv': (os.path.join(PIO, 'toolchain-riscv32-esp/bin/riscv32-esp-elf-'),
              ['-march=rv32imc_zicsr_zifencei', '-mabi=ilp32']),
}
# kind -> (arch, mode flag)
KINDS = {'colour': ('xtensa', 'AD_COLOUR_ONLY'), 'mono': ('riscv', 'AD_MONO_ONLY'), 'text': ('riscv', 'AD_TEXT_ONLY')}

# Whole firmwares built with only Warp (ESPHome 2025.7.5, ESP-IDF, Wi-Fi +
# API + OTA + SNTP, the example configs' screens); Warp's own cost is taken
# off to leave the firmware with no savers. Re-measure with `esphome compile`
# when ESPHome moves on.
BUILT_WITH_WARP = {
    'esp32s3': {'colour': 854152, 'mono': 807836},
    'esp32c3': {'colour': 899072, 'mono': 848692, 'text': 844752},
}
# App slot by flash size, ESPHome's APP_PARTITION_SIZES (two slots, for OTA).
APP_SLOT = {'4MB': 0x1C0000, '8MB': 0x3C0000, '16MB': 0x7C0000}

FISH = [(3010, 'yellow_tang'), (3020, 'red_clown'), (3030, 'blue_tanger'), (3040, 'trigger_fish'),
        (3050, 'pink_squirrel'), (3070, 'butterfly_fish'), (3080, 'emperor'), (3060, 'jellyfish'),
        (3110, 'sardines')]
FACES = ['melting_digital', 'classic', 'modern', 'art_deco', 'mutating']

STUB = '#include "ad_core.h"\nextern "C" void ad_stub_entry() { volatile const void *p = adcore::first_saver(); (void) p; }\n'


def flags(arch, mode, extra=()):
    return (['-std=gnu++20', '-Os', '-ffunction-sections', '-fdata-sections', '-fno-rtti',
             '-fno-exceptions', '-D' + mode, '-I' + SRC] + ARCH[arch][1] + ['-D' + e for e in extra])


def compile_obj(arch, src, out, mode, extra=()):
    cmd = [ARCH[arch][0] + 'g++', '-c', src, '-o', out] + flags(arch, mode, extra)
    subprocess.run(cmd, check=True, capture_output=True)
    return out


def linked_size(arch, objs, tmp):
    elf = os.path.join(tmp, 'x%d.elf' % os.getpid() + str(abs(hash(tuple(objs)))))
    subprocess.run([ARCH[arch][0] + 'g++', '-nostdlib', '-nostartfiles', '-Wl,--gc-sections',
                    '-Wl,-e,ad_stub_entry', '-Wl,--unresolved-symbols=ignore-all', '-o', elf] + objs,
                   check=True, capture_output=True)
    out = subprocess.run([ARCH[arch][0] + 'size', elf], check=True, capture_output=True, text=True).stdout
    text, data = out.splitlines()[1].split()[:2]
    return int(text) + int(data)


def savers():
    found = {}
    for f in sorted(os.listdir(SRC)):
        if f.startswith('ad_') and f.endswith('.cpp') and f not in CORE:
            for name, make_text in re.findall(r'^AD_REGISTER_SAVER\("(\w+)",\s*\w+,\s*(\w+)\)',
                                               open(os.path.join(SRC, f)).read(), re.M):
                found[name] = {'file': f, 'text': make_text != 'nullptr'}
    return found


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', '..', 'all', 'esphome-savers.json')
    table = savers()
    with tempfile.TemporaryDirectory() as tmp:
        open(os.path.join(tmp, 'stub.cpp'), 'w').write(STUB)
        bases = {}
        for kind, (arch, mode) in KINDS.items():
            objs = [compile_obj(arch, os.path.join(SRC, c), os.path.join(tmp, '%s-%s.o' % (kind, c)), mode)
                    for c in CORE]
            objs.append(compile_obj(arch, os.path.join(tmp, 'stub.cpp'), os.path.join(tmp, '%s-stub.o' % kind), mode))
            bases[kind] = (objs, linked_size(arch, objs, tmp))

        def cost(kind, name, extra=(), tag=''):
            arch, mode = KINDS[kind]
            objs, base = bases[kind]
            flag = 'AD_SAVER_' + name.upper()
            o = compile_obj(arch, os.path.join(SRC, table[name]['file']),
                            os.path.join(tmp, '%s-%s%s.o' % (kind, name, tag)), mode, (flag,) + tuple(extra))
            return linked_size(arch, objs + [o], tmp) - base

        jobs = {}
        with ThreadPoolExecutor(os.cpu_count()) as pool:
            for name, info in table.items():
                for kind in KINDS:
                    if kind == 'text' and not info['text']:
                        continue
                    jobs[(name, kind, '')] = pool.submit(cost, kind, name)
            # Fish Pro: no species at all, then each one alone.
            for kind in ('colour', 'mono'):
                jobs[('fishpro', kind, 'none')] = pool.submit(cost, kind, 'fishpro', ['AD_FISHPRO_PICKED'], '-none')
            for _, fish in FISH:
                jobs[('fishpro', 'colour', fish)] = pool.submit(
                    cost, 'colour', 'fishpro', ['AD_FISHPRO_PICKED', 'AD_FISHPRO_' + fish.upper()], '-' + fish)
            for i, face in enumerate(FACES):
                for kind in ('colour', 'mono'):
                    jobs[('clocks', kind, face)] = pool.submit(
                        cost, kind, 'clocks', ['AD_CLOCKS_TYPE=%d' % i], '-' + face)
            results = {k: v.result() for k, v in jobs.items()}

    meta = json.load(open(os.path.join(HERE, 'savers.json')))
    warp = {k: results[('warp', k, '')] for k in KINDS}
    base = {board: {k: v - warp[k] for k, v in kinds.items()} for board, kinds in BUILT_WITH_WARP.items()}
    report = {'base': base, 'app_slot': APP_SLOT, 'savers': {}}
    for name, info in table.items():
        entry = dict(meta[name])
        entry.update({'text': info['text'], 'bytes': {}})
        for kind in KINDS:
            if (name, kind, '') in results:
                entry['bytes'][kind] = results[(name, kind, '')]
        report['savers'][name] = entry
    fp = report['savers']['fishpro']
    fp['options'] = {'species': {
        'none': {k: results[('fishpro', k, 'none')] for k in ('colour', 'mono')},
        'each': {fish: {'colour': results[('fishpro', 'colour', fish)] - results[('fishpro', 'colour', 'none')],
                        'mono': 0} for _, fish in FISH},
    }}
    ck = report['savers']['clocks']
    ck['options'] = {'face': {face: {k: results[('clocks', k, face)] for k in ('colour', 'mono')} for face in FACES}}
    json.dump(report, open(out_path, 'w'), indent=1, sort_keys=True)
    for name, e in report['savers'].items():
        print('%-14s %s' % (name, '  '.join('%s %7d' % (k, v) for k, v in e['bytes'].items())))


if __name__ == '__main__':
    main()
