#!/bin/sh
# preview.sh - build one saver on its own and render it on each kind of screen,
# with a contact sheet of four frames per screen:
#
#   esphome/host/preview.sh OUTDIR SAVER ad_saver.cpp [more.cpp ...]
#
# It compiles only the shared core and the files named, so a half-finished
# saver elsewhere doesn't get in the way. SCREENS overrides the list
# (default "320x240 128x64m 72x40m lcd16x2"); FRAMES and FPS the run.
# Results: OUTDIR/SAVER-SCREEN.png, and the renderer's stats on stdout.
set -e
here=$(cd "$(dirname "$0")" && pwd)
src="$here/../components/after_dark"
out=$1; saver=$2; shift 2
mkdir -p "$out"
files=""
for f in "$@"; do
  case $f in /*) files="$files $f" ;; *) files="$files $src/$(basename "$f")" ;; esac
done
g++ -std=c++17 -O1 -Wall -Wextra -DAD_ALL_SAVERS -o "$out/render" "$here/render.cpp" \
  "$src/ad_core.cpp" "$src/ad_text.cpp" "$src/ad_draw.cpp" "$src/ad_font.cpp" "$src/ad_savers.cpp" $files -lm
for screen in ${SCREENS:-320x240 128x64m 72x40m lcd16x2}; do
  d="$out/$saver-$screen"
  rm -rf "$d"; mkdir -p "$d"
  case $screen in
    lcd*) fps=${FPS:-8}; frames=${FRAMES:-96}; zoom=100 ;;
    72x40*) fps=${FPS:-30}; frames=${FRAMES:-300}; zoom=400 ;;
    128x64*) fps=${FPS:-30}; frames=${FRAMES:-300}; zoom=300 ;;
    *) fps=${FPS:-30}; frames=${FRAMES:-300}; zoom=100 ;;
  esac
  every=$((frames / 4))
  AD_EVERY=$every "$out/render" "$saver" "$screen" "$frames" "$d" "$fps" || { echo "$screen: failed"; continue; }
  montage "$d"/*.ppm -tile x1 -filter point -resize "$zoom%" -geometry +4+4 -background '#555' \
    "$out/$saver-$screen.png"
done
