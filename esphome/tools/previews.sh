#!/bin/sh
# previews.sh - the builder page's previews: each saver as the ESP32 draws it,
# rendered by esphome/host/render into all/esphome/.
#
#   esphome/tools/previews.sh
#
# oled/<saver>.gif   128x64 1-bit, 15 s at 20 fps, at its own size (the page
#                    scales it up with crisp pixels)
# lcd/<saver>.gif    a blue 1602, 12 s at 8 fps, for the savers that have one
#
# The clock is fixed (AD_TIME) and so is the seed, so a rerun only changes the
# files whose saver changed.
set -e
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
out="$root/all/esphome"
make -s -C "$root/esphome/host"
render="$root/esphome/host/render"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$out/oled" "$out/lcd"
export AD_TIME=1793000000
for saver in $("$render" 2>&1 | sed -n 's/^savers://p'); do
  rm -f "$tmp"/*.ppm
  "$render" "$saver" 128x64m 300 "$tmp" 20 6 > /dev/null
  ffmpeg -loglevel error -y -framerate 20 -i "$tmp/%04d.ppm" \
    -vf "split[a][b];[a]palettegen=max_colors=4:reserve_transparent=0[p];[b][p]paletteuse=dither=none" \
    "$out/oled/$saver.gif"
  rm -f "$tmp"/*.ppm
  if "$render" "$saver" lcd16x2 96 "$tmp" 8 6 > /dev/null 2>&1; then
    ffmpeg -loglevel error -y -framerate 8 -i "$tmp/%04d.ppm" \
      -vf "split[a][b];[a]palettegen=max_colors=8:reserve_transparent=0[p];[b][p]paletteuse=dither=none" \
      "$out/lcd/$saver.gif"
  fi
  echo "$saver"
done
du -sh "$out"
