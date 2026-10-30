# Builds the desktop renderer for the savers in components/after_dark.
#   make -C esphome/host
#   make -C esphome/host gif SAVER=toasters SCREEN=320x240
#   SCREEN=128x64m for a 1-bit OLED, lcd16x2 for a character LCD

SRC = ../components/after_dark
CXXFLAGS = -std=c++17 -O2 -Wall -Wextra -DAD_ALL_SAVERS

SAVER ?= toasters
SCREEN ?= 320x240
FRAMES ?= 150
FPS ?= 30
# Blow small screens up so the GIF can be seen.
ZOOM ?= 1

render: render.cpp font5x8.h $(wildcard $(SRC)/*.cpp) $(wildcard $(SRC)/ad_*.h)
	$(CXX) $(CXXFLAGS) -o $@ render.cpp $(wildcard $(SRC)/ad_*.cpp) -lm

gif: render
	rm -rf out/$(SAVER)-$(SCREEN) && mkdir -p out/$(SAVER)-$(SCREEN)
	./render $(SAVER) $(SCREEN) $(FRAMES) out/$(SAVER)-$(SCREEN) $(FPS)
	ffmpeg -loglevel error -y -framerate $(FPS) -i out/$(SAVER)-$(SCREEN)/%04d.ppm \
	  -vf "scale=iw*$(ZOOM):ih*$(ZOOM):flags=neighbor,split[a][b];[a]palettegen[p];[b][p]paletteuse" \
	  out/$(SAVER)-$(SCREEN).gif

clean:
	rm -rf render out

.PHONY: gif clean
