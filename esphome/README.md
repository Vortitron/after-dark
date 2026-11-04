# After Dark on ESPHome has moved

The ESPHome component, its examples, the desktop renderer, the tools and the
builder now live in their own repository:
**[Vortitron/after-dark-esphome](https://github.com/Vortitron/after-dark-esphome)**,
with the builder at <https://vortitron.github.io/after-dark-esphome/>.

Configs should pull it from there:

```yaml
external_components:
  - source: github://Vortitron/after-dark-esphome@v1.0.0
    components: [after_dark]
```

`components/after_dark` stays here for now, at the v1.0.0 code, so devices
that still point at this repo (`path: esphome/components`) keep building. It
gets no more changes and will be removed once they have moved.
