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
